import { prisma } from "@/lib/prisma";
import { appIsPublic } from "@/lib/public-url";
import { r2Config, serverlessHost } from "@/lib/storage";
import { twilioConfigured } from "@/lib/whatsapp";
import { isMetaAppConfigured } from "@/lib/meta-oauth";
import { WA_TEMPLATES, templateSid } from "@/lib/whatsapp-templates";

/**
 * One list of everything Orbit needs to run in production, and whether it's done — shown at the
 * top of Super Admin so the owner can see exactly what's missing and where to set it.
 */

export type SetupItem = { id: string; group: string; label: string; ok: boolean; required: boolean; fix: string; href?: string };

const has = (k: string) => {
  const v = process.env[k]?.trim();
  return !!v && v !== "paste_your_key_here";
};

export async function setupChecklist(): Promise<SetupItem[]> {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  const secretStrong = (process.env.AUTH_SECRET ?? "").length >= 32;
  const waTemplates = WA_TEMPLATES.filter((t) => templateSid(t.kind)).length;
  const items: SetupItem[] = [
    { id: "db", group: "Core", label: "Database (Postgres) reachable", ok: dbOk, required: true, fix: "Set DATABASE_URL and DIRECT_URL (Neon / Supabase), then run `npx prisma migrate deploy`." },
    { id: "auth", group: "Core", label: "AUTH_SECRET is long and random (32+ characters)", ok: secretStrong, required: true, fix: "Set AUTH_SECRET to a random 48-character string (e.g. `openssl rand -base64 36`). Changing it logs everyone out." },
    { id: "admin", group: "Core", label: "ADMIN_PASSWORD set (12+ characters)", ok: (process.env.ADMIN_PASSWORD ?? "").length >= 12, required: true, fix: "Set a long ADMIN_PASSWORD in the host's environment." },
    { id: "ai", group: "Core", label: "Claude API key", ok: has("ANTHROPIC_API_KEY"), required: true, fix: "Super Admin > API Keys > Anthropic.", href: "/admin/api-keys#ai" },
    { id: "public", group: "Core", label: "Orbit runs on a public https address (NEXT_PUBLIC_APP_URL)", ok: appIsPublic(), required: true, fix: "Deploy, point your domain at it and set NEXT_PUBLIC_APP_URL=https://yourdomain." },
    { id: "cron", group: "Core", label: "CRON_SECRET set (scheduled jobs run only with it in production)", ok: has("CRON_SECRET"), required: true, fix: "Set CRON_SECRET in Vercel — Vercel Cron sends it automatically." },
    { id: "storage", group: "Core", label: serverlessHost() ? "File storage (Cloudflare R2) — required on this host" : "File storage (Cloudflare R2)", ok: !!r2Config(), required: serverlessHost(), fix: "Super Admin > Storage.", href: "/admin/storage" },
    { id: "stripe", group: "Billing", label: "Stripe secret key + 3 plan price ids", ok: has("STRIPE_SECRET_KEY") && has("STRIPE_PRICE_STARTER") && has("STRIPE_PRICE_GROWTH") && has("STRIPE_PRICE_SCALE"), required: true, fix: "Super Admin > API Keys > Stripe.", href: "/admin/api-keys#stripe" },
    { id: "stripe-hook", group: "Billing", label: "Stripe webhook secret", ok: has("STRIPE_WEBHOOK_SECRET"), required: true, fix: "Stripe > Webhooks > add https://yourdomain/api/webhooks/stripe (checkout.session.completed, customer.subscription.*), paste the signing secret.", href: "/admin/api-keys#stripe" },
    { id: "meta", group: "Meta", label: "Meta app id + secret", ok: isMetaAppConfigured(), required: false, fix: "Super Admin > API Keys > Meta. App Review is needed before real sellers can connect.", href: "/admin/api-keys#meta" },
    { id: "meta-hook", group: "Meta", label: "Meta webhook verify token (Messenger / Instagram DMs)", ok: has("META_WEBHOOK_VERIFY_TOKEN"), required: false, fix: "Super Admin > API Keys, then add the webhook in your Meta app.", href: "/admin/api-keys#meta" },
    { id: "twilio", group: "WhatsApp", label: "Twilio account + WhatsApp sender", ok: twilioConfigured(), required: false, fix: "Super Admin > API keys > WhatsApp (Twilio).", href: "/admin/api-keys#whatsapp" },
    { id: "wa-templates", group: "WhatsApp", label: `Approved WhatsApp templates (${waTemplates}/${WA_TEMPLATES.length})`, ok: waTemplates === WA_TEMPLATES.length, required: false, fix: "Super Admin > WhatsApp > Approved message templates.", href: "/admin/whatsapp" },
    { id: "email", group: "Email", label: "Resend key + sender address", ok: has("RESEND_API_KEY") && has("EMAIL_FROM"), required: false, fix: "Super Admin > API Keys > Resend / Email sender.", href: "/admin/api-keys#email" },
    { id: "studio", group: "Studio", label: "Image + video model keys (Gemini, BytePlus)", ok: has("GEMINI_API_KEY") && has("SEEDANCE_API_KEY"), required: false, fix: "Super Admin > Studio, then press Test.", href: "/admin/studio" },
    { id: "search", group: "Extras", label: "Brave web search key", ok: has("BRAVE_SEARCH_API_KEY"), required: false, fix: "Super Admin > Web search.", href: "/admin/web-search" },
    { id: "legal", group: "Extras", label: "Contact email on Privacy / Terms", ok: has("LEGAL_CONTACT_EMAIL"), required: false, fix: "Super Admin > API Keys > Contact email.", href: "/admin/api-keys#email" },
    { id: "domains", group: "Extras", label: "Custom store domains (Vercel token + project id)", ok: has("VERCEL_TOKEN") && has("VERCEL_PROJECT_ID"), required: false, fix: "Super Admin > API Keys > Vercel.", href: "/admin/api-keys#domains" },
  ];
  return items;
}
