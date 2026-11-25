import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { siteState } from "@/lib/store-site-state";
import { assertUnderUsageCap, UsageCapExceededError } from "@/lib/usage-limit";
import { continueBuild, discardSite, keepRefs, runBuild, saveCustomise, saveEdits, startBuild, undoSite } from "@/lib/store-site-build";
import { loadSite } from "@/lib/store-site-data";
import { buildRunning } from "@/lib/store-site";
import { screenshotSite, firstSiteUrl } from "@/lib/screenshot";
import type { AgentRef } from "@/lib/store-agent";

export const maxDuration = 800; // the build runs after the response

const IMG = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/;
function ref(s: unknown): AgentRef | null {
  const m = typeof s === "string" && s.length < 7_000_000 ? IMG.exec(s.trim()) : null;
  return m ? { mediaType: m[1] as AgentRef["mediaType"], data: m[2] } : null;
}

/** Where the build stands, and the pages so far. */
export async function GET() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  return NextResponse.json(await siteState(businessId));
}

/** Start a build (first brief) or an edit (chat message). Answers at once; the work goes on in the background. */
export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { message?: string; images?: unknown[]; build?: boolean };
  const message = (body.message ?? "").trim().slice(0, 12000);
  const refs = (Array.isArray(body.images) ? body.images : []).slice(0, 8).map(ref).filter((x): x is AgentRef => !!x);
  if (!message && !refs.length) return NextResponse.json({ error: "Say what you'd like." }, { status: 400 });
  try {
    await assertUnderUsageCap(businessId);
  } catch (e) {
    if (e instanceof UsageCapExceededError) return NextResponse.json({ error: e.message }, { status: 402 });
    throw e;
  }
  const { draft } = await loadSite(businessId);
  const kind = body.build || !draft?.files["pages/home.html"] ? "build" : "edit";
  const b = await startBuild(businessId, kind);
  if (!b) return NextResponse.json({ error: "Your store is being worked on right now. Wait for it to finish, or stop it." }, { status: 409 });
  await prisma.orbitDesignTurn.create({ data: { businessId, role: "user", content: message || "Follow this picture." } });
  after(async () => {
    await keepRefs(businessId, b, refs);
    const url = firstSiteUrl(message);
    const shot = url ? await screenshotSite(url).catch(() => null) : null;
    if (shot) refs.push({ data: shot.data, mediaType: shot.mediaType as AgentRef["mediaType"] });
    const note = shot ? `\n\nThe last attached image is a screenshot of ${url}, a site the seller mentions. Learn its layout and mood; do not copy its brand, text or pictures.` : "";
    await runBuild(businessId, b, (message || "Follow the attached picture.") + note, refs);
  });
  return NextResponse.json(await siteState(businessId));
}

/** Stop the running build, or undo the last change. */
export async function PATCH(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; edits?: unknown; menu?: unknown; settings?: unknown; lists?: unknown };
  const { action } = body;
  const { build } = await loadSite(businessId);
  if (action === "stop") {
    if (build && buildRunning(build)) await prisma.storeDesign.update({ where: { businessId }, data: { siteBuild: JSON.stringify({ ...build, stop: true }) } });
  } else if (action === "undo") {
    if (buildRunning(build)) return NextResponse.json({ error: "Wait for the current change to finish." }, { status: 409 });
    if (!(await undoSite(businessId))) return NextResponse.json({ error: "Nothing to undo." }, { status: 404 });
  } else if (action === "continue") {
    try {
      await assertUnderUsageCap(businessId);
    } catch (e) {
      if (e instanceof UsageCapExceededError) return NextResponse.json({ error: e.message }, { status: 402 });
      throw e;
    }
    const go = await continueBuild(businessId);
    if (!go) return NextResponse.json({ error: "There is nothing to continue." }, { status: 409 });
    after(go);
  } else if (action === "discard") {
    const error = await discardSite(businessId);
    if (error) return NextResponse.json({ error }, { status: 409 });
  } else if (action === "edit" || action === "customise") {
    const error = action === "edit" ? await saveEdits(businessId, body.edits) : await saveCustomise(businessId, body);
    if (error) return NextResponse.json({ error }, { status: 400 });
  } else return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  return NextResponse.json(await siteState(businessId));
}
