import { prisma } from "@/lib/prisma";
import { listProducts } from "@/lib/product-ops";
import { resolveMediaRef } from "@/lib/media";
import { blockedReason, studioStatus } from "@/lib/studio/config";
import { FORMATS, getFormat, type Aspect, type StudioInput } from "@/lib/studio/formats";
import { StudioError, createDraft, runJob, startJob } from "@/lib/studio/engine";
import { brandFace } from "@/lib/studio/refs";

/**
 * The Orchestrator's way into Orbit Studio. Making content spends the seller's monthly allowance,
 * so it's a PROPOSAL like every store change: after the owner presses Apply, the director plans
 * it and it's made in the background; the finished image / reel is posted back into the chat.
 */

export type StudioRequest = {
  op: "studio_job";
  format: string;
  productId?: string;
  productName?: string;
  photos?: string[];
  person?: string;
  consent?: boolean;
  brief: string;
  aspect?: Aspect;
};

export const CREATE_CONTENT_SCHEMA = {
  type: "array",
  description:
    "Make images / reels / ads with Orbit Studio (see ORBIT STUDIO). Only when the owner asked for content or agreed to your suggestion. Each one is a proposal with an Apply button that uses their monthly allowance — say \"press Apply\" and that it will appear here and in Content when it's ready; never say it's already made.",
  items: {
    type: "object",
    properties: {
      format: { type: "string", enum: FORMATS.map((f) => f.id), description: "Which kind of content." },
      product: { type: "string", description: "Product ref like 'P3' when it features a product." },
      photos: { type: "array", items: { type: "string" }, description: "Media refs (M1…) of extra product photos, or THE photo to edit/animate for background / enhance / animate-photo." },
      person_photo: { type: "string", description: "Media ref of a real person's photo to feature — only if the owner sent it for that." },
      person_consent: { type: "boolean", description: "True only if the owner confirmed they have that person's permission." },
      brief: { type: "string", description: "What the owner wants, in English, with every real detail: offer text, what the person should say, setting, mood, language to speak, the person to use." },
      aspect: { type: "string", enum: ["1:1", "4:5", "9:16", "16:9"] },
    },
    required: ["format", "brief"],
  },
} as const;

/** Model output → validated requests with real ids. Unknown refs are dropped, not guessed. */
export async function sanitizeStudioRequests(businessId: string, raw: unknown): Promise<StudioRequest[]> {
  if (!Array.isArray(raw)) return [];
  const products = await listProducts(businessId);
  const out: StudioRequest[] = [];
  for (const o of raw.slice(0, 4)) {
    if (!o || typeof o !== "object") continue;
    const r = o as Record<string, unknown>;
    const format = typeof r.format === "string" ? getFormat(r.format) : undefined;
    if (!format) continue;
    const req: StudioRequest = { op: "studio_job", format: format.id, brief: typeof r.brief === "string" ? r.brief.trim().slice(0, 1200) : "" };
    if (typeof r.product === "string") {
      const i = Number(r.product.replace(/\D/g, "")) - 1;
      const p = products[i];
      if (p) {
        req.productId = p.id;
        req.productName = p.name;
      }
    }
    const photoIds: string[] = [];
    for (const ref of Array.isArray(r.photos) ? r.photos.slice(0, 3) : []) {
      if (typeof ref !== "string") continue;
      const m = await resolveMediaRef(businessId, ref);
      if (m?.kind === "image" && !photoIds.includes(m.id)) photoIds.push(m.id);
    }
    if (photoIds.length) req.photos = photoIds;
    if (typeof r.person_photo === "string") {
      const m = await resolveMediaRef(businessId, r.person_photo);
      if (m?.kind === "image") {
        req.person = m.id;
        req.consent = r.person_consent === true;
      }
    }
    if (typeof r.aspect === "string" && (format.aspects as string[]).includes(r.aspect)) req.aspect = r.aspect as Aspect;
    out.push(req);
  }
  return out;
}

export function sanitizeStoredStudioRequests(raw: unknown[]): StudioRequest[] {
  return raw.filter((o): o is StudioRequest => !!o && typeof o === "object" && (o as StudioRequest).op === "studio_job" && !!getFormat((o as StudioRequest).format));
}

