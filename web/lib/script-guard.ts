import { anthropic, MODEL_FAST } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import { estimateCostUsd } from "@/lib/pricing";

const URDU_SCRIPT = /[؀-ۿ]/;

/**
 * Pakistani sellers and shoppers mostly write Roman Urdu (Urdu in English letters). Models — the
 * fast one especially — sometimes drift into Urdu script mid-reply ("Rs 150 ہے") even when told not
 * to. The evals caught it, so this is enforced in code: when the person wrote without Urdu script
 * and the reply has some, the reply is rewritten once in English letters. Best-effort — on any
 * failure the original reply is kept.
 */
export async function keepScript(userText: string, reply: string, businessId: string, agentId: string): Promise<string> {
  if (!reply || URDU_SCRIPT.test(userText) || !URDU_SCRIPT.test(reply)) return reply;
  try {
    const msg = await anthropic.messages.create({
      model: MODEL_FAST,
      max_tokens: 1200,
      messages: [
        {
          role: "user",
          content: `Rewrite this chat message so it uses ONLY English letters: every part in Urdu script becomes Roman Urdu (Urdu written in English letters, e.g. "hai", "mein", "aap"). Keep the meaning, numbers, line breaks and **bold** exactly. Output only the rewritten message.\n\n${reply}`,
        },
      ],
    });
    await prisma.agentUsage
      .create({
        data: {
          businessId,
          agentId: `${agentId}-script`,
          model: MODEL_FAST,
          inputTokens: msg.usage.input_tokens,
          outputTokens: msg.usage.output_tokens,
          costUsd: estimateCostUsd(MODEL_FAST, msg.usage.input_tokens, msg.usage.output_tokens),
        },
      })
      .catch(() => {});
    const out = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    return out && !URDU_SCRIPT.test(out) ? out : reply;
  } catch {
    return reply;
  }
}
