import { SettingsHeader } from "@/components/settings/SettingsHeader";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { PluginsManager } from "@/components/PluginsManager";
import { McpConnectionsManager } from "@/components/McpConnectionsManager";
import { SkillsManager } from "@/components/SkillsManager";

export default async function ConnectionsPage() {
  const businessId = await getActiveBusinessId();

  return (
    <div className="space-y-5">
      <SettingsHeader
        title="Connections & skills"
        description="One shared pool of tools and guidance. Each run, an agent pulls in only what fits the task, then drops it. Start with a plugin for a ready-made bundle, or add pieces one by one."
      />
      {!businessId ? (
        <p className="text-[13.5px] text-text-faint">No business yet — finish setup first.</p>
      ) : (
        <>
          <PluginsManager />
          <McpConnectionsManager />
          <SkillsManager />
        </>
      )}
    </div>
  );
}
