import { anthropic, MODEL } from "../lib/anthropic";
import { prisma } from "../lib/prisma";
import { draftGrowthPlan } from "../lib/strategy-planner";

/**
 * Growth-plan evals: draft a real plan for the test store (with web research, playbook and Orbit's
 * own results) and grade it — hard rules in code, plus a judge model scoring how specific and how
 * realistic it is. Returns failures (empty = pass) and a short printable summary.
 */

type Step = { text: string; owner: string; note?: string };

const CANT_DO_AS_ORBIT = /(jazzcash|easypaisa|whatsapp broadcast|bulk (sms|message)|instagram dm|^\s*(print|pack|package|deliver|hire|call|visit|photograph|shoot|dm)\b|contact (influencers|shops|retailers|creators))/i;
const CURE_CLAIM = /\b(cures?|treats?|heals?|guaranteed? (results|cure)|ilaj|shifa guaranteed)\b[^.]{0,40}\b(diabetes|sugar|bp|blood pressure|cancer|disease|infection|pain|arthritis|obesity)/i;
const STORE_FIT = /(orbit design|landing page|hero|store ?front|store page|homepage|home page|trust (section|block|badge)|bundle page|gift page)/i;
const TOO_EARLY = /(a\/b test|split test|abandoned[- ]cart|cart recovery)/i;
const DATED = /(eid|ramadan|ramzan|wedding|shaadi|winter|sardi|summer|garmi|independence|iqbal|long weekend|14 august|mother'?s day|black friday|11\.11|12\.12|payday|salary|season|festival|christmas|new year|valentine|rabi|muharram|school|exam|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2}\b|\b\d{1,2} (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)/i;

export async function gradePlan(businessId: string, note?: string): Promise<{ failures: string[]; summary: string[] }> {
  const failures: string[] = [];
  const { planId } = await draftGrowthPlan(businessId, note);
  const plan = await prisma.growthPlan.findUnique({ where: { id: planId }, include: { strategies: { orderBy: { position: "asc" } } } });
  if (!plan) return { failures: ["no plan saved"], summary: [] };

  const snap = JSON.parse(plan.snapshot ?? "{}") as { research?: { brief?: string; sources?: string[] }; stage?: string };
  const strategies = plan.strategies.map((s) => ({ ...s, stepsArr: JSON.parse(s.steps) as Step[], metricObj: JSON.parse(s.metric) as { type: string; couponCode?: string } }));
  const allText = strategies.map((s) => `${s.title} ${s.why} ${s.stepsArr.map((x) => x.text).join(" ")}`).join("\n");

  if (strategies.length < 3 || strategies.length > 6) failures.push(`${strategies.length} strategies (want 3–6)`);
  const kinds = new Set(strategies.map((s) => s.kind));
  if (kinds.size < 3) failures.push(`only ${kinds.size} kinds of strategy (${[...kinds].join(", ")}) — not varied`);
  if (TOO_EARLY.test(allText)) failures.push(`uses a tactic that needs traffic this store doesn't have: ${allText.match(TOO_EARLY)?.[0]}`);
  for (const s of strategies)
    for (const st of s.stepsArr)
      if (st.owner === "orbit" && CANT_DO_AS_ORBIT.test(st.text)) failures.push(`"${s.title}": step tagged Orbit but Orbit can't do it: ${st.text.slice(0, 120)}`);
  for (const s of strategies)
    if (s.metricObj.type === "coupon_orders" && !s.metricObj.couponCode) failures.push(`"${s.title}": coupon metric without a coupon code`);
  for (const s of strategies) if ((s.discountPct ?? 0) > 30) failures.push(`"${s.title}": ${s.discountPct}% discount — too deep`);
  if (CURE_CLAIM.test(allText)) failures.push(`health cure claim: ${allText.match(CURE_CLAIM)?.[0]}`);
  if (!strategies.some((s) => s.stepsArr.some((st) => st.owner === "orbit" && STORE_FIT.test(st.text)))) failures.push("no Orbit step shapes the storefront around the plan");
  if (!snap.research?.brief) failures.push("market research didn't run (no brief saved)");
  if (!DATED.test(allText)) failures.push("nothing tied to an upcoming date / season (research should give timing)");
  if (note && /eid/i.test(note) && !/eid/i.test(allText)) failures.push("the seller asked about Eid but the plan never mentions it");

  // judge: specific + out-of-the-box, and realistic for a tiny COD store
  let judged = "";
  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `You grade growth plans for tiny online stores in Pakistan. Store: an herbal-remedies shop in Lahore, 4 orders so far, COD, owner wants the first 50 orders.${note ? ` Owner said: "${note}".` : ""}

PLAN:
${strategies.map((s, i) => `${i + 1}. [${s.kind}] ${s.title} — ${s.why}\n   Steps: ${s.stepsArr.map((x) => `(${x.owner}) ${x.text}`).join(" | ")}`).join("\n")}

Be a strict grader. Score 1-5 each (judge the "Foundation" strategy as basics — ORIGINAL is about the other strategies):
- SPECIFIC: built on THIS store's own products, city, buyers and story — not advice that fits any shop.
- ORIGINAL: judge the core IDEA of each non-Foundation strategy — its hook, angle, timing, partner or product twist — not how it's executed. Delivering an idea through a coupon, a bundle, a landing page or WhatsApp is normal execution and does NOT make it standard. An idea is standard only when the idea itself is a generic playbook move (a thank-you card with a friend code, a good/better/best ladder, a daily WhatsApp Status routine, seeding community groups, a free-delivery threshold, a trust page). 5 = mostly fresh ideas; 3 = about half; 1 = all generic.
- REALISTIC: a one-person COD store could really do it this month; no fantasy budgets.
Reply ONLY as JSON: {"specific":n,"original":n,"realistic":n,"reason":"one sentence"}`,
        },
      ],
    });
    const t = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("") || "{}";
    const raw = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)) as Record<string, unknown>;
    const pick = (k: string) => Object.entries(raw).find(([key]) => key.toLowerCase() === k)?.[1];
    const j = { specific: Number(pick("specific")), original: Number(pick("original")), realistic: Number(pick("realistic")), reason: String(pick("reason") ?? "") };
    if (![j.specific, j.original, j.realistic].every((x) => x >= 1 && x <= 5)) throw new Error(`unreadable judge reply: ${t.slice(0, 160)}`);
    judged = `judge: specific ${j.specific}/5, original ${j.original}/5, realistic ${j.realistic}/5 — ${j.reason ?? ""}`;
    if ((j.original ?? 0) < 3) failures.push(`judge: mostly standard playbook moves (original ${j.original}/5) — ${j.reason}`);
    if ((j.specific ?? 0) < 3) failures.push(`judge: not specific enough (${j.specific}/5) — ${j.reason}`);
    if ((j.realistic ?? 0) < 3) failures.push(`judge: not realistic (${j.realistic}/5) — ${j.reason}`);
  } catch (e) {
    failures.push(`judge failed: ${e instanceof Error ? e.message : e}`);
  }

  return {
    failures,
    summary: [
      `PLAN "${plan.title}" (stage ${snap.stage ?? "?"}, research ${snap.research?.brief ? `${snap.research.sources?.length ?? 0} sources` : "none"})`,
      `diagnosis: ${plan.diagnosis}`,
      ...strategies.map((s) => `- [${s.kind}] ${s.title}`),
      judged,
    ],
  };
}
