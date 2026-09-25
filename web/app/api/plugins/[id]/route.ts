import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { installPlugin, uninstallPlugin } from "@/lib/plugin-install";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 401 });
  const { id } = await params;
  const action = new URL(req.url).searchParams.get("action");

  try {
    if (action === "uninstall") {
      return NextResponse.json(await uninstallPlugin(businessId, id));
    }
    return NextResponse.json(await installPlugin(businessId, id));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 400 });
  }
}
