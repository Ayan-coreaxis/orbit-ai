import { prisma } from "@/lib/prisma";
import { storeUrl } from "@/lib/public-url";
import { runDesignTurn, loadDoc, type DesignRef } from "@/lib/orbit-design-generate";
import { collectSlots, planOrbitCode, runOrbitCode } from "@/lib/orbit-code";
import { wireDoc } from "@/lib/orbit-design-wire";
import type { OrbitDesignDoc } from "@/lib/orbit-design";

/**
 * Orbit Design operations shared by the Orbit Design studio and the Orchestrator:
 *  - runDesignEdit: one design turn (the same engine the studio chat uses), then keep the live
 *    store in step (Orbit Code re-wire for new interactive parts, or refresh content-only pages).
 *  - publishStore: publish / unpublish, re-running Orbit Code if the design changed since.
 * The Orchestrator reaches them through proposals (DesignJob) that run only after the owner's
 * Apply, in the background, and post the outcome back into the chat.
 */

const WIRING_TALK =
  /\b(wire|wiring|backend|re-?wire|classif\w*|collection|reviews?|testimonials?|wishlist|wait ?list|newsletter|complaints?|contact form|checkout|account page|order tracking|otp|password|sign[- ]?in|log[- ]?in|should be (a|an|the)|treat .+ as|not a |isn'?t a |make .+ (a|the) (form|collection|contact|complaint|review))\b/i;

/** Copy content-only pages (no data-od-slot / functional markers) from the fresh doc into `wired`. */
export async function refreshStaticPages(businessId: string, doc: OrbitDesignDoc) {
  try {
    const row = await prisma.storeDesign.findUnique({ where: { businessId }, select: { wired: true } });
    if (!row?.wired) return;
    const wiredDoc = JSON.parse(row.wired) as OrbitDesignDoc;
    const hasSlot = (p: { sections: { html?: string }[] }) =>
      p.sections.some((s) => /data-od-slot=|\{\{\s*(checkout|cart|account|auth|product)\s*\}\}/i.test(s.html || ""));
    const bySlug = new Map(wiredDoc.pages.map((p, i) => [p.slug, i]));
    let touched = false;
    for (const p of doc.pages) {
      if (hasSlot(p)) continue;
      const i = bySlug.get(p.slug);
      if (i == null) {
        wiredDoc.pages.push(JSON.parse(JSON.stringify(p)));
        touched = true;
      } else if (JSON.stringify(wiredDoc.pages[i]) !== JSON.stringify(p)) {
        wiredDoc.pages[i] = JSON.parse(JSON.stringify(p));
        touched = true;
      }
    }
    // drop pages the seller deleted
    const liveSlugs = new Set(doc.pages.map((p) => p.slug));
    const before = wiredDoc.pages.length;
    wiredDoc.pages = wiredDoc.pages.filter((p) => liveSlugs.has(p.slug));
    if (wiredDoc.pages.length !== before) touched = true;
    if (touched) {
      wiredDoc.components = doc.components;
      wiredDoc.content = doc.content;
      await prisma.storeDesign.update({ where: { businessId }, data: { wired: JSON.stringify(wiredDoc) } });
    }
  } catch {
    /* best effort — the seller can always Re-wire */
  }
}

/** One Orbit Design turn + keeping the live store's wiring in step. */
export async function runDesignEdit(
  businessId: string,
  message: string,
  refs: { images?: DesignRef[]; siteUrl?: string; siteHint?: string } = {},
) {
  // Once the backend has been handed off, Orbit Code watches for new interactive parts the seller
  // designs and wires them itself — asking a clarifying question first when the intent is ambiguous.
  const design = await prisma.storeDesign.findUnique({ where: { businessId }, select: { backendWiredAt: true } });
  const wired = !!design?.backendWiredAt;
  const slotsBefore = wired ? new Set(collectSlots(await loadDoc(businessId)).map((s) => `${s.page}:${s.slot}`)) : new Set<string>();

  const result = await runDesignTurn(businessId, message, refs);

  let orbitCode: { questions?: unknown[]; rewired?: string } | undefined;
  if (wired && !result.error && result.doc) {
    const added = collectSlots(result.doc).some((s) => !slotsBefore.has(`${s.page}:${s.slot}`));
    const correcting = !added && WIRING_TALK.test(message);
    if (added) {
      const { questions } = await planOrbitCode(businessId);
      if (questions.length) orbitCode = { questions };
      else orbitCode = { rewired: (await runOrbitCode(businessId)).summary };
    } else if (correcting) {
      orbitCode = { rewired: (await runOrbitCode(businessId, { correction: message.slice(0, 400) })).summary };
    } else {
      // No re-wire needed, but the live storefront serves the `wired` doc — refresh the pages that
      // carry no interactive slots (new/edited content pages) so the edit is live immediately.
      await refreshStaticPages(businessId, result.doc);
    }
  }
  return { ...result, orbitCode };
}

/** Publish (re-running Orbit Code if the design changed since it last ran) or unpublish the store. */
export async function publishStore(businessId: string, publish: boolean): Promise<{ published: boolean; note: string }> {
  if (!publish) {
    await prisma.storeDesign.updateMany({ where: { businessId }, data: { published: false } });
    return { published: false, note: "" };
  }
  const design = await prisma.storeDesign.findUnique({ where: { businessId }, select: { updatedAt: true, backendWiredAt: true } });
  // If the design has changed since Orbit Code last ran (or never ran), re-run it so the live
  // store's backend always matches the current pages — the seller never has to remember Handoff.
  const staleBackend = !design?.backendWiredAt || (design.updatedAt && design.updatedAt > design.backendWiredAt);
  let note = "";
  if (staleBackend) {
    note = (await runOrbitCode(businessId)).summary; // saves backend + wired internally
  } else {
    const wr = await wireDoc(businessId, await loadDoc(businessId));
    await prisma.storeDesign.update({ where: { businessId }, data: { wired: JSON.stringify(wr.wired), wiredAt: new Date() } });
  }
  await prisma.storeDesign.update({ where: { businessId }, data: { published: true } });
  return { published: true, note };
}

// ---------- Orchestrator proposals ----------

export type DesignJob = { op: "design_request"; instruction: string } | { op: "publish_store"; publish: boolean };

export const STORE_DESIGN_SCHEMA = {
  type: "object",
  description:
    "Work on the owner's storefront through Orbit Design (their store builder). Only when the owner asked or agreed. It's a proposal: after Apply, Orbit Design does it in the background (a minute or two) and reports back here — say that, never that it's already done.",
  properties: {
    instruction: {
      type: "string",
      description:
        "A clear, specific design brief for Orbit Design in English, e.g. 'Replace the home hero headline with …', 'Add an About page telling the brand story: …', 'Build the whole store: warm premium snack brand, yellow + chocolate palette, pages: home, shop, about, contact'. Include the real facts it needs (brand, products, tone). Leave empty if only publishing.",
    },
    publish: {
      type: "boolean",
      description:
        "ONLY when the owner explicitly asks: true = publish (make it live), false = take a LIVE store offline. Leave it OUT otherwise — 'don't publish yet' means leave it out, not false.",
    },
  },
} as const;

/** `published` = the store's real state now — a publish/unpublish that changes nothing is dropped. */
export function sanitizeDesignJobs(raw: unknown, published: boolean): DesignJob[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as { instruction?: unknown; publish?: unknown };
  const jobs: DesignJob[] = [];
  const hasEdit = typeof r.instruction === "string" && r.instruction.trim().length > 3;
  if (hasEdit) jobs.push({ op: "design_request", instruction: (r.instruction as string).trim().slice(0, 4000) });
  // Unpublishing a store that isn't live is meaningless; re-publishing a live store only makes
  // sense together with a design edit (to push it live).
  if (r.publish === false && published) jobs.push({ op: "publish_store", publish: false });
  if (r.publish === true && (!published || hasEdit)) jobs.push({ op: "publish_store", publish: true });
  return jobs;
}

export function sanitizeStoredDesignJobs(raw: unknown[]): DesignJob[] {
  return raw.filter((o): o is DesignJob => {
    const j = o as DesignJob;
    return !!j && typeof j === "object" && ((j.op === "design_request" && typeof j.instruction === "string") || (j.op === "publish_store" && typeof j.publish === "boolean"));
  });
}

export function describeDesignJobs(jobs: DesignJob[]): string[] {
  return jobs.map((j) =>
    j.op === "publish_store"
      ? j.publish
        ? "Publish the store — make it live for customers"
        : "Take the store offline (unpublish)"
      : `Orbit Design: ${j.instruction.length > 220 ? `${j.instruction.slice(0, 220)}…` : j.instruction}`,
  );
}

/** Runs after the owner's Apply, in the background; posts what happened into the Orchestrator chat. */
export async function runDesignJobs(businessId: string, jobs: DesignJob[], planId: string | null): Promise<void> {
  const say = (content: string) =>
    prisma.orchestratorMessage.create({ data: { businessId, role: "assistant", speaker: "orchestrator", content, planId } });
  // Design edits first, publish last — so a "change X and publish" goes live with the change.
  const ordered = [...jobs.filter((j) => j.op === "design_request"), ...jobs.filter((j) => j.op === "publish_store")];
  for (const j of ordered) {
    try {
      if (j.op === "design_request") {
        const r = await runDesignEdit(businessId, j.instruction);
        if (r.error) {
          await say(`Orbit Design couldn't finish that: ${r.error}\n\nYou can open Orbit Design and try it there, or tell me what to change.`);
          continue;
        }
        const questions = r.orbitCode?.questions?.length ? `\n\n**Orbit Code has a question** before it wires the new part — open Orbit Design to answer it.` : "";
        const live = (await prisma.storeDesign.findUnique({ where: { businessId }, select: { published: true } }))?.published;
        await say(
          `Orbit Design is done: ${r.reply.trim()}${questions}\n\n${live ? "Content changes are live on your store; " : "Your store isn't published yet — "}see it in Orbit Design: /dashboard/orbit-design`,
        );
      } else {
        const r = await publishStore(businessId, j.publish);
        await say(
          r.published
            ? `Your store is now **live**: ${await storeUrl(businessId)}${r.note ? `\n\n${r.note}` : ""}`
            : "Your store is now offline — customers can't open it until you publish again.",
        );
      }
    } catch (e) {
      await say(`Something went wrong in Orbit Design: ${e instanceof Error ? e.message.slice(0, 200) : "unknown error"}. Nothing else was changed.`);
    }
  }
}
