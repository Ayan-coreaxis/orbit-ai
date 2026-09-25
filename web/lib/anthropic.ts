import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Real, curated catalog of Claude models the Super Admin can pick from at /admin/ai-model —
 * every model this platform is allowed to call. `tier` is just a display grouping, not a real
 * Anthropic concept. Keep in sync with the rates in lib/pricing.ts when adding a new one.
 */
export interface ModelOption {
  id: string;
  label: string;
  tier: "Latest" | "Previous generation";
  note?: string;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  { id: "claude-opus-5", label: "Opus 5", tier: "Latest", note: "Most capable — highest cost" },
  { id: "claude-sonnet-5", label: "Sonnet 5", tier: "Latest", note: "Best balance of capability and cost" },
  { id: "claude-fable-5-1", label: "Fable 5.1", tier: "Latest" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", tier: "Latest", note: "Fastest, cheapest" },
  { id: "claude-sonnet-4-5", label: "Sonnet 4.5", tier: "Previous generation" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5 (4.5 series)", tier: "Previous generation" },
];

const DEFAULT_MODEL = "claude-sonnet-4-5";
const DEFAULT_MODEL_FAST = "claude-haiku-4-5";

const PRIMARY_KEY = "ai_model_primary";
const FAST_KEY = "ai_model_fast";

/**
 * Real, admin-configurable model selection — every `anthropic.messages.create({ model: MODEL })`
 * call across the app reads these same two exported bindings. Because ES module exports are live
 * references, reassigning them here (via `refreshModelConfig`) updates every already-imported
 * call site immediately, with no per-file changes needed and no server restart required after the
 * Super Admin saves a new selection from /admin/ai-model.
 */
export let MODEL: string = DEFAULT_MODEL;
/** Cheaper model for high-volume, lower-stakes specialist calls. */
export let MODEL_FAST: string = DEFAULT_MODEL_FAST;

let loaded = false;

/** Reads the real saved selection (if any) from the DB and applies it. Called once lazily on
 * first real use, and again immediately after the Super Admin saves a change. */
export async function refreshModelConfig(): Promise<void> {
  try {
    const rows = await prisma.platformSetting.findMany({ where: { key: { in: [PRIMARY_KEY, FAST_KEY] } } });
    const primary = rows.find((r) => r.key === PRIMARY_KEY)?.value;
    const fast = rows.find((r) => r.key === FAST_KEY)?.value;
    if (primary && AVAILABLE_MODELS.some((m) => m.id === primary)) MODEL = primary;
    if (fast && AVAILABLE_MODELS.some((m) => m.id === fast)) MODEL_FAST = fast;
  } catch {
    // No PlatformSetting rows yet, or DB not reachable at import time — real defaults above
    // already cover this, so a real AI call still works rather than throwing at cold start.
  } finally {
    loaded = true;
  }
}

/** Every real code path that reads MODEL/MODEL_FAST calls this first — a no-op after the first
 * real load, so it's cheap to sprinkle at the top of any route that makes an AI call. */
export async function ensureModelConfigLoaded(): Promise<void> {
  if (!loaded) await refreshModelConfig();
}

// Kick off a real load the moment this module is first imported (server cold start), so a saved
// admin selection is already in effect for the first real request in the common case, without
// making every one of this file's many call sites `await` anything new.
void refreshModelConfig();
