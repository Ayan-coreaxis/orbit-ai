/**
 * AI evals — `npm run eval` (the dev server must be running; it uses the Anthropic key saved in
 * Super Admin). Rebuilds the Shifa Herbals test store, asks every case, grades the replies with
 * the checks in cases.ts, prints a score table and saves the full replies to evals/results/.
 *
 *   npm run eval                    all cases
 *   npm run eval -- o-price s-cod   only these case ids (or an area: orchestrator / store-chat)
 *
 * Each run spends real AI credit (roughly $0.02–0.10 per case).
 */
import { appendFileSync, mkdirSync, writeFileSync } from "fs";
import { randomBytes } from "crypto";
import { prisma } from "../lib/prisma";
import { loadStoredKeys } from "../lib/env-file";
import { getChatbotReply } from "../lib/chatbot";
import { buildFixture, storeSnapshot, type Fixture } from "./fixture";
import { CASES, type EvalCase } from "./cases";

const BASE = process.env.EVAL_BASE_URL || "http://localhost:3000";

type Result = { id: string; area: string; skill: string; pass: boolean; failures: string[]; replies: string[]; proposal: string[] | null; ms: number };

async function login(f: Fixture): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: f.email, password: f.password }) });
  if (!res.ok) throw new Error(`Eval login failed (${res.status}) — is the dev server running at ${BASE}?`);
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

type ChatMsg = { id: string; content: string; speaker: string | null; opsState?: string | null; opsSummary?: string[] | null };

async function orchestratorTurn(cookie: string, message: string): Promise<ChatMsg[]> {
  const res = await fetch(`${BASE}/api/orchestrator/chat`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ message }) });
  const data = (await res.json().catch(() => ({}))) as { messages?: ChatMsg[]; error?: string };
  if (!res.ok) throw new Error(data.error ?? `chat ${res.status}`);
  return data.messages ?? [];
}

async function runCase(c: EvalCase, f: Fixture, cookie: string): Promise<Result> {
  const t0 = Date.now();
  const failures: string[] = [];
  const replies: string[] = [];
  let proposal: string[] | null = null;
  const before = await storeSnapshot(f.businessId);

  try {
    if (c.area === "orchestrator") {
      await prisma.orchestratorMessage.deleteMany({ where: { businessId: f.businessId } }); // each case starts a fresh chat
      let last: ChatMsg[] = [];
      for (const turn of c.turns) {
        if (turn === "@dismiss") {
          const pending = [...last].reverse().find((m) => m.opsState === "pending");
          if (pending) await fetch(`${BASE}/api/orchestrator/proposal/${pending.id}`, { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: JSON.stringify({ action: "dismiss" }) });
          else failures.push("expected a proposal to dismiss, got none");
          continue;
        }
        last = await orchestratorTurn(cookie, turn);
      }
      const main = last.filter((m) => !m.speaker || m.speaker === "orchestrator");
      replies.push(...last.map((m) => `[${m.speaker ?? "orchestrator"}] ${m.content}`));
      proposal = main.flatMap((m) => (m.opsState === "pending" && m.opsSummary ? m.opsSummary : [])) || null;
      if (!proposal.length) proposal = null;
      grade(c, main.map((m) => m.content).join("\n"), proposal, failures);
      languageCheck(c, last.map((m) => m.content), failures);
    } else {
      const ref = randomBytes(12).toString("hex");
      const history: { role: "user" | "assistant"; content: string }[] = [];
      let reply = "";
      for (const turn of c.turns) {
        const r = await getChatbotReply(f.businessId, turn, history, { channel: "website", customerRef: ref });
        if (r.error) failures.push(`chatbot error: ${r.error}`);
        reply = r.reply;
        history.push({ role: "user", content: turn }, { role: "assistant", content: reply });
      }
      replies.push(reply);
      grade(c, reply, null, failures);
      languageCheck(c, [reply], failures);
    }
  } catch (e) {
    failures.push(`crashed: ${e instanceof Error ? e.message : String(e)}`);
  }

  if ((await storeSnapshot(f.businessId)) !== before) failures.push("store data CHANGED without Apply");
  return { id: c.id, area: c.area, skill: c.skill, pass: failures.length === 0, failures, replies, proposal, ms: Date.now() - t0 };
}

