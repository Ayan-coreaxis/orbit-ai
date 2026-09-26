import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, ensureModelConfigLoaded, MODEL } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import { estimateCostUsd as claudeCost } from "@/lib/pricing";
import { DIRECTOR_GUIDE } from "@/lib/studio/director-guide";
import { STUDIO_AGENT_IDS } from "@/lib/studio/config";
import { choiceLabel, choicePrompt, type StudioFormat, type StudioInput, type Aspect } from "@/lib/studio/formats";
import type { StudioRef } from "@/lib/studio/refs";

/**
 * The director plans one piece before anything is paid for: a short concept, a storyboard the
 * seller can read, the exact prompts for the image / video model, the spoken script and a caption.
 * The seller sees this plan first and only then presses Generate.
 */

export type Shot = { time: string; what: string; camera?: string; sound?: string };

export type StudioBrief = {
  title: string;
  concept: string;
  shots: Shot[];
  imagePrompt: string;
  videoPrompt: string | null;
  script: string | null;
  caption: string;
  headsUp: string | null;
  aspect: Aspect;
  seconds: number | null;
};

const BRIEF_TOOL: Anthropic.Messages.Tool = {
  name: "studio_plan",
  description: "The plan for this one image or video.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "3-6 word name for this piece, e.g. 'Mango jam morning reel'." },
      concept: { type: "string", description: "1-2 plain sentences for the seller: what they will get and why it will work." },
      shots: {
        type: "array",
        description: "Video: 1-4 shots with timing, what happens, camera, sound. Image: 2-4 bullets of the composition (time = '').",
        items: {
          type: "object",
          properties: { time: { type: "string" }, what: { type: "string" }, camera: { type: "string" }, sound: { type: "string" } },
          required: ["time", "what"],
        },
      },
      image_prompt: { type: "string", description: "The exact prompt for the image model. For a video: the prompt for its FIRST FRAME." },
      video_prompt: { type: "string", description: "Video only: the exact prompt for the video model (motion, camera, sound, speech). Empty for images." },
      script: { type: "string", description: "Only if someone speaks: the exact spoken words. Empty otherwise." },
      caption: { type: "string", description: "Ready-to-post social caption with 3-6 hashtags." },
      heads_up: { type: "string", description: "Honest warning if something may not come out perfectly. Empty if none." },
    },
    required: ["title", "concept", "shots", "image_prompt", "caption"],
  },
};

const strip = (html: string | null | undefined) => (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export async function planBrief(opts: {
  businessId: string;
  format: StudioFormat;
  input: StudioInput;
  refs: StudioRef[];
  change?: string;
  previous?: StudioBrief | null;
}): Promise<StudioBrief> {
  const { businessId, format, input, refs } = opts;
  const [biz, product] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { name: true, niche: true, storeCurrency: true } }),
    input.productId ? prisma.product.findFirst({ where: { id: input.productId, businessId }, select: { name: true, description: true, price: true } }) : null,
  ]);
  const aspect: Aspect = input.aspect ?? format.aspects[0];
  const seconds = format.kind === "video" ? (format.seconds ?? 8) : null;

  const lines: string[] = [];
  lines.push(`BUSINESS: ${biz?.name ?? "the store"} — sells ${biz?.niche ?? "products"}.`);
  lines.push(`FORMAT: ${format.name} (${format.kind}${seconds ? `, ${seconds} seconds, ${format.audio === "voice" ? "someone speaks" : "music/sound only"}` : ""}), aspect ${aspect}.`);
  lines.push(`WHAT WE PROMISED THE SELLER: ${format.look.join(" ")}`);
  if (format.keyframe) lines.push("PIPELINE: the image model first makes the first frame (with the real product photo as reference), then the video model animates it.");
  else if (format.kind === "video") lines.push("PIPELINE: the seller's photo IS the first frame (image_prompt is not used — write a one-line description of the photo there); the video model animates it.");
  if (format.edit) lines.push("PIPELINE: this is an EDIT of the seller's photo (reference image 1), not a new scene.");
  if (product) lines.push(`PRODUCT: ${product.name}${product.description ? ` — ${strip(product.description).slice(0, 500)}` : ""}`);
  for (const [k, v] of Object.entries(input.text ?? {})) lines.push(`SELLER — ${k}: ${v}`);
  for (const [k, v] of Object.entries(input.choice ?? {})) {
    const list = k as "camera" | "style" | "avatar" | "language" | "mood";
    if (v === "auto") continue;
    const p = choicePrompt(list, v);
    lines.push(`SELLER CHOSE ${k}: ${choiceLabel(list, v)}${p ? ` (${p})` : ""}`);
  }
  lines.push(
    refs.length
      ? `REFERENCE IMAGES (sent to the image model in this order): ${refs.map((r, i) => `image ${i + 1} = ${r.label}`).join("; ")}.`
      : "REFERENCE IMAGES: none.",
  );
  if (opts.previous && opts.change) {
    lines.push(`PREVIOUS PLAN (the seller wants changes): ${JSON.stringify({ concept: opts.previous.concept, shots: opts.previous.shots, script: opts.previous.script })}`);
    lines.push(`SELLER'S CHANGE REQUEST: ${opts.change}`);
  }

  // The director looks at the real photos too (at most 3) so the plan fits the actual product.
  const seen: Anthropic.Messages.ContentBlockParam[] = [];
  for (const r of refs.slice(0, 3)) {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(r.mime)) continue;
    seen.push({ type: "text", text: `Reference image ${refs.indexOf(r) + 1}: ${r.label}` });
    seen.push({ type: "image", source: { type: "base64", media_type: r.mime as "image/png", data: r.data.toString("base64") } });
  }

  await ensureModelConfigLoaded();
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: DIRECTOR_GUIDE,
    tools: [BRIEF_TOOL],
    tool_choice: { type: "tool", name: BRIEF_TOOL.name },
    messages: [{ role: "user", content: [...seen, { type: "text", text: `${lines.join("\n")}\n\nPlan it.` }] }],
  });
  await prisma.agentUsage.create({
    data: {
      businessId,
      agentId: STUDIO_AGENT_IDS.director,
      model: MODEL,
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
      costUsd: claudeCost(MODEL, msg.usage.input_tokens, msg.usage.output_tokens),
    },
  });
  const use = msg.content.find((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
  const o = (use?.input ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const imagePrompt = str(o.image_prompt, 4000);
  const videoPrompt = str(o.video_prompt, 4000);
  if (!imagePrompt || (format.kind === "video" && !videoPrompt)) throw new Error("The director couldn't plan this — try again.");
  const shots = (Array.isArray(o.shots) ? o.shots : [])
    .slice(0, 6)
    .map((s): Shot => {
      const x = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
      return { time: str(x.time, 20), what: str(x.what, 400), camera: str(x.camera, 200) || undefined, sound: str(x.sound, 200) || undefined };
    })
    .filter((s) => s.what);
  return {
    title: str(o.title, 80) || format.name,
    concept: str(o.concept, 600),
    shots,
    imagePrompt,
    videoPrompt: format.kind === "video" ? videoPrompt : null,
    script: format.audio === "voice" ? str(o.script, 800) || null : null,
    caption: str(o.caption, 1500),
    headsUp: str(o.heads_up, 400) || null,
    aspect,
    seconds,
  };
}
