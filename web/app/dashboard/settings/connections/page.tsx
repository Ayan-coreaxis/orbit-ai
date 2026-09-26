import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { Card } from "@/components/ui";
import { ArrowLeft } from "lucide-react";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { PluginsManager } from "@/components/PluginsManager";
import { McpConnectionsManager } from "@/components/McpConnectionsManager";
import { SkillsManager } from "@/components/SkillsManager";

export default async function ConnectionsPage() {
  const businessId = await getActiveBusinessId();

  return (
    <div>
      <Topbar title="Connections & Skills" subtitle="Tools and guidance your agents pull in when a task needs them" />
      <div className="max-w-[940px] space-y-5 p-5 sm:p-8 lg:p-10">
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-1.5 text-[13.5px] text-text-faint hover:text-text-dim"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Settings &amp; Billing
        </Link>

        <p className="max-w-2xl text-[13px] leading-relaxed text-text-dim">
          Everything here lives in one shared pool. Your agents don&apos;t get a fixed tool list —
          each run, an agent looks at the task in front of it and pulls in only the tools and
          skills that fit, then drops them. Start with a <span className="text-text">plugin</span> for a
          ready-made bundle, or wire things up piece by piece below.
        </p>

        {!businessId ? (
          <Card className="p-6">
            <p className="text-[13.5px] text-text-faint">No business yet — finish setup first.</p>
          </Card>
        ) : (
          <>
            <PluginsManager />
            <McpConnectionsManager />
            <SkillsManager />
          </>
        )}
      </div>
    </div>
  );
}
