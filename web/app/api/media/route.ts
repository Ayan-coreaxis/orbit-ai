import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { MediaError, listMedia, saveMedia, toView, type MediaKind } from "@/lib/media";

export const runtime = "nodejs";
export const maxDuration = 180;

/** The business's media library, newest first. ?kind=image to filter. */
export async function GET(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const kind = req.nextUrl.searchParams.get("kind") as MediaKind | null;
  return NextResponse.json({ media: await listMedia(businessId, { kind: kind ?? undefined }) });
}

/**
 * Upload one file (multipart "file"). Optional: "frames" (video stills captured in the browser),
 * "transcript" (what the browser heard while a voice note was recorded), "source" (chat|store).
 * A file already in the library comes back as the existing item with `duplicate: true`.
 */
export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Send the file as multipart/form-data." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file." }, { status: 400 });
  const frames = form.getAll("frames").filter((f): f is File => f instanceof File);
  const transcript = form.get("transcript");
  const source = form.get("source");
  try {
    const m = await saveMedia(businessId, file, {
      frames,
      transcript: typeof transcript === "string" ? transcript : undefined,
      source: typeof source === "string" ? source : undefined,
    });
    return NextResponse.json({ media: toView(m), duplicate: m.duplicate });
  } catch (e) {
    if (e instanceof MediaError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.warn("[media] upload failed:", String(e).slice(0, 200));
    return NextResponse.json({ error: "Couldn't save that file — try again." }, { status: 500 });
  }
}
