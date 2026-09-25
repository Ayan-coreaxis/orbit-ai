import { prisma } from "@/lib/prisma";
import { anthropic, MODEL } from "@/lib/anthropic";
import { estimateCostUsd } from "@/lib/pricing";
import { assertUnderUsageCap } from "@/lib/usage-limit";
import type { OrbitDesignDoc, DesignPage } from "@/lib/orbit-design";

/**
 * Phase-2 wiring agent.
 *
 * Orbit Design produces a beautiful but inert prototype: hand-written "Add to cart" buttons that
 * do nothing, product references by name, static newsletter/contact markup. On publish this pass
 * binds all of that to the real backend — matching the seller's real product catalogue — by
 * adding the portable `data-od-*` hooks the storefront runtime understands:
 *
 *   <button data-od-buy="<real Product.id>">          — real add-to-cart
 *   <a href="#product:<real Product.id>">             — real product link
 *   <form data-od-form="newsletter"> … </form>        — real POST /api/store/:id/newsletter
 *   <form data-od-form="contact"> … </form>           — real POST /api/store/:id/contact
 *   <button data-od-filter="<category>">              — real product-grid filter
 *
 * The result is saved to StoreDesign.wired and is what the live /store routes serve. The editable
 * `doc` is never touched, so the seller keeps designing; each publish re-wires.
 */

export interface WireResult {
  wired: OrbitDesignDoc;
  changed: string[]; // page/section ids that were patched
  note: string;
}

const WIRE_TOOL = {
  name: "wire_page",
  description: "Return patched HTML for the sections of this page that contain interactive elements or product references.",
  input_schema: {
    type: "object" as const,
    properties: {
      patches: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "the section id being patched" },
            html: { type: "string", description: "the section's full HTML with data-od-* hooks added" },
          },
          required: ["id", "html"],
        },
      },
      note: { type: "string", description: "one short line on what was wired for this page" },
    },
    required: ["patches"],
  },
};

function systemPrompt(catalogue: { id: string; name: string; price: number; category: string | null }[]): string {
  return `You are the storefront wiring agent. You take a page of AI-designed storefront HTML and make its interactive parts REAL, without changing the visual design. Only edit what needs wiring.

THE REAL PRODUCT CATALOGUE (use these exact ids):
${catalogue.length ? catalogue.map((p) => `- id="${p.id}"  ${p.name}  Rs ${p.price}${p.category ? `  [${p.category}]` : ""}`).join("\n") : "(no products yet)"}

ABSOLUTE RULE — you are returning the section's COMPLETE, LITERAL HTML, not a diff or a summary:
Every element, attribute and word of text that isn't part of a change below must appear in your output exactly as it was in the input. NEVER write a placeholder comment like "<!-- form unchanged -->", "<!-- details list unchanged -->", "<!-- rest of section -->" or anything similar in place of real content — the platform does not expand these; whatever you write is exactly what ships to real shoppers, so a comment like that PERMANENTLY DELETES the real content it stands in for (a whole form, a whole list, a whole paragraph — gone). If a part of the section needs no change, copy it into your output character-for-character. When in doubt, copy more, never summarize.

WIRING RULES — return the section's HTML with these changes only:
1. Any button/link whose purpose is "add to cart" / "buy" / "add to bag" for ONE identifiable product → make it <button type="button" data-od-buy="THE REAL ID" ...keep all styling...>. Match by product name; if you can't tell which product, leave it.
   CRITICAL — once you wire a card's button to a real id, that card's own displayed copy must describe THAT product, never the designer's placeholder one:
   - Replace the visible product name/title text in that same card with the real product's real name.
   - Replace the visible price text with the real product's real price, in the SAME format/currency style the design already used for prices elsewhere on this page (don't invent a new price format).
   - If the card shows a fabricated SKU/code/spec line that isn't real seller data (the product catalogue above has no SKU field), remove that line or reword it to something generic that isn't a specific false claim (e.g. drop "SKU-0042" rather than leave it dangling next to a different real product).
   A shopper must never see one product's name/price/SKU on a card whose button actually adds a different product to their cart — that is a hard rule, not a style preference.
2. Any link or card that represents ONE specific product → set href="#product:THE REAL ID", and apply the same name/price sync as rule 1.
3. A newsletter email capture (an email input + a subscribe button) → wrap the input+button in <form data-od-form="newsletter"> … </form>, ensure the email field is <input type="email" name="email" required>, and the button is type="submit". Keep all styling and surrounding markup.
4. A contact form (name / email / message fields) → wrap the EXISTING inputs in <form data-od-form="contact"> … </form>, renaming them exactly name, email, message (message on a <textarea name="message" required>) — reuse the real inputs that are already there, don't delete and reinvent them. Keep styling.
5. Category filter buttons/pills on a product listing → give each <button type="button" data-od-filter="category-name-lowercase"> (use "all" for the "All" pill). Only if the categories plausibly match the catalogue.
6. NEVER add <script>, inline event handlers, or external resources. NEVER invent product ids. NEVER restyle.
7. LEAVE every data-od-slot / data-od-purpose placeholder and every {{...}} marker EXACTLY as written — the platform fills those with the real working widget at render time. Do not wrap them, style them, or add fields to them.

Call wire_page with a patch for each section you changed. Omit sections you didn't need to touch. If nothing on the page needs wiring, return an empty patches array.`;
}

