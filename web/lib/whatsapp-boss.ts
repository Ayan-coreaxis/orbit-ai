import type { BriefingTask, Lang } from "@/lib/daily-briefing";

/**
 * "Orbit on WhatsApp" — the pure parts: who counts as the owner, what a reply means, and how
 * messages are worded and kept short. No database or network here (see whatsapp-boss-server.ts),
 * so all of it is tested directly.
 */

/** Longest WhatsApp message Orbit sends the owner; longer answers end with a dashboard link. */
export const WA_MAX = 1200;
/** WhatsApp only delivers free-form text within 24 hours of the owner's last message. */
export const REPLY_WINDOW_MS = 24 * 3_600_000;
/** A proposal bigger than this is reviewed in the dashboard, never applied from WhatsApp. */
const MAX_PROPOSAL_LINES = 8;
const MAX_PROPOSAL_CHARS = 800;

const T = (lang: Lang, en: string, ur: string) => (lang === "ur" ? ur : en);

// ---------------------------------------------------------------------------------------------
// Owner number
// ---------------------------------------------------------------------------------------------

/**
 * One canonical form for a phone ("+923001234567") however it was typed: "0300 1234567",
 * "+92 300-1234567", "923001234567", "00923001234567", "whatsapp:+923001234567". Numbers from
 * other countries must carry their country code. Null when it can't be a full number.
 */
export function ownerNumberKey(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().replace(/^whatsapp:/i, "");
  let d = s.replace(/\D/g, "");
  if (!d) return null;
  const international = s.startsWith("+") || d.startsWith("00");
  if (d.startsWith("00")) d = d.slice(2);
  // Pakistani mobile in any spelling → +92 3xx xxxxxxx
  if (/^92(3\d{9})$/.test(d)) return `+${d}`;
  if (!international && /^03\d{9}$/.test(d)) return `+92${d.slice(1)}`;
  if (!international && /^3\d{9}$/.test(d)) return `+92${d}`;
  // "+92 0300 1234567" — a common slip
  if (/^920(3\d{9})$/.test(d)) return `+92${d.slice(3)}`;
  if (d.startsWith("92") || d.startsWith("0")) return null; // Pakistani but not a full mobile, or a local number with no country code
  if (!international && d.length < 11) return null; // no country code — can't be matched safely
  return d.length >= 8 && d.length <= 15 ? `+${d}` : null;
}

/** Strict: the sender is the owner only when both numbers are complete and identical. */
export function isOwnerNumber(from: string | null | undefined, stored: string | null | undefined): boolean {
  const a = ownerNumberKey(from);
  const b = ownerNumberKey(stored);
  return !!a && !!b && a === b;
}

// ---------------------------------------------------------------------------------------------
// What the owner's reply means
// ---------------------------------------------------------------------------------------------

export type OwnerCommand =
  | { type: "task"; n: number }
  /** `explicit` = the word APPLY itself; "yes / haan" only count when a proposal is waiting. */
  | { type: "apply"; explicit: boolean }
  | { type: "dismiss" }
  | { type: "stop" }
  | { type: "start" }
  | { type: "chat" };

const APPLY_WORDS = /^(y|yes|yep|yeah|yes please|haan|han|haa|ha|haanji|haan ji|ji|jee|ji haan|ji han|g haan|bilkul|kar do|kardo|kr do|krdo|kar dein|kar den|kar dain|kardein|kar dijiye|laga do|lagado|theek hai kar do|haan kar do|han kar do|ok kar do)$/;
const EXPLICIT_APPLY = /^(apply|apply it|apply this|apply kar do|apply kardo|apply karo|apply kr do)$/;
const DISMISS_WORDS = /^(n|no|nope|no thanks|nahi|nahin|nai|nhi|nahi chahiye|nahi karo|mat karo|mat kro|rehne do|rehnay do|chhor do|chor do|chhoro|cancel|cancel it|cancel kar do|drop|drop it|dismiss)$/;
const STOP_WORDS = /^(stop|unsubscribe|band karo|band kar do|band kardo|stop karo)$/;
const START_WORDS = /^(start|subscribe|shuru karo|shuru kar do|chalu karo|chalu kar do)$/;

