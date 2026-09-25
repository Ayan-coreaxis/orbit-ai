import { prisma } from "@/lib/prisma";
import { getConnector } from "@/lib/known-mcp-connectors";
import { getPlugin, pluginIsValid, type PluginDef } from "@/lib/plugins";

export interface InstallResult {
  alreadyInstalled?: boolean;
  connectionsCreated: number;
  skillsCreated: number;
  needsAuth: string[]; // connection names that still need OAuth sign-in or an API key
}

export async function installPlugin(businessId: string, pluginId: string): Promise<InstallResult> {
  const plugin = getPlugin(pluginId);
  if (!plugin || !pluginIsValid(plugin)) throw new Error("Unknown or invalid plugin.");

  const already = await prisma.pluginInstall.findUnique({
    where: { businessId_pluginId: { businessId, pluginId } },
  });
  if (already) return { alreadyInstalled: true, connectionsCreated: 0, skillsCreated: 0, needsAuth: [] };

  const existingSkillNames = new Set(
    (await prisma.skill.findMany({ where: { businessId }, select: { name: true } })).map((s) => s.name.toLowerCase()),
  );

  let connectionsCreated = 0;
  let skillsCreated = 0;
  const needsAuth: string[] = [];

  for (const m of plugin.mcp) {
    const c = getConnector(m.connectorId)!;
    const authType = c.authType === "oauth" ? "oauth" : c.authType === "api_key" ? "api_key" : "none";
    await prisma.mcpConnection.create({
      data: {
        businessId,
        name: c.name,
        connectorId: c.id,
        mcpServerUrl: c.urlTemplate,
        authType,
        skill: m.skill ?? null,
        sourcePluginId: pluginId,
        lastStatus: authType === "oauth" ? "pending_oauth" : null,
      },
    });
    connectionsCreated++;
    if (authType !== "none") needsAuth.push(c.name);
  }

  for (const s of plugin.skills) {
    if (existingSkillNames.has(s.name.toLowerCase())) continue;
    await prisma.skill.create({
      data: {
        businessId,
        name: s.name,
        description: s.description,
        instructions: s.instructions,
        alwaysOn: !!s.alwaysOn,
        sourcePluginId: pluginId,
      },
    });
    skillsCreated++;
  }

  await prisma.pluginInstall.create({ data: { businessId, pluginId } });
  return { connectionsCreated, skillsCreated, needsAuth };
}

export async function uninstallPlugin(businessId: string, pluginId: string): Promise<{ removed: number }> {
  const [conns, skills] = await prisma.$transaction([
    prisma.mcpConnection.deleteMany({ where: { businessId, sourcePluginId: pluginId } }),
    prisma.skill.deleteMany({ where: { businessId, sourcePluginId: pluginId } }),
  ]);
  await prisma.pluginInstall.deleteMany({ where: { businessId, pluginId } });
  return { removed: conns.count + skills.count };
}

export async function installedPluginIds(businessId: string): Promise<string[]> {
  const rows = await prisma.pluginInstall.findMany({ where: { businessId }, select: { pluginId: true } });
  return rows.map((r) => r.pluginId);
}

export type { PluginDef };
