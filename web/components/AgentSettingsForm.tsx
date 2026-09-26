"use client";

import { useState } from "react";
import { Card, SectionLabel, Pill } from "@/components/ui";
import type { AgentSettings, SpecialistId } from "@/lib/agent-settings";
import { Settings2 } from "lucide-react";

const SPECIALIST_IDS: SpecialistId[] = ["seo", "content", "ads", "retention", "inventory", "pricing"];

type BooleanAgentSettingKey = { [K in keyof AgentSettings]: AgentSettings[K] extends boolean ? K : never }[keyof AgentSettings];

const AUTO_APPLY_COPY: Partial<Record<string, { key: BooleanAgentSettingKey; description: string }>> = {
  pricing: {
    key: "autoApplyPricing",
    description:
      "On = this agent writes the real price directly (still blocked by the margin floor and a 20% max swing per cycle). Off = it only recommends, you change the price yourself.",
  },
  seo: {
    key: "autoApplySeo",
    description:
      "On = this agent writes the real SEO title/description directly on a product or page. Off = it only recommends. Low risk — metadata only, fully reversible.",
  },
  content: {
    key: "autoApplyContent",
    description:
      "On = this agent publishes a real caption to your connected Facebook Page. Off = it only recommends. Requires Instagram/Facebook connected in Settings.",
  },
  ads: {
    key: "autoApplyAds",
    description:
      "On = this agent creates a real Meta campaign (always PAUSED — you activate real spend yourself). Off = it only recommends. Requires Instagram/Facebook connected with ads access in Settings.",
  },
};

