"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import {
  Compass,
  Radar,
  Search,
  PenSquare,
  TrendingUp,
  MessageSquare,
  Heart,
  Package,
  Wallet,
  Pin,
} from "lucide-react";
import { agents, type Agent, type AgentStatus } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const NODE_CONFIG = [
  { id: "competitor", icon: Radar },
  { id: "seo", icon: Search },
  { id: "content", icon: PenSquare },
  { id: "ads", icon: TrendingUp },
  { id: "chatbot", icon: MessageSquare },
  { id: "retention", icon: Heart },
  { id: "inventory", icon: Package },
  { id: "finance", icon: Wallet },
];

const SIZE = 660;
const CENTER = SIZE / 2;
const RADIUS = 250;
const NODE_R = 34;
const HUB_R = 56;

const STATUS: Record<AgentStatus, { color: string; soft: string; label: string }> = {
  active: { color: "#1f8a4c", soft: "#e7f6ec", label: "Ran recently" },
  idle: { color: "#8a8578", soft: "#f2f0ea", label: "Ran before" },
  never: { color: "#b6b2a8", soft: "#f2f0ea", label: "Not run yet" },
};

export interface AgentActivitySummary {
  status: AgentStatus;
  lastRunLabel: string;
}

export function AgentNetwork({
  activity = {},
}: {
  /** Real per-agent activity keyed by agent id — no simulated data. */
  activity?: Record<string, AgentActivitySummary>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);

  const summaryFor = (agent: Agent): AgentActivitySummary =>
    activity[agent.id] ?? { status: "never", lastRunLabel: agent.live ? "Not run yet" : "Not built yet" };

  // Real network, not a fixed roster — an agent that has never actually made a real call doesn't
  // get a node or a spoke at all. What's shown is exactly what's real right now, nothing more.
  const liveConfig = NODE_CONFIG.filter((cfg) => {
    const agent = agents.find((a) => a.id === cfg.id);
    return agent && summaryFor(agent).status !== "never";
  });

  const nodes = liveConfig.map((cfg, i) => {
    const agent = agents.find((a) => a.id === cfg.id)!;
    const angle = (i / Math.max(liveConfig.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return {
      agent,
      icon: cfg.icon,
      x: CENTER + RADIUS * Math.cos(angle),
      y: CENTER + RADIUS * Math.sin(angle),
    };
  });

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const ctx = gsap.context(() => {
      gsap.to(svg.querySelectorAll("[data-hub-ring]"), {
        rotation: 360,
        duration: 40,
        repeat: -1,
        ease: "none",
        transformOrigin: "center center",
      });

      nodes.forEach((n, i) => {
        if (summaryFor(n.agent).status !== "active") return;
        const dot = svg.querySelector(`[data-pulse="${i}"]`);
        if (!dot) return;
        gsap.set(dot, { attr: { cx: CENTER, cy: CENTER }, opacity: 0 });
        const tl = gsap.timeline({ repeat: -1, delay: i * 0.35 });
        tl.to(dot, { opacity: 1, duration: 0.15 })
          .to(dot, { duration: 1.3, ease: "power1.inOut", attr: { cx: n.x, cy: n.y } }, 0)
          .to(dot, { opacity: 0, duration: 0.2 }, "-=0.2")
          .to({}, { duration: 0.6 });
      });
    }, svg);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeId = pinned ?? hovered;
  const activeNode = nodes.find((n) => n.agent.id === activeId);

  if (nodes.length === 0) {
    return (
      <div
        className="relative mx-auto flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-strong text-center"
        style={{ width: SIZE, maxWidth: "100%", aspectRatio: "1 / 1" }}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "var(--panel-2)" }}>
          <Compass className="h-6 w-6 text-text-faint" strokeWidth={2} />
        </div>
        <p className="max-w-[220px] text-[13px] text-text-faint">
          Specialists (content, ads, SEO…) appear here once the Orchestrator brings one into a task.
        </p>
      </div>
    );
  }

  return (
    <div className="relative mx-auto" style={{ width: SIZE, maxWidth: "100%" }}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(320px circle at 50% 50%, rgba(255,138,61,0.10), transparent 70%)",
        }}
      />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ width: "100%", height: "auto", aspectRatio: "1 / 1" }}
        role="img"
        aria-label="Map of the Strategy Orchestrator connected to eight agents, showing real recent activity"
      >
        <defs>
          <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="softShadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000000" floodOpacity="0.35" />
          </filter>
          <radialGradient id="hubGradient" cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#c4b5fd" />
            <stop offset="55%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="#fb923c" />
          </radialGradient>
        </defs>

        {/* spokes */}
        {nodes.map((n) => {
          const s = STATUS[summaryFor(n.agent).status];
          const active = summaryFor(n.agent).status !== "never";
          return (
            <line
              key={`line-${n.agent.id}`}
              x1={CENTER}
              y1={CENTER}
              x2={n.x}
              y2={n.y}
              stroke={active ? s.color : "#dedad0"}
              strokeOpacity={activeId === n.agent.id ? 0.9 : active ? 0.35 : 0.6}
              strokeWidth={activeId === n.agent.id ? 2.5 : active ? 2 : 1.3}
              strokeLinecap="round"
              className="transition-all duration-200"
            />
          );
        })}

        {/* traveling pulses for agents that ran recently */}
        {nodes.map((n, i) =>
          summaryFor(n.agent).status === "active" ? (
            <circle key={`pulse-${n.agent.id}`} data-pulse={i} r={5} fill={STATUS.active.color} filter="url(#glow)" />
          ) : null,
        )}

        {/* center hub */}
        <circle
          data-hub-ring
          cx={CENTER}
          cy={CENTER}
          r={HUB_R + 12}
          fill="none"
          stroke="var(--accent)"
          strokeOpacity={0.3}
          strokeWidth={1.5}
          strokeDasharray="2 8"
          strokeLinecap="round"
        />
        <circle cx={CENTER} cy={CENTER} r={HUB_R} fill="url(#hubGradient)" filter="url(#softShadow)" />
        <foreignObject x={CENTER - 14} y={CENTER - 30} width={28} height={28}>
          <Compass className="h-7 w-7 text-white" strokeWidth={2.2} />
        </foreignObject>
        <text x={CENTER} y={CENTER + 22} textAnchor="middle" className="fill-white text-[12px] font-semibold">
          Orchestrator
        </text>

        {/* nodes */}
        {nodes.map((n) => {
          const summary = summaryFor(n.agent);
          const s = STATUS[summary.status];
          const Icon = n.icon;
          const isActive = activeId === n.agent.id;
          const isPinned = pinned === n.agent.id;
          return (
            <g
              key={n.agent.id}
              onMouseEnter={() => setHovered(n.agent.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => setPinned(pinned === n.agent.id ? null : n.agent.id)}
              className="cursor-pointer"
            >
              {summary.status === "active" && (
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={NODE_R}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  opacity={0.55}
                  className="animate-ping"
                  style={{ transformBox: "fill-box", transformOrigin: "center" }}
                />
              )}
              <circle
                cx={n.x}
                cy={n.y}
                r={NODE_R}
                fill="var(--panel)"
                stroke={s.color}
                strokeWidth={isActive ? 3 : 2}
                filter="url(#softShadow)"
                className="transition-all duration-200"
              />
              <foreignObject x={n.x - 10} y={n.y - 10} width={20} height={20}>
                <Icon className="h-5 w-5" strokeWidth={2} style={{ color: s.color }} />
              </foreignObject>
              {isPinned && (
                <foreignObject x={n.x + NODE_R - 20} y={n.y - NODE_R - 6} width={22} height={22}>
                  <div className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-accent shadow">
                    <Pin className="h-2.5 w-2.5 text-white" fill="white" />
                  </div>
                </foreignObject>
              )}
              <text
                x={n.x}
                y={n.y + NODE_R + 18}
                textAnchor="middle"
                className={cn(
                  "pointer-events-none text-[11.5px] font-medium transition-colors",
                  isActive ? "fill-text" : "fill-text-dim",
                )}
              >
                {n.agent.name}
              </text>
            </g>
          );
        })}
      </svg>

      {activeNode && (
        <div
          className="pointer-events-none absolute z-10 w-64 -translate-x-1/2 rounded-xl border border-border-strong bg-panel p-4 shadow-xl"
          style={{
            left: `${(activeNode.x / SIZE) * 100}%`,
            top: `${(activeNode.y / SIZE) * 100}%`,
            transform: `translate(-50%, ${activeNode.y > CENTER ? "38px" : "calc(-100% - 38px)"})`,
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13.5px] font-semibold">{activeNode.agent.name}</span>
            <span
              className="rounded-full px-2 py-0.5 text-[10.5px] font-medium"
              style={{
                color: STATUS[summaryFor(activeNode.agent).status].color,
                background: STATUS[summaryFor(activeNode.agent).status].soft,
              }}
            >
              {STATUS[summaryFor(activeNode.agent).status].label}
            </span>
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-text-dim">
            {summaryFor(activeNode.agent).lastRunLabel}
            {pinned === activeNode.agent.id && <span className="ml-1.5 text-accent">· pinned, click to unpin</span>}
          </p>
          <Link
            href={`/dashboard/agents/${activeNode.agent.id}`}
            className="pointer-events-auto mt-2.5 inline-block text-[11.5px] font-medium text-accent-strong hover:underline"
          >
            View details →
          </Link>
        </div>
      )}
    </div>
  );
}