/** Lower-case, no punctuation or emoji around the words, single spaces. */
function tidy(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s#]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseOwnerCommand(text: string): OwnerCommand {
  const t = tidy(text);
  if (!t) return { type: "chat" };
  const num = t.match(/^(?:#|task |number |kaam )?\s?(\d{1,2})$/);
  if (num) {
    const n = Number(num[1]);
    return n >= 1 ? { type: "task", n } : { type: "chat" };
  }
  if (STOP_WORDS.test(t)) return { type: "stop" };
  if (START_WORDS.test(t)) return { type: "start" };
  if (EXPLICIT_APPLY.test(t)) return { type: "apply", explicit: true };
  if (APPLY_WORDS.test(t)) return { type: "apply", explicit: false };
  if (DISMISS_WORDS.test(t)) return { type: "dismiss" };
  return { type: "chat" };
}

/** Can a free-form (non-template) message still reach the owner? */
export function withinReplyWindow(lastInboundAt: Date | null | undefined, now: Date = new Date()): boolean {
  return !!lastInboundAt && now.getTime() - lastInboundAt.getTime() < REPLY_WINDOW_MS - 60_000;
}

// ---------------------------------------------------------------------------------------------
// Wording
// ---------------------------------------------------------------------------------------------

function oneLine(s: string): string {
  return (s || "").replace(/\s+/g, " ").trim();
}

function cut(s: string, max: number): string {
  const t = oneLine(s);
  if (t.length <= max) return t;
  if (max <= 1) return "";
  const head = t.slice(0, max - 1);
  const sp = head.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? head.slice(0, sp) : head).trimEnd()}…`;
}

/** The chat's light formatting → WhatsApp's: **bold** becomes *bold*, bullets stay. */
export function toWhatsAppText(text: string): string {
  return (text || "")
    .replace(/\*\*([^*\n]+)\*\*/g, "*$1*")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Keeps a message under `max`; a longer one is cut at a word and ends with the dashboard link. */
export function clampForWhatsApp(text: string, lang: Lang, dashboardUrl: string, max: number = WA_MAX): string {
  const t = (text || "").trim();
  if (t.length <= max) return t;
  const tail = `\n\n${T(lang, "Full reply in your dashboard", "Poora jawab dashboard mein")}: ${dashboardUrl}`;
  const room = Math.max(0, max - tail.length - 1);
  let head = t.slice(0, room);
  const brk = Math.max(head.lastIndexOf("\n"), head.lastIndexOf(". "), head.lastIndexOf(" "));
  if (brk > room * 0.6) head = head.slice(0, brk);
  return `${head.trimEnd()}…${tail}`;
}

const briefingFooter = (lang: Lang) =>
  T(lang, "Reply 1, 2… and I'll prepare it. Reply STOP to turn these off.", "1, 2… bhejein, main tayyar kar dunga. Band karne ke liye STOP bhejein.");

/** The daily store check as a WhatsApp message: greeting, numbered tasks (title + one line), how to reply. */
export function formatBriefingMessage(tasks: BriefingTask[], lang: Lang, storeName: string, max: number = WA_MAX): string {
  const store = cut(storeName || T(lang, "your store", "aap ka store"), 60);
  if (!tasks.length)
    return T(
      lang,
      `Good morning! Orbit checked ${store} — nothing needs you today.\n\nReply STOP to turn these off.`,
      `Subah bakhair! Orbit ne ${store} check kiya — aaj aap ke liye koi zaroori kaam nahi.\n\nBand karne ke liye STOP bhejein.`,
    );
  const head = T(
    lang,
    `Good morning! Orbit checked ${store} — ${tasks.length} ${tasks.length === 1 ? "thing" : "things"} worth doing today:`,
    `Subah bakhair! Orbit ne ${store} check kiya — aaj ${tasks.length} kaam karne layak hain:`,
  );
  const build = (titleMax: number, whyMax: number) =>
    [head, ...tasks.map((t, i) => `${i + 1}. *${cut(t.title, titleMax)}*${whyMax ? `\n${cut(t.why, whyMax)}` : ""}`), briefingFooter(lang)].join("\n\n");
  for (const [titleMax, whyMax] of [[90, 150], [90, 110], [80, 70], [70, 0], [40, 0]] as const) {
    const msg = build(titleMax, whyMax);
    if (msg.length <= max) return msg;
  }
  return build(40, 0).slice(0, max);
}

/**
 * Variables for the approved `daily_briefing` template (store name, number of tasks, the tasks on
 * one line — a template variable can't contain a new line). Order must match whatsapp-templates.ts.
 */
export function briefingTemplateVars(tasks: BriefingTask[], lang: Lang, storeName: string): string[] {
  const store = cut(storeName || T(lang, "your store", "aap ka store"), 60);
  if (!tasks.length) return [store, "0", T(lang, "nothing urgent today", "aaj koi zaroori kaam nahi")];
  const line = (titleMax: number, whyMax: number) =>
    tasks.map((t, i) => `${i + 1}) ${cut(t.title, titleMax)}${whyMax ? ` — ${cut(t.why, whyMax)}` : ""}`).join("  ");
  let list = line(40, 0);
  for (const [titleMax, whyMax] of [[90, 90], [80, 50], [70, 0]] as const) {
    const l = line(titleMax, whyMax);
    if (l.length <= 700) {
      list = l;
      break;
    }
  }
  return [store, String(tasks.length), list.slice(0, 700)];
}

/** Can this proposal be shown in full on WhatsApp? Only then may the owner APPLY it from there. */
export function proposalFitsWhatsApp(summary: string[]): boolean {
  return summary.length > 0 && summary.length <= MAX_PROPOSAL_LINES && summary.map(oneLine).join(" ").length <= MAX_PROPOSAL_CHARS;
}

/**
 * The Orchestrator's answer for WhatsApp. With a proposal, every line of it is shown in full plus
 * how to approve — the answer above it is what gets shortened, never the change being approved.
 * A proposal too big to show in full is sent to the dashboard instead of offering APPLY.
 */
export function formatOwnerReply(reply: string, opts: { lang: Lang; dashboardUrl: string; proposal?: string[] | null; max?: number }): { text: string; offersApply: boolean } {
  const max = opts.max ?? WA_MAX;
  const body = toWhatsAppText(reply);
  const proposal = (opts.proposal ?? []).map(oneLine).filter(Boolean);
  if (!proposal.length) return { text: clampForWhatsApp(body, opts.lang, opts.dashboardUrl, max), offersApply: false };
  const fits = proposalFitsWhatsApp(proposal);
  const tail = fits
    ? `${T(opts.lang, "Proposed change", "Proposal")}:\n${proposal.map((l) => `- ${l}`).join("\n")}\n\n${T(opts.lang, "Reply APPLY to make this change, or NO to drop it.", "Yeh change karne ke liye APPLY bhejein, ya chhorne ke liye NO.")}`
    : `${T(opts.lang, `This proposal has ${proposal.length} changes — too many to show here. Review and Apply it in your dashboard`, `Is proposal mein ${proposal.length} changes hain — yahan poore nahi aa sakte. Dashboard mein dekh kar Apply karein`)}: ${opts.dashboardUrl}`;
  const room = max - tail.length - 2;
  const head = room >= 80 ? (body.length <= room ? body : cut(body, room)) : "";
  return { text: [head, tail].filter(Boolean).join("\n\n"), offersApply: fits };
}

/** "Here's what changed" after APPLY. */
export function formatApplied(applied: string[], lang: Lang, dashboardUrl: string, max: number = WA_MAX): string {
  const lines = applied.map(oneLine).filter(Boolean);
  const text = lines.length
    ? `${T(lang, "Done — applied", "Ho gaya — apply kar diya")}:\n${lines.map((l) => `- ${l}`).join("\n")}`
    : T(lang, "Done — applied.", "Ho gaya — apply kar diya.");
  return clampForWhatsApp(text, lang, dashboardUrl, max);
}

/** The short fixed replies. */
export function ownerText(key: "stopped" | "started" | "dismissed" | "nothing_pending" | "working" | "ambiguous" | "no_briefing", lang: Lang): string {
  switch (key) {
    case "stopped":
      return T(lang, "Done — Orbit won't message you here any more. Reply START to turn it back on.", "Theek hai — ab Orbit yahan message nahi karega. Dobara shuru karne ke liye START bhejein.");
    case "started":
      return T(
        lang,
        "Orbit on WhatsApp is on. Every morning I'll send your store check here — reply with a task number and I'll prepare it. Reply STOP any time.",
        "Orbit on WhatsApp on ho gaya. Har subah store check yahan bhejunga — task ka number bhejein, main tayyar kar dunga. Kabhi bhi STOP bhej dein.",
      );
    case "dismissed":
      return T(lang, "Dropped — nothing was changed.", "Chhor diya — kuch nahi badla.");
    case "nothing_pending":
      return T(lang, "There's no change waiting for your APPLY here. Reply with a task number or tell me what you need.", "Yahan koi change APPLY ke intezar mein nahi. Task ka number bhejein ya batayein kya karna hai.");
    case "working":
      return T(lang, "On it — give me a minute.", "Kar raha hoon — ek minute.");
    case "ambiguous":
      return T(lang, "This number is the owner number on more than one Orbit store, so I can't tell which one you mean. Please use the dashboard.", "Yeh number ek se zyada Orbit stores ka owner number hai, isliye pata nahi chal raha kaun sa store. Dashboard use karein.");
    case "no_briefing":
      return T(lang, "There's no store check from today to pick a task from. Tell me what you need instead.", "Aaj ka koi store check nahi jis se task uthaun. Seedha batayein kya karna hai.");
  }
}

export function noSuchTaskText(n: number, count: number, lang: Lang): string {
  return T(lang, `There's no task ${n} — today's check has ${count}. Reply 1${count > 1 ? `–${count}` : ""}.`, `Task ${n} nahi hai — aaj ke check mein ${count} hain. 1${count > 1 ? `–${count}` : ""} bhejein.`);
}