export function AgentSettingsForm({
  agentId,
  initialSettings,
}: {
  agentId: string;
  initialSettings: AgentSettings;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const isSpecialist = (SPECIALIST_IDS as string[]).includes(agentId);
  const enabled = isSpecialist ? settings.enabledAgents.includes(agentId as SpecialistId) : true;
  const autoApply = AUTO_APPLY_COPY[agentId];

  async function save(patch: Partial<AgentSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  function toggleEnabled() {
    if (!isSpecialist) return;
    const id = agentId as SpecialistId;
    const nextEnabled = enabled
      ? settings.enabledAgents.filter((a) => a !== id)
      : [...settings.enabledAgents, id];
    save({ enabledAgents: nextEnabled });
  }

  return (
    <Card className="p-7">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-text-faint" />
          <SectionLabel>Settings</SectionLabel>
        </div>
        {saving ? (
          <span className="text-[11.5px] text-text-faint">Saving…</span>
        ) : savedAt ? (
          <span className="text-[11.5px] text-good">Saved</span>
        ) : null}
      </div>

      <div className="mt-5 space-y-6">
        {isSpecialist && (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13.5px] font-medium">Let this agent run</div>
              <p className="mt-0.5 text-[12.5px] text-text-faint">
                Off = this agent is skipped in every future weekly cycle — no task, no API call, no cost.
              </p>
            </div>
            <button
              onClick={toggleEnabled}
              className={
                "relative h-6 w-11 shrink-0 rounded-full transition-colors " +
                (enabled ? "bg-good" : "bg-panel-2")
              }
            >
              <span
                className={
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform " +
                  (enabled ? "translate-x-[22px]" : "translate-x-0.5")
                }
              />
            </button>
          </div>
        )}

        {agentId === "orchestrator" && (
          <div>
            <label className="text-[13.5px] font-medium">Target-setting style</label>
            <p className="mt-0.5 text-[12.5px] text-text-faint">
              How ambitious the Orchestrator should be when it sets this cycle&apos;s targets.
            </p>
            <div className="mt-2.5 flex gap-2">
              {(["conservative", "balanced", "aggressive"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => save({ orchestratorRiskTolerance: v })}
                  className={
                    "rounded-full px-3 py-1.5 text-[12.5px] font-medium capitalize " +
                    (settings.orchestratorRiskTolerance === v
                      ? "bg-accent text-white"
                      : "bg-panel-2 text-text-dim hover:text-text")
                  }
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}

        {agentId === "qa" && (
          <div>
            <label className="text-[13.5px] font-medium">Review strictness</label>
            <p className="mt-0.5 text-[12.5px] text-text-faint">
              How aggressively Manager/QA rewrites a specialist&apos;s task before it ships.
            </p>
            <div className="mt-2.5 flex gap-2">
              {(["lenient", "standard", "strict"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => save({ qaStrictness: v })}
                  className={
                    "rounded-full px-3 py-1.5 text-[12.5px] font-medium capitalize " +
                    (settings.qaStrictness === v
                      ? "bg-accent text-white"
                      : "bg-panel-2 text-text-dim hover:text-text")
                  }
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}

        {isSpecialist && (
          <div>
            <label className="text-[13.5px] font-medium">Brand voice & guidelines</label>
            <p className="mt-0.5 text-[12.5px] text-text-faint">
              Shared across every specialist agent (SEO, Content, Ads, Retention, Inventory, Pricing) — each one reads this before writing its task.
            </p>
            <textarea
              defaultValue={settings.brandVoice}
              onBlur={(e) => save({ brandVoice: e.target.value })}
              rows={3}
              placeholder="e.g. Playful but no slang, never use emoji in headlines, always mention our fresh-roasted-within-48-hours promise."
              className="mt-2.5 w-full rounded-lg border border-border bg-panel-2 px-3 py-2.5 text-[13.5px] text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
            />
          </div>
        )}

        {agentId === "ads" && (
          <div>
            <label className="text-[13.5px] font-medium">Advisory campaign guidance</label>
            <p className="mt-0.5 text-[12.5px] text-text-faint">
              Told to the Ads Agent as a constraint on the campaign structure it proposes. For the
              real, code-enforced daily budget cap on real campaigns, see below.
            </p>
            <input
              type="text"
              defaultValue={settings.adsBudgetCap}
              onBlur={(e) => save({ adsBudgetCap: e.target.value })}
              placeholder="e.g. focus cold traffic, kill any variant above $45 CPA"
              className="mt-2.5 w-full rounded-lg border border-border bg-panel-2 px-3 py-2.5 text-[13.5px] text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
            />
          </div>
        )}

        {agentId === "ads" && (
          <div>
            <label className="text-[13.5px] font-medium">Real daily budget cap</label>
            <p className="mt-0.5 text-[12.5px] text-text-faint">
              In your ad account&apos;s own currency (e.g. PKR). Sent to Meta itself as the ad&apos;s
              daily budget — Meta enforces it, not just our code. Every real ad is created PAUSED;
              you always activate real spend yourself.
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={1000000}
                defaultValue={settings.adsDailyBudgetUsd}
                onBlur={(e) => save({ adsDailyBudgetUsd: Number(e.target.value) })}
                className="w-24 rounded-lg border border-border bg-panel-2 px-3 py-2 text-[13.5px] text-text focus:border-accent focus:outline-none"
              />
              <span className="text-[13px] text-text-dim">/ day</span>
            </div>
          </div>
        )}

        {(agentId === "retention" || agentId === "pricing") && (
          <div>
            <label className="text-[13.5px] font-medium">Margin floor</label>
            <p className="mt-0.5 text-[12.5px] text-text-faint">
              {agentId === "pricing"
                ? "Told to the Pricing Agent as a floor for any competitor price match or adjustment it proposes."
                : "Told to the Retention Agent as a floor for any discount or offer it proposes in a win-back or loyalty flow."}
            </p>
            <input
              type="text"
              defaultValue={settings.marginFloor}
              onBlur={(e) => save({ marginFloor: e.target.value })}
              placeholder="e.g. never discount more than 20% off"
              className="mt-2.5 w-full rounded-lg border border-border bg-panel-2 px-3 py-2.5 text-[13.5px] text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
            />
          </div>
        )}

        {agentId === "pricing" && (
          <div>
            <label className="text-[13.5px] font-medium">Minimum margin — hard limit</label>
            <p className="mt-0.5 text-[12.5px] text-text-faint">
              Code-enforced, not just advisory: a price change is refused outright if it would go
              below this margin over the product&apos;s real cost price.
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={95}
                defaultValue={settings.minMarginPercent}
                onBlur={(e) => save({ minMarginPercent: Number(e.target.value) })}
                className="w-20 rounded-lg border border-border bg-panel-2 px-3 py-2 text-[13.5px] text-text focus:border-accent focus:outline-none"
              />
              <span className="text-[13px] text-text-dim">%</span>
            </div>
          </div>
        )}

        {autoApply && (
          <div className="flex items-center justify-between border-t border-border pt-5">
            <div>
              <div className="text-[13.5px] font-medium">Auto-apply real changes</div>
              <p className="mt-0.5 max-w-sm text-[12.5px] text-text-faint">{autoApply.description}</p>
            </div>
            <button
              onClick={() => save({ [autoApply.key]: !settings[autoApply.key] })}
              className={
                "relative h-6 w-11 shrink-0 rounded-full transition-colors " +
                (settings[autoApply.key] ? "bg-good" : "bg-panel-2")
              }
            >
              <span
                className={
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform " +
                  (settings[autoApply.key] ? "translate-x-[22px]" : "translate-x-0.5")
                }
              />
            </button>
          </div>
        )}

        {agentId === "retention" && (
          <div className="flex items-center justify-between border-t border-border pt-5">
            <div>
              <div className="text-[13.5px] font-medium">WhatsApp weekly-plan notification</div>
              <p className="mt-0.5 text-[12.5px] text-text-faint">
                Send the finished weekly plan to the business&apos;s WhatsApp number via Twilio, if one is on file.
              </p>
            </div>
            <button
              onClick={() => save({ notifyWhatsApp: !settings.notifyWhatsApp })}
              className={
                "relative h-6 w-11 shrink-0 rounded-full transition-colors " +
                (settings.notifyWhatsApp ? "bg-good" : "bg-panel-2")
              }
            >
              <span
                className={
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform " +
                  (settings.notifyWhatsApp ? "translate-x-[22px]" : "translate-x-0.5")
                }
              />
            </button>
          </div>
        )}

        {agentId === "fraud" && (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13.5px] font-medium">Auto-confirm COD orders</div>
              <p className="mt-0.5 max-w-sm text-[12.5px] text-text-faint">
                Off = every cash-on-delivery order waits for you to confirm it by hand, even if it
                passed the fraud check — COD has no real payment guarantee. On = a fraud-clear COD
                order auto-confirms just like a paid one. Online-paid orders always auto-confirm
                once payment is verified, regardless of this setting.
              </p>
            </div>
            <button
              onClick={() => save({ autoConfirmCod: !settings.autoConfirmCod })}
              className={
                "relative h-6 w-11 shrink-0 rounded-full transition-colors " +
                (settings.autoConfirmCod ? "bg-good" : "bg-panel-2")
              }
            >
              <span
                className={
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform " +
                  (settings.autoConfirmCod ? "translate-x-[22px]" : "translate-x-0.5")
                }
              />
            </button>
          </div>
        )}

        {agentId === "competitor" && (
          <p className="text-[13px] text-text-faint">
            No configurable settings for this agent yet — it scans every competitor you&apos;ve added at
            onboarding, every cycle.
          </p>
        )}

        {!isSpecialist && agentId !== "orchestrator" && agentId !== "qa" && agentId !== "competitor" && agentId !== "fraud" && (
          <p className="text-[13px] text-text-faint">
            This agent isn&apos;t built yet, so there&apos;s nothing real to configure.
          </p>
        )}
      </div>

      <p className="mt-6 flex items-center gap-2 text-[11.5px] text-text-faint">
        <Pill tone="neutral">
          {agentId === "fraud" ? "Applies from your next real order" : "Applies from your next weekly cycle"}
        </Pill>
        Settings save immediately but only affect {agentId === "fraud" ? "orders" : "runs"} that haven&apos;t started yet.
      </p>
    </Card>
  );
}
