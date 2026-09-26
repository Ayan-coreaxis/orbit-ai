# orbit.ai — Shared Project Context

> **Every Claude session (local or cloud) reads this first and updates it before finishing.**
> It is the single source of truth shared between sessions. See "How to update this file" at the bottom.

_Last updated: 2026-09-26 by the cloud session (Postgres, WhatsApp templates, Pixel + Conversions API, Messenger/IG DMs, legal pages, billing fixes, AI onboarding questions)._

---

## 1. What this is

**orbit.ai** — an AI "e-commerce operating system" for small online sellers (home market: Pakistan, PKR, COD-first).
A seller signs up, onboarding reads their website, and a team of AI agents (Orchestrator + specialists) plans growth,
builds and runs their Orbit store, writes content, runs ads, and talks to the seller in a chat — in Roman Urdu or English.

- **Owner:** Ayyan (ayyanmohsin70@gmail.com). Writes in Roman Urdu; wants **short, direct replies**.
- **Build model:** Claude writes the code feature by feature; a separate human team reviews/fixes it. Funding comes after the product is complete. Finish the e-commerce vertical fully before any multi-vertical work. Launch will be phased once everything is built.

## 2. Stack & how to run

- **Next.js 16.3 (App Router)** + React, TypeScript, Tailwind. ⚠ This Next version has breaking changes vs. older docs — read `web/node_modules/next/dist/docs/` before using unfamiliar APIs (`web/AGENTS.md`).
- **Prisma + PostgreSQL** (Neon / Supabase / any Postgres; `DATABASE_URL` + `DIRECT_URL`). **Anthropic SDK** (Claude) for all AI. Old SQLite migrations are kept in `prisma/sqlite-archive/` (history only).
- Code lives in **`web/`**. Root holds planning docs (`TASKS.md`, `ecommerce-ai-os-plan-*.md`, PDFs).

```bash
cd web
npm install
cp .env.example .env.local        # fill in keys (at least ANTHROPIC_API_KEY, AUTH_SECRET, ADMIN_PASSWORD, DATABASE_URL, DIRECT_URL)
npx prisma migrate deploy         # creates the tables in your Postgres
npm run dev                       # http://localhost:3000
# old local SQLite data? copy it once into an EMPTY Postgres:
npm run db:copy-sqlite prisma/dev.db
```

- Windows note: stop the dev server before `prisma generate`/`migrate dev` (DLL lock). Schema change: `npx prisma migrate dev --name <name> --create-only` against a Postgres, then `npx prisma migrate deploy`. ⚠ The Postgres baseline is `20260926200000_init_postgres` — a new migration's folder name must sort AFTER the last one (rename the timestamp if Prisma's clock gives an earlier one).
- Local uploads are served by `app/uploads/[...path]/route.ts` (works after a build too). On Vercel/Lambda/Netlify, file uploads need Cloudflare R2 — without it `putFile` refuses with a clear message instead of losing files.
- Checks: `npx tsc --noEmit -p .` and `npx eslint .` are both at **0 errors / 0 warnings**, `npm test` all green — keep them there. Next 16 uses `proxy.ts` (not middleware.ts) for host routing.
- Super Admin: `/admin` (password = `ADMIN_PASSWORD`). Keys, storage, web search, AI model, usage are configured there.

## 3. Map of the product (where things live)

