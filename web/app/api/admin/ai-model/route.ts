import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AVAILABLE_MODELS, MODEL, MODEL_FAST, refreshModelConfig } from "@/lib/anthropic";

const PRIMARY_KEY = "ai_model_primary";
const FAST_KEY = "ai_model_fast";

/** Real, current model selection for the Super Admin's /admin/ai-model page — the exact catalog
 * of models this platform is allowed to call, plus whichever two are active right now. */
export async function GET() {
  const authed = await isAdminAuthenticated();
  if (!authed) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  return NextResponse.json({
    models: AVAILABLE_MODELS,
    primary: MODEL,
    fast: MODEL_FAST,
  });
}

/** Saves a real model choice for one role ("primary" or "fast") and applies it immediately —
 * every route across the app that reads MODEL/MODEL_FAST picks up the change on its very next
 * real AI call, no restart. */
export async function POST(req: NextRequest) {
  const authed = await isAdminAuthenticated();
  if (!authed) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const { role, modelId } = await req.json();
  if (role !== "primary" && role !== "fast") {
    return NextResponse.json({ error: "role must be 'primary' or 'fast'." }, { status: 400 });
  }
  if (!AVAILABLE_MODELS.some((m) => m.id === modelId)) {
    return NextResponse.json({ error: "Unknown model." }, { status: 400 });
  }

  await prisma.platformSetting.upsert({
    where: { key: role === "primary" ? PRIMARY_KEY : FAST_KEY },
    update: { value: modelId },
    create: { key: role === "primary" ? PRIMARY_KEY : FAST_KEY, value: modelId },
  });
  await refreshModelConfig();

  return NextResponse.json({ primary: MODEL, fast: MODEL_FAST });
}