/** Roman-Urdu / English question → the answer (and every specialist's line) must not switch to Urdu script. */
function languageCheck(c: EvalCase, texts: string[], failures: string[]) {
  const urdu = /[؀-ۿ]/;
  if (c.turns.some((t) => urdu.test(t))) return;
  if (texts.some((t) => urdu.test(t))) failures.push("replied in Urdu script to a Roman Urdu / English message");
}

function grade(c: EvalCase, text: string, proposal: string[] | null, failures: string[]) {
  for (const r of c.check.must ?? []) if (!r.test(text)) failures.push(`reply is missing ${r}`);
  for (const r of c.check.mustNot ?? []) if (r.test(text)) failures.push(`reply must not match ${r}`);
  if (c.check.proposal === "none" && proposal) failures.push(`unexpected Apply card: ${proposal.join("; ")}`);
  if (Array.isArray(c.check.proposal)) {
    if (!proposal) failures.push("expected an Apply card, got none");
    else {
      const s = proposal.join("\n");
      for (const r of c.check.proposal) if (!r.test(s)) failures.push(`Apply card is missing ${r} (got: ${s})`);
    }
  }
}

async function main() {
  await loadStoredKeys(true);
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("No Anthropic key — save it in Super Admin > API Keys first.");

  const filters = process.argv.slice(2);
  const cases = filters.length ? CASES.filter((c) => filters.includes(c.id) || filters.includes(c.area)) : CASES;
  console.log(`Building the Shifa Herbals test store…`);
  const f = await buildFixture();
  const cookie = await login(f);
  const since = new Date();

  const results: Result[] = [];
  for (const c of cases) {
    const r = await runCase(c, f, cookie);
    results.push(r);
    console.log(`${r.pass ? "PASS" : "FAIL"}  ${c.id.padEnd(24)} ${(r.ms / 1000).toFixed(1)}s${r.pass ? "" : `\n      ${r.failures.join("\n      ")}\n      reply: ${r.replies.join(" | ").replace(/\s+/g, " ").slice(0, 300)}`}`);
  }

  const cost = await prisma.agentUsage.aggregate({ where: { businessId: f.businessId, createdAt: { gte: since } }, _sum: { costUsd: true } });
  const byArea = new Map<string, { pass: number; total: number }>();
  for (const r of results) {
    const k = `${r.area} · ${r.skill}`;
    const v = byArea.get(k) ?? { pass: 0, total: 0 };
    v.total++;
    if (r.pass) v.pass++;
    byArea.set(k, v);
  }
  const passed = results.filter((r) => r.pass).length;
  console.log("\n— Score by skill —");
  for (const [k, v] of [...byArea].sort()) console.log(`${k.padEnd(34)} ${v.pass}/${v.total}`);
  console.log(`\nTOTAL ${passed}/${results.length} (${Math.round((passed / Math.max(1, results.length)) * 100)}%) · AI cost $${(cost._sum.costUsd ?? 0).toFixed(3)}`);

  mkdirSync("evals/results", { recursive: true });
  const file = `evals/results/${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), passed, total: results.length, costUsd: cost._sum.costUsd ?? 0, results }, null, 2));
  console.log(`Full replies: ${file}`);

  // CI: a readable summary on the GitHub run page, and a red run when the score drops.
  const pct = Math.round((passed / Math.max(1, results.length)) * 100);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const md = [
      `## AI evals — ${passed}/${results.length} (${pct}%) · $${(cost._sum.costUsd ?? 0).toFixed(2)}`,
      "",
      "| Skill | Passed |",
      "|---|---|",
      ...[...byArea].sort().map(([k, v]) => `| ${k} | ${v.pass}/${v.total} |`),
      "",
      ...results.filter((r) => !r.pass).map((r) => `- ❌ **${r.id}** — ${r.failures.join("; ")}\n  > ${r.replies.join(" | ").replace(/\s+/g, " ").slice(0, 300)}`),
    ].join("\n");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
  }
  await prisma.$disconnect();
  const min = Number(process.env.EVAL_MIN_PASS_PCT ?? 0);
  if (min && pct < min) {
    console.error(`Score ${pct}% is below the required ${min}%.`);
    process.exit(1);
  }
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
