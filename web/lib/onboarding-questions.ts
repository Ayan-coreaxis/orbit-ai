import { anthropic, MODEL_FAST } from "@/lib/anthropic";

/**
 * Onboarding asks each seller a few questions written for THEIR business (a jewellery maker gets
 * different questions from a phone-accessories dropshipper). Claude writes them from what the
 * seller told us so far; the answers are saved on the business and every agent reads them.
 * If AI isn't available the seller gets a solid fixed set instead — onboarding never blocks.
 */

export type OnboardingQuestion = {
  id: string;
  question: string;
  why: string; // one line: how Orbit will use the answer
  type: "choice" | "text";
  options?: string[];
  placeholder?: string;
};

export type OnboardingAnswer = { question: string; answer: string };

export const FALLBACK_QUESTIONS: OnboardingQuestion[] = [
  {
    id: "customer",
    question: "Who usually buys from you?",
    why: "So content, ads and chat replies speak to the right people.",
    type: "text",
    placeholder: "e.g. women 22–35 in Lahore and Karachi who shop on Instagram",
  },
  {
    id: "price",
    question: "What's your typical order value?",
    why: "Shapes offers, bundles and free-delivery thresholds.",
    type: "choice",
    options: ["Under 2,000", "2,000–5,000", "5,000–15,000", "Over 15,000"],
  },
  {
    id: "bestseller",
    question: "Which product sells best right now, and why do you think it does?",
    why: "Your AI team starts by pushing what already works.",
    type: "text",
    placeholder: "e.g. the linen co-ord set — people love the fit",
  },
  {
    id: "goal",
    question: "What matters most in the next 3 months?",
    why: "Sets what the Orchestrator plans around first.",
    type: "choice",
    options: ["More orders", "Bigger orders", "More repeat customers", "Launch new products", "Fewer returns / cancelled COD"],
  },
  {
    id: "delivery",
    question: "Where do you deliver, and how do most customers pay?",
    why: "Checkout, COD checks and delivery messages are set up to match.",
    type: "text",
    placeholder: "e.g. all of Pakistan, mostly cash on delivery",
  },
];

const QUESTIONS_TOOL = {
  name: "ask_seller",
  description: "The onboarding questions to ask this seller.",
  input_schema: {
    type: "object" as const,
    properties: {
      questions: {
        type: "array",
        minItems: 4,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "short snake_case id" },
            question: { type: "string", description: "Plain, friendly, one sentence. Under 90 characters." },
            why: { type: "string", description: "One short line: how Orbit will use the answer." },
            type: { type: "string", enum: ["choice", "text"] },
            options: { type: "array", items: { type: "string" }, description: "3–6 short options, only for type=choice. The seller can pick SEVERAL, so don't add catch-alls like \"A mix of all\" or \"All of the above\"." },
            placeholder: { type: "string", description: "Example answer for type=text, specific to this business" },
          },
          required: ["id", "question", "why", "type"],
        },
      },
    },
    required: ["questions"],
  },
};

export async function generateOnboardingQuestions(input: { name: string; niche: string; businessModel?: string | null; website?: string | null }): Promise<{ questions: OnboardingQuestion[]; ai: boolean }> {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "paste_your_key_here") return { questions: FALLBACK_QUESTIONS, ai: false };
  try {
    const msg = await anthropic.messages.create({
      model: MODEL_FAST,
      max_tokens: 1200,
      tools: [QUESTIONS_TOOL],
      tool_choice: { type: "tool", name: QUESTIONS_TOOL.name },
      messages: [
        {
          role: "user",
          content: `A new seller is setting up Orbit, an AI team that runs their online store, content, ads and customer chat.
Business: ${input.name.slice(0, 120)}
Sells: ${input.niche.slice(0, 300)}
How they work: ${input.businessModel ?? "not stated"}
Website: ${input.website?.slice(0, 200) || "none"}

Write 4–5 questions that only THIS seller can answer and that would most change how an expert would grow THIS business — their buyers, what sells and why, price points, what makes them different, seasons/occasions, delivery and payment, their main goal. Make them specific to what they sell (use their product words). Don't ask for anything we already know above, anything about competitors or social handles (asked later), or anything sensitive (revenue numbers, personal details). Prefer "choice" when the answer has natural buckets; money amounts in the local currency if the website suggests one. Keep the language simple.`,
        },
      ],
    }, { timeout: 25000 });
    const block = msg.content.find((c) => c.type === "tool_use");
    const raw = (block && block.type === "tool_use" ? (block.input as { questions?: OnboardingQuestion[] }).questions : null) ?? [];
    const questions = raw
      .filter((q) => q && typeof q.question === "string" && q.question.trim())
      .slice(0, 5)
      .map((q, i) => ({
        id: String(q.id || `q${i + 1}`).replace(/[^a-z0-9_]/gi, "_").slice(0, 40),
        question: q.question.trim().slice(0, 200),
        why: String(q.why ?? "").trim().slice(0, 160),
        type: q.type === "choice" && Array.isArray(q.options) && q.options.length >= 2 ? ("choice" as const) : ("text" as const),
        options: q.type === "choice" && Array.isArray(q.options) ? q.options.map((o) => String(o).slice(0, 60)).slice(0, 6) : undefined,
        placeholder: q.placeholder ? String(q.placeholder).slice(0, 120) : undefined,
      }));
    return questions.length >= 3 ? { questions, ai: true } : { questions: FALLBACK_QUESTIONS, ai: false };
  } catch {
    return { questions: FALLBACK_QUESTIONS, ai: false };
  }
}

/** Clean what the browser sent before saving it. */
export function cleanAnswers(input: unknown): OnboardingAnswer[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((x) => x as { question?: unknown; answer?: unknown })
    .filter((x) => typeof x.question === "string" && typeof x.answer === "string" && x.answer.trim())
    .slice(0, 8)
    .map((x) => ({ question: String(x.question).trim().slice(0, 200), answer: String(x.answer).trim().slice(0, 500) }));
}

/** The seller's own answers, as a prompt block for any agent. Empty when there are none. */
export function sellerAnswersBlock(raw: string | null | undefined): string {
  let list: OnboardingAnswer[] = [];
  try {
    list = raw ? cleanAnswers(JSON.parse(raw)) : [];
  } catch {
    list = [];
  }
  if (!list.length) return "";
  return `\nWhat the seller told us about their business (their own words at onboarding — trust these over guesses):\n${list.map((a) => `- ${a.question} → ${a.answer}`).join("\n")}\n`;
}
