import fs from "fs";
import path from "path";

const ENV_PATH = path.join(process.cwd(), ".env.local");

export const KEY_ENV_MAP: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  stripe: "STRIPE_SECRET_KEY",
  meta_app_id: "META_APP_ID",
  meta_app_secret: "META_APP_SECRET",
  meta_login_config_id: "META_LOGIN_CONFIG_ID",
  twilio: "TWILIO_AUTH_TOKEN",
  twilio_sid: "TWILIO_ACCOUNT_SID",
  twilio_whatsapp: "TWILIO_WHATSAPP_FROM",
  apify_token: "APIFY_API_TOKEN",
  google_tts: "GOOGLE_TTS_API_KEY",
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
};

function readLines(): string[] {
  if (!fs.existsSync(ENV_PATH)) return [];
  return fs.readFileSync(ENV_PATH, "utf-8").split("\n");
}

export function getKeyStatus(): Record<string, boolean> {
  const lines = readLines();
  const status: Record<string, boolean> = {};
  for (const [id, envName] of Object.entries(KEY_ENV_MAP)) {
    const line = lines.find((l) => l.startsWith(`${envName}=`));
    const value = line?.split("=")[1]?.trim();
    status[id] = !!value && value !== "paste_your_key_here" && value.length > 0;
  }
  return status;
}

export function setKey(id: string, value: string): void {
  const envName = KEY_ENV_MAP[id];
  if (!envName) throw new Error(`Unknown key id: ${id}`);

  const lines = readLines().filter((l) => l.trim().length > 0);
  const idx = lines.findIndex((l) => l.startsWith(`${envName}=`));
  const newLine = `${envName}=${value}`;
  if (idx >= 0) {
    lines[idx] = newLine;
  } else {
    lines.push(newLine);
  }
  fs.writeFileSync(ENV_PATH, lines.join("\n") + "\n", "utf-8");
  // Take effect in this running server too — code reads process.env at call time.
  process.env[envName] = value;
}