| Area | Where |
|---|---|
| Onboarding (website scan → model → **AI-written questions** → socials/WhatsApp/currency, competitors, first plan) | `app/onboarding/page.tsx`, `app/api/onboarding/{route,discover,questions}`, `lib/onboarding-questions.ts` (answers → `Business.onboardingAnswers`, read by Orchestrator / weekly plan / Strategy Lab), `lib/scrape.ts`, `lib/social-finder.ts` |
| **Orchestrator chat** (the main surface) | `app/dashboard/orchestrator`, `components/orchestrator/*`, `app/api/orchestrator/{chat,proposal,messages}` |
| Growth plan (plan-as-data, measurement, harness, hired agents, reviews) | `lib/strategy-lab.ts`, `strategy-planner.ts`, `strategy-chat.ts`, `harness.ts`, `plan-agents.ts`, `strategy-review.ts`, `components/strategy/*` |
| Specialist "meeting" in chat | `lib/specialist-consult.ts` |
| Store (products, orders, discounts, customers…) | `app/dashboard/store`, `components/store/*`, `app/api/store/*` |
| **Orbit Design** (store builder, design-is-data) + Orbit Code (backend wiring) | `lib/orbit-design.ts`, `orbit-design-generate.ts`, `orbit-code.ts`, `design-ops.ts`, `app/api/orbit-design/*`, `components/orbit-design/*`, live store `app/store/[businessId]/*` |
| Media library (chat attachments, catalog PDFs, uploads) | `lib/media.ts`, `lib/media-client.ts`, `lib/pdf-extract.ts`, `app/api/media`, `app/dashboard/media` |
| Storage (local disk or Cloudflare R2) | `lib/storage.ts`, admin `/admin/storage` |
| Web search (Brave) + per-plan limits | `lib/web-search.ts`, admin `/admin/web-search` |
| Connections: MCP pool, Skills, OAuth, Plugins | `/dashboard/settings/connections`, `lib/mcp-pool.ts`, `agent-tools.ts`, `skills.ts`, `mcp-oauth.ts` |
| Meta connect + connection check | `lib/meta-oauth.ts` (Graph v26.0; stores the Page token AND the long-lived user token), `lib/meta-health.ts`, `app/api/meta/status`, Settings `MetaConnectCard` + `components/settings/MetaHealth.tsx` (checks + Page / ad-account picker) |
| **Meta ads** (complete ads, paused) | `lib/meta-ads.ts` (campaign → ad set in the ad account's currency → creative → ad; rollback; activate/pause/delete; insights sync), `app/api/ads/*`, `components/ads/AdsManager.tsx` |
| **Facebook / Instagram posting** | `lib/meta-graph.ts` (FB photo/video/text by direct upload; IG JPEG / Reel via public URL + container polling), `SocialPost` model, `app/api/social`, Studio `ShareBox`, Content `RecentPosts` |
| Public addresses | `lib/public-url.ts` (storeUrl → verified custom domain first; publicFileUrl for Instagram/ads) |
| **WhatsApp (Twilio)** | `lib/whatsapp.ts` (send from the seller's own number, signature check, friendly Twilio errors, Content Templates), `lib/whatsapp-templates.ts` (9 message kinds, variable order, suggested bodies), webhook `app/api/webhooks/twilio/whatsapp`, Super Admin `/admin/whatsapp` (setup, test send, template SIDs) |
| **Meta Pixel + Conversions API** | `components/store/StorePixels.tsx` (in `app/store/[businessId]/layout.tsx`, defines `window.__odPx`), `lib/pixel-client.ts`, `components/store/PixelPurchase.tsx`, `lib/meta-capi.ts` (server Purchase, event id `order_<id>`; called from checkout + Stripe finalize), Settings > Store (Pixel ID + CAPI token) |
| **Messenger / Instagram DMs** | `lib/meta-messaging.ts`, webhook `app/api/webhooks/meta` (verify token + X-Hub-Signature-256), Page subscribed on connect / switch, Inbox `app/dashboard/inbox` |
| Legal | `/privacy` (incl. data-deletion steps), `/terms` — `components/legal/LegalPage.tsx`, contact = `LEGAL_CONTACT_EMAIL` |
| Platform billing (seller pays Orbit) | `lib/platform-stripe.ts`, `app/api/billing/{checkout,portal}`, webhook `app/api/webhooks/stripe`, Settings plan cards + Manage billing |
| **Custom store domains** | `lib/domains.ts` (DNS TXT + CNAME/A check, Vercel domains API), `proxy.ts` (host → `/store/<id>`), `app/api/domains/*` (`allowed` = Caddy on-demand TLS ask), Settings `DomainCard` |
| Platform map + live store status given to the Orchestrator | `lib/platform-map.ts` |
| **Orbit Studio** (AI images, reels, UGC, try-on, ads — Content page) | `lib/studio/*` (formats, director + director-guide, engine, providers, refs, ops, config), `components/studio/*`, `app/api/studio/*`, admin `/admin/studio` |

## 4. How the Orchestrator works (key rules)

- One chat, one Orchestrator. It answers via a forced tool `respond_to_owner` (`lib/strategy-chat.ts` → `ORCHESTRATOR_TOOL`).
- **Everything that changes the store is a proposal** the owner must press **Apply** on (message `pendingOps` → `app/api/orchestrator/proposal/[messageId]`):
  - store settings: currency, delivery fee, free-delivery threshold, tax (`lib/store-settings-ops.ts`, `lib/currencies.ts`)
  - products: edit price/cost/stock/name/description/photos/variants, add new, delete (`lib/product-ops.ts`)
  - storefront: Orbit Design edits + publish (`lib/design-ops.ts`; runs in the background after Apply and posts the result back to the chat)
  - growth-plan edits on an ACTIVE plan (draft-plan edits apply immediately)
  - Orbit Studio content (`create_content` → `studio_job` op; after Apply it's planned + made in the background and the image/reel is posted back into the chat as an attachment)
  - Facebook / Instagram posts (`social_posts` → `social_post` op) and Meta ads (`meta_ads` → `meta_ad` op, built PAUSED — spend only starts with the owner's own Activate in Ads) — `lib/meta-ops.ts`
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
- **Meta ads:** every ad is complete (campaign + ad set + creative + ad) and created PAUSED; Activate turns on ad, ad set and campaign; the budget is in the ad account's own currency (minor units via the currency offset); ads link to the store's public address with UTM tags and are refused if the store has no public https address. Ad-account calls use the user token, posting uses the Page token.
- **WhatsApp:** stays Twilio (admin assigns each seller a number). Replies and customer messages go out FROM the seller's number; the webhook rejects anything without a valid Twilio signature. Messages Orbit sends first use a Meta-approved Twilio Content Template when the admin saved its SID (Super Admin > WhatsApp); otherwise plain text (sandbox / inside 24 h).
- **Pixel & sales ads:** with a Pixel ID the store fires ViewContent / AddToCart / InitiateCheckout / Purchase, every order also goes to the Conversions API (same event id → counted once), and new ads use OUTCOME_SALES optimised for Purchase; if Meta won't use the pixel with that ad account the ad is built for clicks instead and the reason is saved.
- **DMs:** Messenger + Instagram DMs are answered by the same store chatbot and logged in the Inbox (channels `messenger` / `instagram`); photos get an honest "text only" reply.
- **Billing:** changing plan while subscribed updates the same Stripe subscription (prorated) — never a second checkout. When a subscription ends (canceled / unpaid) the seller drops to Starter with `monthlyUsageCapUsd = 0`: the store stays online but AI agents pause until they pick a plan (owner may want to review this rule). past_due keeps the plan while Stripe retries.
- **Custom domains:** seller adds domain → TXT `_orbit-verify` + CNAME (sub-domain) / A (bare) → Check verifies via public DNS → `proxy.ts` serves the store there; the dashboard is never served on a store domain. Vercel: domain auto-added (VERCEL_TOKEN/PROJECT_ID). VPS: Caddy on-demand TLS asking `/api/domains/allowed`.
- **Orbit Studio:** own thin wrapper, models called directly (not Higgsfield — it's a wrapper with a margin). Images = Google Nano Banana 2 (Gemini image model), videos = ByteDance Seedance 2.0 on BytePlus ModelArk (voice/sound included). Only `lib/studio/providers.ts` talks to models, so they can be swapped. **Growth ($75) and Scale ($150) only**: 50 images + 5 reels / 100 images + 12 reels a month (admin-editable). Failed jobs don't count; regenerating does. Studio spend is excluded from the AI-chat usage cap. Every video starts from a still frame made with the real product photo. The director (Claude) shows the plan — storyboard, script, caption — before anything is paid for.

## 6. Status

**Done (recent, 2026-09-25 → 26):** onboarding extracts WhatsApp/socials (+AI web lookup) and sets store currency from `.pk`/`+92`; thinking-orb animation + chat redesign; Orchestrator store-settings / product / variant / add / delete powers; media library + chat attachments + voice notes + catalog-PDF photo extraction + `open_media`; product photo upload in Store; Cloudflare R2 storage + admin page; Brave web search + limits + admin page; platform map + live store status; Orchestrator → Orbit Design (build/edit/publish via proposals).

**Not yet verified live:** Meta ads (incl. sales objective) / FB+IG posting / Meta health / Conversions API / Messenger+IG DM webhook against the real Graph API, WhatsApp Content Templates, Stripe checkout/portal/webhooks against real Stripe (tested with a fake Stripe + signed webhooks), a real Postgres host (tested on local Postgres 16), Twilio signature + sending, and custom-domain DNS + Vercel domain add (all tested end-to-end only against a mock Graph/Twilio server + Playwright); Orbit Studio against the real Gemini / Seedance APIs (tested end-to-end only with a mock server — request shapes and model ids `gemini-3.1-flash-image-preview` / `dreamina-seedance-2-0-fast` must be confirmed with real keys via Super Admin > Studio > Test);  Apply → Orbit Design background build posting back to chat; real R2 bucket (no keys yet); real Brave search (no key yet); video & voice-note upload in a browser.

**Open / next:**
- Owner still to do: create a Postgres (Neon/Supabase) and set `DATABASE_URL`/`DIRECT_URL`, run `npx prisma migrate deploy` (and `npm run db:copy-sqlite prisma/dev.db` once for old local data); deploy Orbit on a public https domain (needed for Instagram, ads links, Twilio + Meta webhooks, custom domains), Cloudflare R2 (required on Vercel for uploads), Brave API key, Meta App Review (ads_management, pages_manage_posts, instagram_content_publish, business_management, pages_messaging, pages_manage_metadata, instagram_manage_messages) with `/privacy` as the privacy URL, Meta webhook (callback `/api/webhooks/meta`, verify token in Super Admin, subscribe Page + Instagram `messages`), Twilio keys + webhook URL + the 9 WhatsApp templates (Super Admin > WhatsApp), Stripe: price ids, webhook secret, and save the Customer portal once in Stripe settings; `LEGAL_CONTACT_EMAIL`; have a lawyer review /privacy and /terms (governing law not stated); Vercel token for custom domains, Google AI Studio + BytePlus keys for Studio.
- Jev layer (on hold).
- Decide whether to retire the old competitor-based weekly plan (`runCompetitorAnalysis` + "Your Weekly Plan").
- Detailed task history: `TASKS.md`.

## 7. Changelog (newest first — add one entry per session/batch of work)

- **2026-09-26 · cloud** — **Everything left that Claude could do.** (1) **Postgres**: datasource → PostgreSQL, one baseline migration `20260926200000_init_postgres`, SQLite history in `prisma/sqlite-archive/`, `scripts/sqlite-to-postgres.mjs` (`npm run db:copy-sqlite`), case-insensitive order search. (2) Uploads served by `app/uploads/[...path]` (range support, traversal-safe); no silent file loss on serverless without R2. (3) **WhatsApp templates** for out-of-window messages (`lib/whatsapp-templates.ts`, Super Admin > WhatsApp). (4) **Pixel + Conversions API + sales-optimised ads** (migration `20260926210000_meta_pixel_capi_sales_ads`; Ads page shows sales, value, return). (5) **Messenger / Instagram DMs** → chatbot + Inbox (`lib/meta-messaging.ts`, `/api/webhooks/meta`). (6) **/privacy + /terms**, linked from landing, pricing, signup. (7) **Billing fixes**: plan change no longer creates a 2nd subscription (double charge), Stripe billing portal, ended subscriptions pause AI, webhook finds seller by customer. (8) **AI onboarding questions** (migration `20260926220000_onboarding_answers`). Tests 48 green; tsc/eslint 0; production build + `next start` checked (uploads 200/206).

- **2026-09-26 · cloud** — **Ready for Meta, WhatsApp and custom domains.** Meta ads rebuilt: old code made empty campaigns (no ad set targeting, no creative, no ad) with the Page token and USD cents — now complete paused ads in the account currency, rollback, activate all three objects, review status + spend/impressions/clicks, new Ads page. FB/IG posting of Studio images & reels (Share box, post history). Meta connection check with Page / ad-account picker; OAuth now saves the user token (+ `business_management` scope). Orchestrator `social_posts` / `meta_ads` proposals. WhatsApp: Twilio signature check (was open — anyone could fake a customer "YES"), replies from the seller's number, Super Admin > WhatsApp (webhook URL, test send). Custom domains (`proxy.ts`, DNS verification, Vercel API, Caddy ask). Fixed wrong tracking link (`/order/<id>` → store order page), hard-coded "Rs" in cart recovery, store sitemap on the real domain. Migration `20260926150000_meta_and_domains`. Tests: `lib/ready.test.ts`.
- **2026-09-26 · cloud** — **All TypeScript + lint errors fixed** (4 tsc, 60 eslint → 0). Real bug: `AccountWidget` called hooks after an early return (store account page crash). Effects that set state moved to render-time adjustments / `useSyncExternalStore` (cart, theme, tab hash, recently viewed).
- **2026-09-26 · cloud** — **Orbit Studio**: 21 formats as data (product shots, lifestyle, flat lay, placement, social post, sale poster, banner, background change, enhance, virtual try-on, brand face; product reel, animate photo, unboxing, UGC review, how-to, announcement, try-on haul, CGI, cinematic, 15s story ad). Each asks for exactly the material it needs; a Claude "director" (with `director-guide.ts` = the prompting skill) plans a storyboard/script/caption first; then Gemini image → (video) Seedance with sound. New `StudioJob` model (migration `20260926120000_orbit_studio`), Content page Studio UI, Orchestrator `create_content` proposals, Super Admin > Studio (keys, model ids, prices, limits, live tests, spend). Unit tests `lib/studio/studio.test.ts`; full flow checked with a mock AI server + Playwright.
- **2026-09-26 · cloud** — Media dedupe: `MediaAsset.hash` (sha256 of uploaded bytes, migration `20260926090000_media_dedupe`). Same file uploaded again (chat / library / store / `/api/upload`) returns the existing item (`duplicate: true`); catalog-PDF photos already in the library are reused, not re-extracted. Deleting a PDF no longer deletes its extracted photos (they may be on products or shared). Old rows have no hash, so duplicates made before this stay. Tested locally via dev server + curl. Files: `lib/media.ts`, `app/api/media/route.ts`, `app/api/upload/route.ts`, `MediaLibrary.tsx`, `ChatAttachments.tsx`.
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