async function wirePage(
  businessId: string,
  page: DesignPage,
  catalogue: { id: string; name: string; price: number; category: string | null }[],
): Promise<{ patches: Record<string, string>; note: string }> {
  const wireable = page.sections.filter((s) => s.visible && s.type !== "product-grid" && s.html.trim());
  if (!wireable.length) return { patches: {}, note: "" };

  const payload = wireable.map((s) => `--- section id="${s.id}" (${s.type}) ---\n${s.html}`).join("\n\n");

  let msg;
  try {
    msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: systemPrompt(catalogue),
      tools: [WIRE_TOOL],
      tool_choice: { type: "tool", name: "wire_page" },
      messages: [{ role: "user", content: `PAGE "${page.title}" (/${page.slug}) — its sections:\n\n${payload}` }],
    });
  } catch {
    return { patches: {}, note: "" };
  }

  try {
    await prisma.agentUsage.create({
      data: {
        businessId,
        agentId: "orbit-wiring",
        model: MODEL,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
        costUsd: estimateCostUsd(MODEL, msg.usage.input_tokens, msg.usage.output_tokens),
      },
    });
  } catch {
    /* best effort */
  }

  const tool = msg.content.find((b) => b.type === "tool_use");
  if (!tool || tool.type !== "tool_use") return { patches: {}, note: "" };
  const out = tool.input as { patches?: { id: string; html: string }[]; note?: string };
  const patches: Record<string, string> = {};
  for (const p of out.patches ?? []) {
    if (!p || typeof p.id !== "string" || typeof p.html !== "string" || !p.html.trim()) continue;
    const original = wireable.find((s) => s.id === p.id);
    if (!original || isDestructivePatch(original.html, p.html)) continue;
    patches[p.id] = p.html;
  }
  return { patches, note: out.note ?? "" };
}

/**
 * Defense-in-depth against the model "diffing" instead of returning full HTML — e.g. writing
 * `<!-- form unchanged -->` in place of a real form it was supposed to copy verbatim, which
 * silently deletes that content from the live site. Never trust the patch blindly: reject it
 * (keep the section as-designed) rather than publish a section that lost real content.
 */
function isDestructivePatch(originalHtml: string, patchedHtml: string): boolean {
  const commentPattern = /<!--([^>]*)-->/g;
  let m: RegExpExecArray | null;
  while ((m = commentPattern.exec(patchedHtml))) {
    if (/unchanged|rest of|remains? the same|same as (above|before)|omitted|truncated|no changes?|as before|see above/i.test(m[1])) return true;
  }
  // a legitimate wiring patch only adds attributes/wrapper markup — it shouldn't shrink the
  // section by more than a third
  if (patchedHtml.length < originalHtml.length * 0.65) return true;
  return false;
}

export async function wireDoc(businessId: string, doc: OrbitDesignDoc): Promise<WireResult> {
  const noop: WireResult = { wired: doc, changed: [], note: "" };
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "paste_your_key_here") return noop;
  try {
    await assertUnderUsageCap(businessId);
  } catch {
    return noop;
  }

  const products = await prisma.product.findMany({
    where: { businessId },
    select: { id: true, name: true, price: true, category: { select: { name: true } } },
    take: 60,
  });
  const catalogue = products.map((p) => ({ id: p.id, name: p.name, price: p.price, category: p.category?.name ?? null }));

  const wired: OrbitDesignDoc = JSON.parse(JSON.stringify(doc));
  const changed: string[] = [];
  const notes: string[] = [];

  // pages are independent — wire them concurrently
  const results = await Promise.all(wired.pages.map((page) => wirePage(businessId, page, catalogue)));
  results.forEach((res, i) => {
    const page = wired.pages[i];
    for (const [id, html] of Object.entries(res.patches)) {
      const sec = page.sections.find((s) => s.id === id);
      if (sec) {
        sec.html = html;
        changed.push(`${page.slug}/${id}`);
      }
    }
    if (res.note.trim()) notes.push(`${page.title}: ${res.note.trim()}`);
  });

  return { wired, changed, note: notes.join(" · ") };
}
