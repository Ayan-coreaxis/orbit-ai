import { keepScript } from "@/lib/script-guard";
import { anthropic, MODEL_FAST } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import { estimateCostUsd } from "@/lib/pricing";

/**
 * Real specialists this platform can actually visibly consult in the Orchestrator meeting.
 * Deliberately only the ones with a real, distinct area of expertise and a real persona
 * elsewhere in the platform (lib/mock-data.ts) — no invented department (e.g. no separate
 * "Social Media Agent") that doesn't correspond to a real agent in this system.
 */
export const CONSULTABLE_SPECIALISTS = {
  seo: {
    name: "SEO Agent",
    expertise: "Senior SEO strategist. Picks real products/pages worth optimizing, writes real titles/descriptions, thinks in search intent and ranking factors.",
  },
  content: {
    name: "Content Agent",
    expertise: "Social-first creative strategist — Reels, captions, video scripts, platform algorithm behavior (what actually gets reach right now), content cadence and production capacity.",
  },
  ads: {
    name: "Ads Agent",
    expertise: "Performance-marketing specialist — Meta/Google/TikTok ad structure, budget pacing, creative testing, when NOT to spend yet.",
  },
  pricing: {
    name: "Pricing Agent",
    expertise: "Watches real competitor pricing against this store's real prices and margin floor.",
  },
  personalization: {
    name: "Personalization Agent",
    expertise: "Real on-site product recommendations from real visitor behavior.",
  },
  experimentation: {
    name: "Experimentation Agent",
    expertise: "Real A/B testing on the storefront — what's actually statistically worth testing given current traffic.",
  },
  retention: {
    name: "Retention Agent",
    expertise: "Lifecycle/CRM — win-back flows, abandoned-cart recovery, repeat-purchase triggers.",
  },
  reviews: {
    name: "Reviews Agent",
    expertise: "Real review requests and reputation — what builds trust for a business at this stage.",
  },
} as const;

export type SpecialistId = keyof typeof CONSULTABLE_SPECIALISTS;

const NEEDS_USER_MARKER = "NEEDS_USER:";

export interface ConsultResult {
  agentId: SpecialistId;
  content: string;
  needsUser: boolean;
  needsUserText: string | null;
}

/** Cheap, fast classification — which real specialists (if any) are actually relevant to this
 * message, in the order they should speak (the one who owns the strategy/direction for this
 * topic first, the one who'd execute it second). Returns [] for routine questions — most
 * messages shouldn't trigger a meeting at all. */
export async function classifyRelevantSpecialists(businessId: string, message: string): Promise<SpecialistId[]> {
  const roster = Object.entries(CONSULTABLE_SPECIALISTS)
    .map(([id, s]) => `${id}: ${s.name} — ${s.expertise}`)
    .join("\n");

  const prompt = `A business owner just said this to their Strategy Orchestrator: "${message}"

Real specialists available to consult (id: name — expertise):
${roster}

Decide: does this message genuinely call for consulting one or more of these specific specialists before the Orchestrator replies — a real strategy question, a plan, a "let's do X" — or is it routine (a simple question, small talk, something the Orchestrator can just answer itself)?

Most messages are routine — be conservative. A direct instruction to change something specific (a price, stock, a product to add or remove, a delivery fee, a setting) is routine too: the owner has decided — return []. If specialists ARE relevant, order them so the one who owns the strategy/direction for this topic speaks first, and the one who'd actually execute it speaks second. Never include more than 3.

Respond with ONLY a JSON array of specialist ids in speaking order, e.g. ["content","ads"] — or [] if routine. No other text.`;

  try {
    const msg = await anthropic.messages.create({
      model: MODEL_FAST,
      max_tokens: 60,
      messages: [{ role: "user", content: prompt }],
    });
    await prisma.agentUsage.create({
      data: {
        businessId,
        agentId: "orchestrator-meeting-router",
        model: MODEL_FAST,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
        costUsd: estimateCostUsd(MODEL_FAST, msg.usage.input_tokens, msg.usage.output_tokens),
      },
    });
    const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "[]";
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is SpecialistId => id in CONSULTABLE_SPECIALISTS).slice(0, 3);
  } catch {
    return []; // never let a routing failure block the Orchestrator's own reply
  }
}

/** One specialist's real, visible turn in the meeting — a short, plain-text message, exactly
 * like a real teammate texting into the same conversation. Never markdown, never a fabricated
 * number. If it genuinely needs something only the business owner has, it says so plainly with
 * the NEEDS_USER marker, which the caller strips out before displaying to the owner as this
 * specialist's own words. */
export async function consultSpecialist(
  businessId: string,
  agentId: SpecialistId,
  topic: string,
  priorTurns: string,
  businessContext: string,
): Promise<ConsultResult> {
  const persona = CONSULTABLE_SPECIALISTS[agentId];
  const prompt = `You are the ${persona.name} — ${persona.expertise} You're in a real working conversation with the Strategy Orchestrator and the business owner, both of whom can see what you say.

${businessContext}

Topic under discussion: "${topic}"
${priorTurns ? `\nWhat's already been said in this meeting so far:\n${priorTurns}\n` : ""}
Give your real, specific input in AT MOST 3 short sentences (under 60 words total — this is a chat, not a report) — a real requirement, a real capacity limit, a real risk, or a real recommendation from your own expertise. Plain conversational text, no markdown, no lists, no invented numbers or trends you can't ground.
The owner decides; you advise. Never block or replace what they asked for — if you have a concern, say it in one line.
Reply in the owner's own language AND script: if they wrote Roman Urdu (Urdu in English letters), reply in Roman Urdu in English letters — never Urdu script or English unless they did.

If doing this genuinely requires something only the business owner can supply — real product photos, real brand voice, real access to an account, real specifics only they'd know — end your reply on its own new line with exactly:
${NEEDS_USER_MARKER} <the one specific thing you need>
Only use that line if the thing literally cannot be done without it. Optional details (a cost price, a photo, a description) are NOT blockers — they can be added later; never pause for them.`;

  const msg = await anthropic.messages.create({
    model: MODEL_FAST,
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });
  await prisma.agentUsage.create({
    data: {
      businessId,
      agentId: `orchestrator-meeting-${agentId}`,
      model: MODEL_FAST,
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
      costUsd: estimateCostUsd(MODEL_FAST, msg.usage.input_tokens, msg.usage.output_tokens),
    },
  });

  const raw = await keepScript(topic, msg.content[0].type === "text" ? msg.content[0].text.trim() : "", businessId, `orchestrator-meeting-${agentId}`);
  const markerIdx = raw.indexOf(NEEDS_USER_MARKER);
  if (markerIdx === -1) {
    return { agentId, content: raw, needsUser: false, needsUserText: null };
  }
  const content = raw.slice(0, markerIdx).trim();
  const needsUserText = raw.slice(markerIdx + NEEDS_USER_MARKER.length).trim();
  return { agentId, content: content || raw, needsUser: true, needsUserText: needsUserText || null };
}
