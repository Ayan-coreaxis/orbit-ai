# orbit.ai — Shared Project Context

> **Every Claude session (local or cloud) reads this first and updates it before finishing.**
> It is the single source of truth shared between sessions. See "How to update this file" at the bottom.

_Last updated: 2026-09-26 by the local desktop session._

---

## 1. What this is

**orbit.ai** — an AI "e-commerce operating system" for small online sellers (home market: Pakistan, PKR, COD-first).
A seller signs up, onboarding reads their website, and a team of AI agents (Orchestrator + specialists) plans growth,
builds and runs their Orbit store, writes content, runs ads, and talks to the seller in a chat — in Roman Urdu or English.

- **Owner:** Ayyan (ayyanmohsin70@gmail.com). Writes in Roman Urdu; wants **short, direct replies**.
- **Build model:** Claude writes the code feature by feature; a separate human team reviews/fixes it. Funding comes after the product is complete. Finish the e-commerce vertical fully before any multi-vertical work. Launch will be phased once everything is built.

## 2. Stack & how to run

- **Next.js 16.3 (App Router)** + React, TypeScript, Tailwind. ⚠ This Next version has breaking changes vs. older docs — read `web/node_modules/next/dist/docs/` before using unfamiliar APIs (`web/AGENTS.md`).
- **Prisma + SQLite** (`web/prisma/dev.db`, not committed). **Anthropic SDK** (Claude) for all AI.
- Code lives in **`web/`**. Root holds planning docs (`TASKS.md`, `ecommerce-ai-os-plan-*.md`, PDFs).

```bash
cd web
npm install
cp .env.example .env.local        # fill in keys (at least ANTHROPIC_API_KEY, AUTH_SECRET, ADMIN_PASSWORD, DATABASE_URL)
npx prisma migrate deploy         # creates dev.db from migrations
npm run dev                       # http://localhost:3000
```

- Windows note: stop the dev server before `prisma generate`/`migrate dev` (DLL lock). For schema changes non-interactively: `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<ts>_<name>/migration.sql` then `npx prisma migrate deploy`.
- Typecheck: `npx tsc --noEmit -p .` — **4 pre-existing errors are the baseline** (VoiceOrb.tsx, payment-settings route, RevenueChart.tsx, run-intelligence.ts). Don't add new ones.
- Super Admin: `/admin` (password = `ADMIN_PASSWORD`). Keys, storage, web search, AI model, usage are configured there.

## 3. Map of the product (where things live)

| Area | Where |
|---|---|
| Onboarding (website scan → socials/WhatsApp/currency, competitors, first plan) | `app/onboarding/page.tsx`, `app/api/onboarding/{route,discover}`, `lib/scrape.ts`, `lib/social-finder.ts` |
| **Orchestrator chat** (the main surface) | `app/dashboard/orchestrator`, `components/orchestrator/*`, `app/api/orchestrator/{chat,proposal,messages}` |
| Growth plan (plan-as-data, measurement, harness, hired agents, reviews) | `lib/strategy-lab.ts`, `strategy-planner.ts`, `strategy-chat.ts`, `harness.ts`, `plan-agents.ts`, `strategy-review.ts`, `components/strategy/*` |
| Specialist "meeting" in chat | `lib/specialist-consult.ts` |
| Store (products, orders, discounts, customers…) | `app/dashboard/store`, `components/store/*`, `app/api/store/*` |
| **Orbit Design** (store builder, design-is-data) + Orbit Code (backend wiring) | `lib/orbit-design.ts`, `orbit-design-generate.ts`, `orbit-code.ts`, `design-ops.ts`, `app/api/orbit-design/*`, `components/orbit-design/*`, live store `app/store/[businessId]/*` |
| Media library (chat attachments, catalog PDFs, uploads) | `lib/media.ts`, `lib/media-client.ts`, `lib/pdf-extract.ts`, `app/api/media`, `app/dashboard/media` |
| Storage (local disk or Cloudflare R2) | `lib/storage.ts`, admin `/admin/storage` |
| Web search (Brave) + per-plan limits | `lib/web-search.ts`, admin `/admin/web-search` |
| Connections: MCP pool, Skills, OAuth, Plugins | `/dashboard/settings/connections`, `lib/mcp-pool.ts`, `agent-tools.ts`, `skills.ts`, `mcp-oauth.ts` |
| Meta (FB/IG/Ads) connect | `lib/meta-oauth.ts` (Graph v26.0, Login-for-Business `config_id`) — dev mode; App Review still needed |
| Platform map + live store status given to the Orchestrator | `lib/platform-map.ts` |

## 4. How the Orchestrator works (key rules)