export function describeStudioRequests(reqs: StudioRequest[]): string[] {
  return reqs.map((r) => {
    const f = getFormat(r.format)!;
    return `Orbit Studio: ${f.name}${r.productName ? ` of "${r.productName}"` : ""} — uses 1 ${f.kind === "video" ? "reel" : "image"} from this month's allowance`;
  });
}

/** Turn a request into the same input the Content page would send. */
function toInput(r: StudioRequest): StudioInput {
  const format = getFormat(r.format)!;
  const input: StudioInput = { productId: r.productId, aspect: r.aspect };
  const media: Record<string, string[]> = {};
  if (r.photos?.length) media.photos = r.photos;
  if (r.person && r.consent) media.person = [r.person];
  if (Object.keys(media).length) input.media = media;
  if (r.consent) input.consent = true;
  // Put the brief into the format's main text field when it has a required one (offer, scene, message…).
  const mainText = format.needs.find((n) => n.type === "text" && n.required);
  if (mainText && r.brief) input.text = { [mainText.key]: r.brief.slice(0, 400) };
  if (format.needs.some((n) => n.key === "avatar") && !input.media?.person && /brand face/i.test(r.brief)) input.choice = { avatar: "brand" };
  return input;
}

/** After Apply, in the background: plan → make → the engine posts the result into the chat. */
export async function runStudioRequests(businessId: string, reqs: StudioRequest[]): Promise<void> {
  for (const r of reqs) {
    const f = getFormat(r.format)!;
    try {
      const job = await createDraft(businessId, r.format, toInput(r), "orchestrator", r.brief);
      const started = await startJob(businessId, job.id);
      if (started.status === "queued") await runJob(started.id);
    } catch (e) {
      const why = e instanceof StudioError ? e.message : "something went wrong while planning it";
      await prisma.orchestratorMessage.create({
        data: { businessId, role: "assistant", speaker: "orchestrator", content: `I couldn't start the ${f.name.toLowerCase()}: ${why}\n\nNothing was used from your allowance. You can also make it yourself in Content: /dashboard/content` },
      });
    }
  }
}

/** ORBIT STUDIO section of the Orchestrator's prompt. */
export async function studioContext(businessId: string): Promise<string> {
  const s = await studioStatus(businessId);
  const header = "\nORBIT STUDIO (AI images, reels and ads made from the seller's real products — Content page)";
  if (!s.allowed) return `${header}: NOT on this plan (${s.plan}). It comes with Growth ($75: 50 images + 5 reels a month) and Scale ($150: 100 images + 12 reels). If they ask for images/reels, say so plainly and point them to Settings & Billing to upgrade. create_content must stay empty.`;
  const img = blockedReason(s, "image");
  const vid = blockedReason(s, "video");
  const face = await brandFace(businessId);
  const list = FORMATS.map((f) => {
    const req = f.needs.filter((n) => n.required && n.type !== "consent").map((n) => n.label.toLowerCase());
    return `- ${f.id} (${f.kind}${f.seconds ? ` ${f.seconds}s, ${f.audio === "voice" ? "voice" : "music"}` : ""}): ${f.name} — ${f.tagline}.${req.length ? ` Needs: ${req.join(", ")}.` : ""}`;
  }).join("\n");
  return `${header}
- Images: ${img ?? `${s.left.images} of ${s.limit.images} left this month`}. Reels/videos: ${vid ?? `${s.left.videos} of ${s.limit.videos} left this month`}.
- Brand face: ${face ? "saved — people formats can use it (say 'use the brand face' in the brief)" : "none yet (the 'avatar' format makes one)"}.
- Propose with create_content (the owner presses Apply). Pick the format that fits; put every detail the owner gave in brief. A product needs a photo (P… with NO PHOTO can't be used unless they send one — ask for it). For try-on / people formats a real person's photo is only used if the owner confirms permission. If the allowance is used up or it's not set up, say so instead of proposing.
- Formats:
${list}`;
}
