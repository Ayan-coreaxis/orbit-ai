/**
 * Instagram comment-to-DM — the pure decisions: does a comment match a rule, what the DM says,
 * and whether this commenter may get another one right now. No database, no network.
 */

export interface RuleLike {
  id: string;
  keywords: string[];
  /** Instagram media id; null = every post. */
  postId: string | null;
  active: boolean;
}

export const MAX_KEYWORDS = 20;
export const MAX_DM_CHARS = 900; // Instagram allows 1000
export const MAX_PUBLIC_REPLY_CHARS = 200;

/** Lower-case words of a text: letters and digits of any script, everything else is a gap. */
export function words(text: string): string[] {
  return text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
}

/** Clean what the seller typed: "Price, kitna ,  ORDER karna" → ["price", "kitna", "order karna"]. */
export function normalizeKeywords(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : typeof input === "string" ? input.split(/[,\n]/) : [];
  const out: string[] = [];
  for (const k of raw) {
    const clean = words(String(k ?? "")).join(" ").slice(0, 40).trim();
    if (clean && !out.includes(clean)) out.push(clean);
  }
  return out.slice(0, MAX_KEYWORDS);
}

/** The keyword a comment contains as whole word(s), or null. "price?" matches "price"; "priceless" doesn't. */
export function matchKeyword(comment: string, keywords: string[]): string | null {
  const w = words(comment);
  if (w.length === 0) return null;
  for (const keyword of keywords) {
    const k = words(keyword);
    if (k.length === 0) continue;
    for (let i = 0; i + k.length <= w.length; i++) {
      if (k.every((part, j) => w[i + j] === part)) return keyword;
    }
  }
  return null;
}

/** The rule that answers this comment: active, keyword present; a rule for this exact post wins over an all-posts rule. */
export function pickRule<R extends RuleLike>(rules: R[], comment: string, mediaId: string | null): { rule: R; keyword: string } | null {
  let fallback: { rule: R; keyword: string } | null = null;
  for (const rule of rules) {
    if (!rule.active) continue;
    if (rule.postId && rule.postId !== mediaId) continue;
    const keyword = matchKeyword(comment, rule.keywords);
    if (!keyword) continue;
    if (rule.postId) return { rule, keyword };
    fallback ??= { rule, keyword };
  }
  return fallback;
}

export interface TemplateValues {
  product?: string | null;
  price?: string | null;
  link?: string | null;
}

/**
 * Fill {{product}} {{price}} {{link}} with real values. A placeholder with no real value is
 * never guessed: a line whose placeholders are all empty is dropped ("Price: {{price}}" with no
 * product disappears), otherwise just the empty placeholder is removed.
 */
export function fillTemplate(template: string, values: TemplateValues, max = MAX_DM_CHARS): string {
  const lines: string[] = [];
  for (const line of template.replace(/\r\n?/g, "\n").split("\n")) {
    let used = 0;
    let filled = 0;
    const out = line.replace(/\{\{\s*(product|price|link)\s*\}\}/gi, (_m, key: string) => {
      used++;
      const v = (values[key.toLowerCase() as keyof TemplateValues] ?? "").toString().trim();
      if (v) filled++;
      return v;
    });
    if (used > 0 && filled === 0) continue;
    lines.push(used > filled ? out.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([,.!?])/g, "$1").replace(/[ \t]*[:\-–—][ \t]*$/, "").trim() : out.trim());
  }
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

/** Which placeholders a template uses — the UI warns when one has nothing to fill it. */
export function templatePlaceholders(template: string): ("product" | "price" | "link")[] {
  const found = new Set<"product" | "price" | "link">();
  for (const m of template.matchAll(/\{\{\s*(product|price|link)\s*\}\}/gi)) found.add(m[1].toLowerCase() as "product" | "price" | "link");
  return [...found];
}

export const RATE_LIMIT = { cooldownMs: 2 * 60_000, maxPerDay: 3 } as const;

export type SendDecision = { send: true } | { send: false; reason: "own_comment" | "duplicate" | "rate_limited" };

/**
 * May this comment get a DM? No for the seller's own comments, for a comment already handled,
 * and when this commenter was just messaged (one DM per 2 minutes, three per 24 hours).
 */
export function decideSend(input: {
  commenterId: string;
  ownIds: (string | null | undefined)[];
  alreadyHandled: boolean;
  /** When this commenter was sent earlier comment-DMs by this store. */
  priorSentAt: Date[];
  now: Date;
}): SendDecision {
  if (input.ownIds.filter(Boolean).includes(input.commenterId)) return { send: false, reason: "own_comment" };
  if (input.alreadyHandled) return { send: false, reason: "duplicate" };
  const now = input.now.getTime();
  const lastDay = input.priorSentAt.map((d) => d.getTime()).filter((t) => now - t < 24 * 3600_000);
  if (lastDay.length >= RATE_LIMIT.maxPerDay) return { send: false, reason: "rate_limited" };
  if (lastDay.some((t) => now - t < RATE_LIMIT.cooldownMs)) return { send: false, reason: "rate_limited" };
  return { send: true };
}
