import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { getKeyStatus } from "@/lib/env-file";
import { R2_PRICING, migrateLocalToR2, storageUsage, testR2 } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Storage status for Super Admin > Storage: mode, non-secret R2 settings, usage and cost estimate. */
export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const status = getKeyStatus();
  return NextResponse.json({
    usage: await storageUsage(),
    pricing: R2_PRICING,
    fields: {
      r2_account_id: { set: !!status.r2_account_id, value: process.env.R2_ACCOUNT_ID ?? "" },
      r2_access_key_id: { set: !!status.r2_access_key_id, value: "" },
      r2_secret_access_key: { set: !!status.r2_secret_access_key, value: "" },
      r2_bucket: { set: !!status.r2_bucket, value: process.env.R2_BUCKET ?? "" },
      r2_public_url: { set: !!status.r2_public_url, value: process.env.R2_PUBLIC_URL ?? "" },
      openai_whisper: { set: !!status.openai_whisper, value: "" },
    },
  });
}

/** { action: "test" } checks the R2 connection end to end; { action: "migrate" } moves local files to R2. */
export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  try {
    if (action === "test") return NextResponse.json(await testR2());
    if (action === "migrate") return NextResponse.json(await migrateLocalToR2());
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 400 });
  }
}