- One chat, one Orchestrator. It answers via a forced tool `respond_to_owner` (`lib/strategy-chat.ts` → `ORCHESTRATOR_TOOL`).
- **Everything that changes the store is a proposal** the owner must press **Apply** on (message `pendingOps` → `app/api/orchestrator/proposal/[messageId]`):
  - store settings: currency, delivery fee, free-delivery threshold, tax (`lib/store-settings-ops.ts`, `lib/currencies.ts`)
  - products: edit price/cost/stock/name/description/photos/variants, add new, delete (`lib/product-ops.ts`)
  - storefront: Orbit Design edits + publish (`lib/design-ops.ts`; runs in the background after Apply and posts the result back to the chat)
  - growth-plan edits on an ACTIVE plan (draft-plan edits apply immediately)
- Past proposals carry `[SYSTEM: applied / dismissed / pending / failed]` notes in history so it never claims a dismissed change is coming.
- Tools in its loop: `web_search` + `read_page` (Brave, within limits), `open_media` (re-open a library file). Max 3 searches, 2 page reads, 2 file opens per reply.
- Attachments: images & PDFs go to Claude directly; videos as browser-captured frames; voice notes transcribed by the browser; catalog PDFs have their product photos extracted (embedded images or linked image URLs, SSRF-guarded) and referenced as `M1, M2…`.
- It gets: business context, PLATFORM_MAP, live STORE STATUS (built? published? missing?), plan, store settings, PRODUCTS (P1…), MEDIA (M1…). Specialists get the store status too.
- Honest, not a yes-man; never invents numbers/stock/prices; UI chat uses light formatting (short paragraphs, `- ` bullets, `**bold**`) rendered by `components/orchestrator/ChatText.tsx`.

## 5. Product decisions (don't re-litigate)

- **Growth planning:** competitors are reference knowledge only, never the base. Plans = many creative, testable strategies (no fixed length); measured in code (never AI-invented numbers); discussed with the seller before running; mid-plan changes go back to the seller; say during planning what Orbit can't execute.
- **Agents as data:** the Orchestrator can hire/retire agents per plan, least-privilege tools/data, budget from the seller's own usage cap — **Scale plan only**.
- **Jev (TypeSafe) decision layer:** planned for routing/classification only (Claude keeps generation), shadow mode first — **ON HOLD** (Jev is down).
- **Orbit Design:** design is data (`OrbitDesignDoc`); 8 core pages pre-wired; bespoke per-store output; Orbit Code wires backend; publish re-runs wiring if stale.
- **Web search:** Brave API ($5/1k, ~1k free/month); per-plan monthly limits (Starter 300 / Growth 600 / Scale 1500). Rejected: self-hosted SearXNG, headless-Chrome Google scraping as the main path.
- **Storage:** Cloudflare R2 before going to a VPS; admin can migrate local files → R2 (`/admin/storage`).
- Safety: never enter the owner's passwords/API keys/App Secret for them; they paste keys into the admin panel themselves.

## 6. Status

**Done (recent, 2026-09-25 → 26):** onboarding extracts WhatsApp/socials (+AI web lookup) and sets store currency from `.pk`/`+92`; thinking-orb animation + chat redesign; Orchestrator store-settings / product / variant / add / delete powers; media library + chat attachments + voice notes + catalog-PDF photo extraction + `open_media`; product photo upload in Store; Cloudflare R2 storage + admin page; Brave web search + limits + admin page; platform map + live store status; Orchestrator → Orbit Design (build/edit/publish via proposals).

**Not yet verified live:** Apply → Orbit Design background build posting back to chat; real R2 bucket (no keys yet); real Brave search (no key yet); video & voice-note upload in a browser.

**Open / next:**
- Owner still to do: Cloudflare R2 account + keys, Brave API key, Meta App Review, WhatsApp connect.
- Dedupe identical media uploads (same PDF twice creates duplicate photos).
- Jev layer (on hold).
- Decide whether to retire the old competitor-based weekly plan (`runCompetitorAnalysis` + "Your Weekly Plan").
- Detailed task history: `TASKS.md`.

## 7. Changelog (newest first — add one entry per session/batch of work)

- **2026-09-26 · local** — Pushed the project to a private GitHub repo; added this CONTEXT.md, root CLAUDE.md, `.gitignore`, `web/.env.example`.
- **2026-09-26 · local** — Orchestrator ↔ Orbit Design (`design-ops.ts`, `platform-map.ts`); proposal-state notes in history; catalog PDF photo extraction (`pdf-extract.ts`), `open_media`; product add/delete/variants.
- **2026-09-25 · local** — Strategy Lab Hissa 1–3, 5, 6; media library; R2; Brave web search; chat redesign; onboarding socials/currency.

---

## How to update this file (for every session)

1. **Start:** `git pull` and read this file + `TASKS.md` (and `web/AGENTS.md`).
2. **While working:** keep decisions in §5, where-things-live in §3, open items in §6.
3. **Before finishing:** add a dated line to §7 Changelog (`YYYY-MM-DD · <local|cloud> — what changed, key files`), update §6 Status, bump "Last updated", then commit and push:
   `git add -A && git commit -m "<what changed>" && git push`
4. Never commit secrets, `.env*` (except `.env.example`), `*.db`, or `web/public/uploads/`.
5. If `git pull` conflicts on this file, keep **both** sides' changelog entries and merge the rest by hand.
