# Putting Orbit live — step by step

Everything the platform owner does once to take Orbit to production. Every step also appears in
**Super Admin → Overview → Go-live checklist**, which shows what is still missing.

Recommended hosting: **Vercel** (app + cron jobs) + **Neon** (Postgres) + **Cloudflare R2** (files).

---

## 1. Database — Neon (or Supabase)

1. Create a project at neon.tech (region close to your users, e.g. Singapore / Frankfurt).
2. Copy two connection strings:
   - **pooled** → `DATABASE_URL` (add `?sslmode=require&pgbouncer=true&connection_limit=5`)
   - **direct** → `DIRECT_URL` (`?sslmode=require`)
3. Tables are created by the build (step 3) with `npx prisma migrate deploy`.
4. Moving old local data from SQLite (optional, into the EMPTY database):
   `cd web && DATABASE_URL=… npm run db:copy-sqlite prisma/dev.db`

## 2. Files — Cloudflare R2 (required on Vercel)

1. Cloudflare → R2 → create a bucket (e.g. `orbit-media`), enable its public `r2.dev` URL or a custom domain.
2. R2 → Manage API tokens → create a token with Object Read & Write for that bucket.
3. Paste Account ID, Access Key ID, Secret, bucket name and public URL in **Super Admin → Storage**
   (or as env vars `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`).

## 3. App — Vercel

1. Import the GitHub repo in Vercel. **Root directory: `web`**.
2. Build command: `npx prisma migrate deploy && next build` (install runs `prisma generate` automatically).
3. Environment variables (Production):

| Variable | Value |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | from step 1 |
| `AUTH_SECRET` | random, 48+ chars — `openssl rand -base64 36`. Changing it later logs everyone out. |
| `ADMIN_PASSWORD` | long password for `/admin-login` |
| `NEXT_PUBLIC_APP_URL` | `https://yourdomain.com` (no trailing slash) |
| `CRON_SECRET` | random string — Vercel Cron sends it; cron jobs refuse to run without it in production |
| `ANTHROPIC_API_KEY` | console.anthropic.com |

   Every other key can be pasted later in **Super Admin → API Keys** (stored encrypted in the database, works on
   Vercel and every server instance within a minute) or set as env vars (see `web/.env.example`).
   A key saved in Super Admin takes priority over the same env var.
4. Domain: Vercel → Project → Domains → add `yourdomain.com`. Set `NEXT_PUBLIC_APP_URL` to it and redeploy.
5. Cron jobs come from `web/vercel.json` automatically: abandoned carts, review requests, stale COD orders,
   growth-plan reviews, courier status sync.
6. Check `https://yourdomain.com/api/health` → `{"ok":true,"db":"up"}`.

## 4. Seller billing — Stripe

1. Stripe → Products: create Starter ($50), Growth ($75), Scale ($150), monthly recurring. Copy the three **price ids**.
2. Developers → API keys → secret key.
3. Developers → Webhooks → add endpoint `https://yourdomain.com/api/webhooks/stripe`, events:
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Copy the signing secret.
4. Settings → Billing → **Customer portal** → turn on and Save (sellers manage cards / cancel there).
5. Paste secret key, 3 price ids and webhook secret in Super Admin → API Keys.

## 5. Meta (Facebook, Instagram, ads, DMs, Pixel)

1. developers.facebook.com → Create app (type Business). Add products: Facebook Login for Business, Instagram, Marketing API, Messenger, Webhooks.
2. Facebook Login → Valid OAuth redirect URI: `https://yourdomain.com/api/oauth/meta/callback`.
3. App settings → Basic: Privacy Policy URL `https://yourdomain.com/privacy`, Terms `https://yourdomain.com/terms`,
   data deletion instructions URL `https://yourdomain.com/privacy#data-deletion`.
4. Webhooks: callback `https://yourdomain.com/api/webhooks/meta`, verify token = the one you set in Super Admin
   (`META_WEBHOOK_VERIFY_TOKEN`). Subscribe the **Page** object and the **Instagram** object to `messages`.
5. App Review — request: `pages_show_list, pages_read_engagement, pages_manage_posts, pages_manage_metadata, pages_messaging,
   instagram_basic, instagram_content_publish, instagram_manage_messages, ads_management, ads_read, business_management`.
   Until approved, only people added as app testers can connect.
6. Paste App ID and App Secret in Super Admin → API Keys.

## 6. WhatsApp — Twilio

1. Twilio → register a WhatsApp sender (or use the sandbox to test).
2. Super Admin → API Keys: Account SID, Auth Token, WhatsApp sender.
3. Super Admin → WhatsApp: copy the webhook URL into Twilio ("When a message comes in", POST) for every sender number.
4. Super Admin → WhatsApp → Approved message templates: create the 9 templates in Twilio Content Template Builder
   with the shown bodies, submit for approval, paste each Content SID.
5. Assign each seller a number on the Sellers page.

## 7. Email — Resend

1. resend.com → add and verify your sending domain (DNS records).
2. Create an API key. Super Admin → API Keys: Resend key and sender, e.g. `Orbit <orders@yourdomain.com>`.

## 8. Optional

- **Orbit Studio:** Google AI Studio key (`GEMINI_API_KEY`) + BytePlus ModelArk key (`SEEDANCE_API_KEY`) → Super Admin → Studio → Test.
- **Web search:** Brave Search API key → Super Admin → Web search.
- **Natural voice:** Google Cloud Text-to-Speech key (`GOOGLE_TTS_API_KEY`).
- **Sellers' own domains:** Vercel token + project id (+ team id) in Super Admin → API Keys.
- **Contact email** on Privacy / Terms: `LEGAL_CONTACT_EMAIL`.

## 9. Before announcing

- Super Admin → Overview: go-live checklist has no red items.
- Sign up as a test seller, finish onboarding, publish the store, place a COD order and a card order,
  book it with your courier, connect Meta and post one image, send a WhatsApp test.
- Have a lawyer review `/privacy` and `/terms` (governing law is not stated yet).
