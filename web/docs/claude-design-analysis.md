# Claude Design — first-hand teardown

Explored directly at **claude.ai/design** on 2026-09-01 (logged into the user's account), including
running a full whole-store generation. This replaces the earlier notes that were only from articles.

---

## 1. Project creation (the home screen)

"What should we create?" — one input: *"Attach a file, link your design system, or describe what you want to make."*

- **Templates / starting points:** Blank, Mobile app design, Slides, Document, Wireframe, Animation,
  UI mockups, Résumé, 3D object, Research, HTML email, Color + type pairing, Diagram, Flier.
- **Design-system selector** — attach one or many design systems so every generation follows them.
- **`</>` "Start from code"** — *"Base designs off what's currently in code?"* → None / Local codebase (attach) / GitHub (connect).
- **Model selector** — Fable 5, Opus 5, **Sonnet 5 (default)**, Haiku 4.5, plus an **Effort** submenu (Low→Max, default Medium) and "More models".
- **`+` attach menu** — Attach file · Reference another project · Connect GitHub · Link local code · Upload .fig (Figma) · Design system · **Skills** · **Manage connectors** (MCP).
- Library tabs: **Projects / Design systems / Templates**.

## 2. Design systems

A design system = a reusable bundle of **tokens + components + brand assets**, attached per-prompt,
maintained over time, optionally published org-wide.

- Built-in named systems: **Modernist, Classical, Nocturne, Organic, Broadsheet, Industry**.
- "Create design system" — yours; one can be the "Org default".
- This is the persistent output of the "extract my design system from a repo/Figma" feature.

## 3. How a project is structured — MULTI-FILE

A project is a set of **`.dc.html` files** + plain **`.js`** logic/data files:

- **One file per page** (Home, Shop, Product, Cart, Checkout, About, Contact …)
- **Component files** — `Header`, `Footer`, `ProductCard` — imported into pages as `<Component>` (shows as `dc-import` in the layer tree)
- **Plain JS files** — `products.js` (catalog data), `cart.js` (localStorage cart + count badge)

My "Nihari House" test produced **13 files / 10 pages**. A project can hold **multiple chat
conversations** (Conversations menu → "New chat"). "New blank page" and an "All project files" browser exist.

## 4. Generation flow (observed on a whole-store prompt)

1. **Lists files** in the project
2. **Copies a starter** scaffold
3. **Writes shared files first** — `products.js`, then the components
4. **Designs pages in batches** — "Now Product detail, Cart, Checkout pages" → several **"Designing ×N"** passes → "Now Checkout, About, Contact pages" → more passes
5. **"All pages built. Verifying the storefront now."** → "Finishing up"
6. Summary: *"Built the full Nihari House storefront: … sharing Header/Footer/ProductCard components, with a localStorage cart (cart.js) and cart-count badge, and image placeholders throughout. **Awaiting verifier feedback.**"*
7. A **background verifier** runs and self-fixes bugs — it caught a headline escaping glitch (`like\Amma` → `like Amma`) with no user prompt. An earlier project's log showed *"Found issues — fixing…"*, *"Refining design ×2"* — this self-review loop is standard.
8. **"How did this design turn out?"** star-rating prompt closes the run.

Status chips are collapsible (e.g. `Copying starter, Writing ×2, Designing ×5…`).

## 5. Output quality (Nihari House, one prompt, Sonnet 5 / Medium)

Matched the brief precisely — deep-maroon + saffron + cream, display-serif headings, clean sans body.

- **Home** — announcement bar, sticky header with cart icon, hero (eyebrow → big serif headline → subcopy → two CTAs → labelled image slot), and the shared footer.
- **Shop** — "All Products", **category filter pills** (All / Nihari / Haleem / Biryani Kits / Paya / Combos), responsive **product grid**. Each `ProductCard`: labelled image slot, category tag, serif name, servings, price, "Add to Cart".
- **Product** — data-driven, reads `?id=` from the URL (shows "Product not found · Back to shop" when opened bare in the editor).
- **Cart** — real empty state ("Your cart is empty" + "Browse Products").
- **Footer** — maroon, SHOP / COMPANY / GET IN TOUCH columns, real-looking contact block, copyright.
- **Image placeholders** — every image is a **labelled slot** ("Hero photo: steaming bowl of beef nihari with naan, ginger and green chili garnish, warm moody lighting") with an "or browse files" drop target.

## 6. The editor

Top bar: file selector (`Home / 10 pages`), zoom, cursor tool, **Comment**, **Edit**, **Present**, **Share**.

### Edit mode — four sub-modes
| Mode | What it is |
|---|---|
| **Simple** | Click an element → visual property panel: Appearance (bg, radius, overflow, opacity, +shadow/text-shadow/transform/filter), Typography (font, size, colour, weight, I/U/S, align, leading, case, +tracking), Border, Export selection |
| **Pro** | Simple + a persistent layer tree + **Sizing** (Hug/Fixed/Fill), **Position** (Inline/Absolute/+offset), **Padding & Margin** (None/All/X&Y/Individual), Advanced |
| **Code** | Layer tree + **raw editable CSS declarations** per element ("One declaration per line; `@name` edits an attribute"). Shows `dc-import` for components, semantic classes like `image-slot` |
| **Tweaks** | *"This design has no tweakable controls yet — describe what you want to adjust and Claude will add a tweaks panel for it."* → **Tweaks are AI-generated custom control panels, per design** — not a fixed set of knobs. Also reachable from a toolbar button. |

Toolbar: select, text, frame, rectangle, circle, arrow, line, pencil, undo/redo. "Repeated elements are edited together. Shift-click to select more."

### Present
In this tab / Fullscreen / New tab.

### Share
- Access scope (workspace / copy link) — "Only you can see this design."
- **Publish as artifact** — make it a public artifact.
- **Export:** PDF (instant or Claude-reformatted) · **Project HTML** (.zip or standalone) · PowerPoint (editable text + shapes) · PNG (per element) · Video (MP4, for animation pages) · **Claude Code** — a first-class "Send" destination for the handoff bundle · Connect more destinations.

---

## 7. What this means for **Orbit Design** (our clone)

What we already match: conversational build, live preview, publish, standalone-HTML export, a
Claude-Code handoff prompt, data-driven products with `?id=` routing, design tokens as CSS vars.

Gaps to close if we want parity, roughly in priority order:

1. **Multi-file / component model.** Real Claude Design builds separate pages that *import* shared
   `Header` / `Footer` / `ProductCard` components + a `cart.js`. We collapsed everything into one
   `OrbitDesignDoc`. For a store that's actually fine, but components would cut duplication and make
   edits consistent across pages.
2. **Generate → verify → self-fix loop.** They run a background verifier that catches and fixes its
   own bugs. We do a single shot. Adding a cheap second "review this HTML for bugs and fix" pass
   would meaningfully raise quality.
3. **Batched, multi-pass generation.** They design pages in small batches with several "Designing"
   passes each, instead of one big response. Lower error rate, better completion on large stores.
4. **Tweaks = AI-authored per-design controls**, not fixed sliders. Ours is a fixed knob panel
   (accent, radius, spacing, fonts). Theirs: "describe a tweak" → Claude adds bespoke controls for
   *this* design. Bigger lift; our fixed knobs are a reasonable v1.
5. **Labelled image slots.** Every placeholder says exactly what photo belongs there and lets you
   drop one in. We show a bland "No photo" box — we should carry the AI's photo brief text.
6. **Starter scaffold.** They copy a known-good base before generating. We start from a hand-written
   default doc, which is the same idea in spirit.
7. **Inputs we don't take:** Figma `.fig`, GitHub repo, local codebase, Skills, MCP connectors.
   "From my site" (scrape colours/fonts) is our lightweight version of the design-system extraction.
8. **Model + effort picker** in the studio — currently we hard-use one model.

## Sources

First-hand: claude.ai/design (2026-09-01). Background: anthropic.com/news/claude-design-anthropic-labs,
venturebeat.com, mindstudio.ai, agence-scroll.com.
