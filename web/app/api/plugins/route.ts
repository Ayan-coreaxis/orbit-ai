import { NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { PLUGINS, pluginIsValid, pluginSummary } from "@/lib/plugins";
import { installedPluginIds } from "@/lib/plugin-install";

export async function GET() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 401 });
  const installed = new Set(await installedPluginIds(businessId));
  return NextResponse.json({
    plugins: PLUGINS.filter(pluginIsValid).map((p) => ({ ...pluginSummary(p), installed: installed.has(p.id) })),
  });
}
