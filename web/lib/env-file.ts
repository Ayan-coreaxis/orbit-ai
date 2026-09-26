import fs from "fs";
import path from "path";
import { WA_TEMPLATES } from "@/lib/whatsapp-templates";

const ENV_PATH = path.join(process.cwd(), ".env.local");

export const KEY_ENV_MAP: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  stripe: "STRIPE_SECRET_KEY",
  meta_app_id: "META_APP_ID",
  meta_app_secret: "META_APP_SECRET",
  meta_login_config_id: "META_LOGIN_CONFIG_ID",
  meta_webhook_verify_token: "META_WEBHOOK_VERIFY_TOKEN",
  legal_contact_email: "LEGAL_CONTACT_EMAIL",
  resend: "RESEND_API_KEY",
  email_from: "EMAIL_FROM",
  twilio: "TWILIO_AUTH_TOKEN",
  twilio_sid: "TWILIO_ACCOUNT_SID",
  twilio_whatsapp: "TWILIO_WHATSAPP_FROM",
  apify_token: "APIFY_API_TOKEN",
  stripe_price_starter: "STRIPE_PRICE_STARTER",
  stripe_price_growth: "STRIPE_PRICE_GROWTH",
  stripe_price_scale: "STRIPE_PRICE_SCALE",
  stripe_webhook_secret: "STRIPE_WEBHOOK_SECRET",
  r2_account_id: "R2_ACCOUNT_ID",
  r2_access_key_id: "R2_ACCESS_KEY_ID",
  r2_secret_access_key: "R2_SECRET_ACCESS_KEY",
  r2_bucket: "R2_BUCKET",
  r2_public_url: "R2_PUBLIC_URL",
  openai_whisper: "OPENAI_API_KEY",
  brave_search: "BRAVE_SEARCH_API_KEY",
  web_search_enabled: "WEB_SEARCH_ENABLED",
  web_search_country: "WEB_SEARCH_COUNTRY",
  web_search_per_turn: "WEB_SEARCH_PER_TURN",
  web_search_limit_starter: "WEB_SEARCH_LIMIT_STARTER",
  web_search_limit_growth: "WEB_SEARCH_LIMIT_GROWTH",
  web_search_limit_scale: "WEB_SEARCH_LIMIT_SCALE",
  twilio_webhook_url: "TWILIO_WEBHOOK_URL",
  vercel_token: "VERCEL_TOKEN",
  vercel_project_id: "VERCEL_PROJECT_ID",
  vercel_team_id: "VERCEL_TEAM_ID",
  store_domain_cname: "STORE_DOMAIN_CNAME",
  store_domain_ip: "STORE_DOMAIN_IP",
  gemini_image: "GEMINI_API_KEY",
  seedance_video: "SEEDANCE_API_KEY",
  studio_enabled: "STUDIO_ENABLED",
  studio_image_model: "STUDIO_IMAGE_MODEL",
  studio_video_model: "STUDIO_VIDEO_MODEL",
  studio_video_base_url: "SEEDANCE_BASE_URL",
  studio_video_resolution: "STUDIO_VIDEO_RESOLUTION",
  studio_image_cost: "STUDIO_IMAGE_COST_USD",
  studio_video_cost_per_sec: "STUDIO_VIDEO_COST_PER_SEC_USD",
  studio_limit_images_growth: "STUDIO_LIMIT_IMAGES_GROWTH",
  studio_limit_videos_growth: "STUDIO_LIMIT_VIDEOS_GROWTH",
  studio_limit_images_scale: "STUDIO_LIMIT_IMAGES_SCALE",
  studio_limit_videos_scale: "STUDIO_LIMIT_VIDEOS_SCALE",
  // Approved WhatsApp template Content SIDs (Super Admin > WhatsApp)
  ...Object.fromEntries(WA_TEMPLATES.map((t) => [`wa_template_${t.kind}`, t.env])),
};

/**
 * Keys saved in Super Admin are stored ENCRYPTED in the database (PlatformSetting "env:<NAME>")
 * and copied into process.env — so they work on hosts with a read-only disk (Vercel) and on every
 * server instance. Each instance loads them at boot and refreshes every minute (instrumentation.ts).
 * .env.local is still written when the disk allows it (local development).
 */

const PREFIX = "env:";
let lastLoad = 0;

export async function loadStoredKeys(force = false): Promise<void> {
  if (!force && Date.now() - lastLoad < 60_000) return;
  lastLoad = Date.now();
  try {
    const { prisma } = await import("@/lib/prisma");
    const { open } = await import("@/lib/secret-box");
    const rows = await prisma.platformSetting.findMany({ where: { key: { startsWith: PREFIX } } });
    for (const r of rows) {
      const name = r.key.slice(PREFIX.length);
      const v = open(r.value);
      if (v !== null) process.env[name] = v;
    }
  } catch {
    /* DB not ready yet — the host's own env vars still apply */
  }
}

export function getKeyStatus(): Record<string, boolean> {
  const status: Record<string, boolean> = {};
  for (const [id, envName] of Object.entries(KEY_ENV_MAP)) {
    const value = process.env[envName]?.trim();
    status[id] = !!value && value !== "paste_your_key_here";
  }
  return status;
}

export async function setKey(id: string, value: string): Promise<void> {
  const envName = KEY_ENV_MAP[id];
  if (!envName) throw new Error(`Unknown key id: ${id}`);
  const { prisma } = await import("@/lib/prisma");
  const { seal } = await import("@/lib/secret-box");
  await prisma.platformSetting.upsert({
    where: { key: PREFIX + envName },
    create: { key: PREFIX + envName, value: seal(value) },
    update: { value: seal(value) },
  });
  // Take effect in this running server right away — code reads process.env at call time.
  process.env[envName] = value;
  try {
    const lines = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf-8").split("\n").filter((l) => l.trim().length > 0) : [];
    const idx = lines.findIndex((l) => l.startsWith(`${envName}=`));
    if (idx >= 0) lines[idx] = `${envName}=${value}`;
    else lines.push(`${envName}=${value}`);
    fs.writeFileSync(ENV_PATH, lines.join("\n") + "\n", "utf-8");
  } catch {
    /* read-only disk (serverless) — the database copy is the source of truth */
  }
}
