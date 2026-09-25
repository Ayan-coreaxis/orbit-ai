import { prisma } from "@/lib/prisma";
import { anthropic, MODEL_FAST } from "@/lib/anthropic";
import { estimateCostUsd } from "@/lib/pricing";
import type { Skill } from "@prisma/client";

/**
 * Business-level skills — named blocks of seller guidance, not tied to any tool or agent. When a
 * specialist runs, `loadSkillContext` picks the ones relevant to that cycle's task (plus any
 * `alwaysOn`), appends them to the prompt for that run only, and forgets them afterwards.
 */

export async function getSkills(businessId: string): Promise<Skill[]> {
  return prisma.skill.findMany({ where: { businessId }, orderBy: { createdAt: "desc" } });
}

export function publicSkill(s: Skill) {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    instructions: s.instructions,
    alwaysOn: s.alwaysOn,
    enabled: s.enabled,
    createdAt: s.createdAt,
  };
}

/**
 * Returns the prompt fragment to append for this agent run, plus the names actually loaded (for
 * honest logging). Empty when nothing applies. `alwaysOn` skills skip the router entirely; the
 * rest go through one cheap Haiku call, which returns [] freely and on any error.
 */
export async function loadSkillContext(
  businessId: string,
  agentId: string,
  agentName: string,
  taskContext: string,
): Promise<{ text: string; loadedNames: string[] }> {
  const all = (await getSkills(businessId)).filter((s) => s.enabled);
  if (all.length === 0) return { text: "", loadedNames: [] };

  const alwaysOn = all.filter((s) => s.alwaysOn);
  const optional = all.filter((s) => !s.alwaysOn);

  let picked: Skill[] = [...alwaysOn];

  if (optional.length > 0) {
    const list = optional.map((s, i) => `${i + 1}. id=${s.id} — "${s.name}": ${s.description}`).join("\n");
    const prompt = `You decide which of the business owner's skills apply to a task. The "${agentName}" agent is about to work on:

${taskContext.slice(0, 1500)}

Available skills:
${list}

Return a JSON array of the id strings for ONLY the skills genuinely relevant to THIS task. Return [] if none clearly apply. Respond with ONLY the JSON array.`;
    try {
      const msg = await anthropic.messages.create({
        model: MODEL_FAST,
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      });
      await prisma.agentUsage.create({
        data: {
          businessId,
          agentId: `${agentId}-skill-router`,
          model: MODEL_FAST,
          inputTokens: msg.usage.input_tokens,
          outputTokens: msg.usage.output_tokens,
          costUsd: estimateCostUsd(MODEL_FAST, msg.usage.input_tokens, msg.usage.output_tokens),
        },
      });
      const raw = msg.content[0]?.type === "text" ? msg.content[0].text : "[]";
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      if (Array.isArray(parsed)) {
        const wanted = new Set(parsed.filter((x): x is string => typeof x === "string"));
        picked = picked.concat(optional.filter((s) => wanted.has(s.id)));
      }
    } catch {
      /* no skills this run is always safe */
    }
  }

  if (picked.length === 0) return { text: "", loadedNames: [] };

  const text =
    "\nSkills the business owner wants you to follow for this task:\n" +
    picked.map((s) => `## ${s.name}\n${s.instructions.trim()}`).join("\n\n");
  return { text, loadedNames: picked.map((s) => s.name) };
}
