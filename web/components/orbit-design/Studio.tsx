"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, Braces, SlidersHorizontal, Type, Download, ClipboardCopy, Send, Globe, Loader2, Check, ArrowLeft, ArrowUp, ChevronRight, MousePointerClick, MessageSquare, Trash2, Files, ScanEye } from "lucide-react";
import { renderPageDocument, type DesignContent, type DesignTokens, type OrbitDesignDoc, type StorefrontProduct } from "@/lib/orbit-design";
import type { AuditFinding } from "@/lib/orbit-design-generate";
import { AuditOverlay } from "./AuditOverlay";
import { BuildingCanvas } from "./BuildingCanvas";
import { PreviewPane } from "./PreviewPane";
import { AdjustmentsPanel } from "./AdjustmentsPanel";
import { TweaksPanel } from "./TweaksPanel";
import { ContentPanel } from "./ContentPanel";
import { PagesPanel } from "./PagesPanel";
import { ElementInspector } from "./ElementInspector";
import { BlockInspector } from "./BlockInspector";
import { CommentComposer } from "./CommentComposer";
import type { CommentTarget, PickTarget } from "./PreviewPane";
import { useImageAttachments } from "./useImageAttachments";
import { AttachButton, AttachmentTray } from "./Attachments";

interface Msg {
  role: "user" | "assistant";
  content: string;
  fixed?: string[];
  pending?: boolean;
  hadRef?: boolean; // the paired request included an image / URL reference
  images?: string[]; // data URLs the seller attached to this message
  heavy?: boolean; // a full store build (long pipeline) vs a quick targeted edit
  errored?: boolean; // the turn failed — doesn't count as a real design pass
  orbitQuestions?: { id: string; q: string; options?: string[] }[]; // Orbit Code asking the seller before it wires
  answered?: boolean; // the orbitQuestions in this message have been submitted
}

const STARTERS = [
  "Build my whole store — home, shop, about and contact pages",
  "Make it feel warm and premium, like a boutique",
  "Add a bold hero with a big headline and one CTA",
  "Use an earthy palette and a serif heading font",
];

export function Studio({
  businessId,
  initialDoc,
  initialPublished,
  initialWired = false,
  website,
  currency,
  products,
  history,
}: {
  businessId: string;
  initialDoc: OrbitDesignDoc;
  initialPublished: boolean;
  initialWired?: boolean;
  website: string;
  currency: string;
  products: StorefrontProduct[];
  history: { role: "user" | "assistant"; content: string }[];
}) {
  const [doc, setDoc] = useState<OrbitDesignDoc>(initialDoc);
  const [published, setPublished] = useState(initialPublished);
  const [activePage, setActivePage] = useState("home");
  const [messages, setMessages] = useState<Msg[]>(history);
  // "launch" = the Claude-Design-style centered prompt screen (sidebar still visible);
  // "studio" = the full-screen split-pane editor that takes over the whole viewport.
  const [mode, setMode] = useState<"launch" | "studio">(history.length ? "studio" : "launch");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showTweaks, setShowTweaks] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [showPages, setShowPages] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [commentMode, setCommentMode] = useState(false);
  const [commentTarget, setCommentTarget] = useState<CommentTarget | null>(null);
  const [pickedEl, setPickedEl] = useState<PickTarget | null>(null);
  const [mobileTab, setMobileTab] = useState<"chat" | "preview">("chat");
  const [notice, setNotice] = useState<string | null>(null);
  // The "ask before building" step: set after the opening brief, cleared once the seller builds.
  const [plan, setPlan] = useState<{
    brief: string;
    images: string[];
    summary: string;
    questions: { key: string; question: string; why?: string; type?: "select" | "toggle" | "multi" | "text"; suggestions: string[] }[];
    answers: Record<string, string>;
  } | null>(null);
  const [planning, setPlanning] = useState(false);

  const attach = useImageAttachments();
  const scrollRef = useRef<HTMLDivElement>(null);
  const tokenSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestTokens = useRef(initialDoc.tokens);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // `activePage` may point at a page a chat turn just removed — fall back to home for this render.
  const safePage = doc.pages.some((p) => p.slug === activePage) ? activePage : "home";

  // True once a real design pass has completed (a failed turn doesn't count) — otherwise the
  // preview shows the empty state instead of the untouched default doc.
  const [cleared, setCleared] = useState(false); // Clean wipes the design; the `history` prop can't be mutated
  const hasDesign = useMemo(
    () =>
      !plan &&
      ((!cleared && history.length > 0) || messages.some((m) => m.role === "assistant" && !m.pending && !m.errored)),
    [history.length, messages, plan, cleared],
  );

  const flash = useCallback((m: string) => {
    setNotice(m);
    setTimeout(() => setNotice(null), 2800);
  }, []);

  const isOpeningBrief = messages.length === 0 && history.length === 0;

  /** Entry point for the composer: the very first brief goes through the questions step. */
  async function submitBrief(text: string, images: string[] = []) {
    if (isOpeningBrief && !plan) return startPlan(text, images);
    return send(text, images);
  }

  async function startPlan(text: string, images: string[]) {
    const message = text.trim();
    if ((!message && !images.length) || planning || sending) return;
    setMode("studio");
    setInput("");
    attach.clear();
    setMessages([
      { role: "user", content: message, images: images.length ? images : undefined },
      { role: "assistant", content: "", pending: true, hadRef: images.length > 0 || /https?:\/\//.test(message) },
    ]);
    setPlanning(true);
    try {
      const res = await fetch("/api/orbit-design/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, images }),
      });
      const data = await res.json();
      if (Array.isArray(data.questions) && data.questions.length) {
        setMessages([
          { role: "user", content: message, images: images.length ? images : undefined },
          { role: "assistant", content: "A few things before I build — set them on the right, or hit “Decide for me”." },
        ]);
        setPlan({ brief: message, images, summary: data.summary || "", questions: data.questions, answers: {} });
        setMobileTab("preview");
      } else {
        setMessages([]);
        await send(message, images, true);
      }
    } catch {
      setMessages([]);
      await send(message, images, true);
    } finally {
      setPlanning(false);
    }
  }

  /** Called by the questions card: fold the answers into the brief and build for real. */
  function buildFromPlan(skip: boolean) {
    if (!plan) return;
    const answered = plan.questions
      .map((q) => {
        const a = (plan.answers[q.key] || "").trim();
        return a ? `- ${q.question} → ${a}` : null;
      })
      .filter(Boolean);
    const composed =
      skip || !answered.length ? plan.brief : `${plan.brief}\n\nMy answers:\n${answered.join("\n")}`;
    const imgs = plan.images;
    setPlan(null);
    setMessages([]);
    void send(composed, imgs, true);
  }

  /** `forceHeavy` marks this call as a fresh whole-store build explicitly — the caller already knows
   *  this (it's the first brief, or the plan/questions flow), so we don't infer it from `messages`
   *  state inside here: by the time an async call like this resumes, `messages` may already reflect
   *  a later render than the one that kicked this off, making that inference unreliable. */
  async function send(text: string, images: string[] = [], forceHeavy = false) {
    const message = text.trim();
    if ((!message && !images.length) || sending) return;
    setMode("studio");
    setInput("");
    attach.clear();
    setPlan(null);
    const hadRef = images.length > 0 || /https?:\/\//.test(message);
    const heavy = forceHeavy || messages.filter((x) => x.role === "user").length === 0;
    setMessages((m) => [
      ...m,
      { role: "user", content: message, images: images.length ? images : undefined },
      { role: "assistant", content: "", pending: true, hadRef, heavy },
    ]);
    setSending(true);
    try {
      const res = await fetch("/api/orbit-design/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message || "Match this reference.", images }),
      });
      const data = await res.json();
      const failed = !!data.error || !data.doc;
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = {
          role: "assistant",
          content: data.reply || (failed ? "That didn't go through — try rephrasing or sending it in two steps." : "Something went wrong."),
          fixed: Array.isArray(data.fixed) && data.fixed.length ? data.fixed : undefined,
          errored: failed,
        };
        return next;
      });
      // Only adopt a doc from a turn that actually succeeded — an error returns the untouched doc.
      if (data.doc && !data.error) {
        setDoc(data.doc);
        latestTokens.current = data.doc.tokens;
        // A fresh whole-store build is exactly the case Audit Design exists for — run it
        // automatically once the build lands, instead of waiting for the seller to remember to.
        if (heavy) void runAudit();
      }
      // Post-handoff: Orbit Code reacts to a new interactive part the seller just designed.
      const oc = data.orbitCode as { questions?: { id: string; q: string; options?: string[] }[]; rewired?: string } | undefined;
      if (oc?.questions?.length) {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: "Orbit Code — you added something interactive. Quick check before I wire it:", orbitQuestions: oc.questions },
        ]);
      } else if (oc?.rewired) {
        setMessages((m) => [...m, { role: "assistant", content: `Orbit Code — ${oc.rewired}` }]);
        try {
          const g = await fetch("/api/orbit-design").then((r) => r.json());
          if (g.doc) setDoc(g.doc);
        } catch {
          /* best effort */
        }
      }
    } catch {
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = { role: "assistant", content: "Network error — please try again.", errored: true };
        return next;
      });
    } finally {
      setSending(false);
    }
  }

  const patchTokens = useCallback((patch: Partial<DesignTokens>) => {
    setDoc((d) => {
      const tokens = { ...d.tokens, ...patch };
      latestTokens.current = tokens;
      return { ...d, tokens };
    });
    if (tokenSaveTimer.current) clearTimeout(tokenSaveTimer.current);
    tokenSaveTimer.current = setTimeout(() => {
      fetch("/api/orbit-design", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens: latestTokens.current }),
      }).catch(() => {});
    }, 700);
  }, []);

  const contentSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingContent = useRef<{ content: Partial<DesignContent>; storeName?: string; tagline?: string }>({ content: {} });
  function flushContentSoon() {
    if (contentSaveTimer.current) clearTimeout(contentSaveTimer.current);
    contentSaveTimer.current = setTimeout(() => {
      const body = { ...pendingContent.current };
      pendingContent.current = { content: {} };
      fetch("/api/orbit-design", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
    }, 600);
  }
  const patchContent = useCallback((patch: Partial<DesignContent>) => {
    setDoc((d) => ({ ...d, content: { ...d.content, ...patch } }));
    pendingContent.current.content = { ...pendingContent.current.content, ...patch };
    flushContentSoon();
  }, []);
  const patchMeta = useCallback((patch: { storeName?: string; tagline?: string }) => {
    setDoc((d) => ({ ...d, ...patch }));
    Object.assign(pendingContent.current, patch);
    flushContentSoon();
  }, []);

  async function extractFromSite() {
    const url = prompt("Your existing website URL — Orbit Design will pull its colors and fonts:", website || "https://");
    if (!url) return;
    flash("Reading your site…");
    try {
      const res = await fetch("/api/orbit-design/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.error) return flash(data.error);
      if (!data.tokens || !Object.keys(data.tokens).length) return flash("Couldn't read a clear design system from that page.");
      setDoc((d) => {
        const tokens = { ...d.tokens, ...data.tokens };
        latestTokens.current = tokens;
        return { ...d, tokens };
      });
      fetch("/api/orbit-design", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens: data.tokens }),
      }).catch(() => {});
      flash(data.notes || "Applied your site's colors and fonts.");
    } catch {
      flash("Couldn't reach that site.");
    }
  }

  const [cleaning, setCleaning] = useState(false);
  async function cleanSlate() {
    if (cleaning) return;
    if (!confirm("Clear this design and the whole chat, and start from a blank storefront? This can't be undone.")) return;
    setCleaning(true);
    try {
      const res = await fetch("/api/orbit-design", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.doc) {
        flash("Couldn't reset — try again.");
        return;
      }
      setDoc(data.doc);
      latestTokens.current = data.doc.tokens;
      pendingContent.current = { content: {} };
      setPublished(false);
      setMessages([]);
      setCleared(true);
      setActivePage("home");
      setEditMode(false);
      setPickedEl(null);
      setShowAdjust(false);
      setShowContent(false);
      setShowTweaks(false);
      setMode("launch");
    } finally {
      setCleaning(false);
    }
  }

  const [publishing, setPublishing] = useState(false);
  async function togglePublish() {
    if (publishing) return;
    const next = !published;
    if (next) {
      setPublishing(true);
      flash("Wiring your store to the backend…");
    }
    try {
      const res = await fetch("/api/orbit-design/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        flash("Couldn't publish — try again.");
        return;
      }
      setPublished(next);
      if (next) flash(data.note ? `Live. Wired: ${data.note}` : "Your store is live.");
      else flash("Store unpublished.");
    } finally {
      setPublishing(false);
    }
  }

  function downloadHtml() {
    const html = renderPageDocument(doc, { products, businessId, pageSlug: safePage, currency });
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(doc.storeName || "storefront").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${safePage}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const [handingOff, setHandingOff] = useState(false);
  const [handoffPhase, setHandoffPhase] = useState<"idle" | "asking" | "wiring" | "done">("idle");
  const [hoSummary, setHoSummary] = useState<string | null>(null);
  const closeHandoff = useCallback(() => setHandoffPhase("idle"), []);
  const [wiredOnce, setWiredOnce] = useState(initialWired);

  const [auditPhase, setAuditPhase] = useState<"idle" | "scanning" | "review" | "applying" | "done">("idle");
  const [auditFindings, setAuditFindings] = useState<AuditFinding[]>([]);
  const [auditSummary, setAuditSummary] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const closeAudit = useCallback(() => setAuditPhase("idle"), []);

  async function runAudit() {
    if (auditPhase === "scanning" || auditPhase === "applying") return;
    setAuditError(null);
    setAuditFindings([]);
    setAuditSummary(null);
    setAuditPhase("scanning");
    try {
      const res = await fetch("/api/orbit-design/audit", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setAuditError(data.error ?? "Audit failed — try again.");
        setAuditPhase("review");
        return;
      }
      setAuditSummary(data.summary ?? null);
      setAuditFindings(Array.isArray(data.findings) ? data.findings : []);
      setAuditPhase("review");
    } catch {
      setAuditError("Network error during audit.");
      setAuditPhase("review");
    }
  }

  async function applyAudit(approvedIds: string[]) {
    setAuditPhase("applying");
    try {
      const res = await fetch("/api/orbit-design/audit/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findings: auditFindings, approvedIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        flash(data.error ?? "Couldn't apply those fixes.");
        setAuditPhase("review");
        return;
      }
      if (data.doc) setDoc(data.doc);
      setAuditPhase("done");
      setTimeout(() => setAuditPhase("idle"), 1600);
    } catch {
      flash("Network error applying fixes.");
      setAuditPhase("review");
    }
  }

  async function wire(body: Record<string, unknown>) {
    setHandingOff(true);
    setHandoffPhase("wiring");
    try {
      const res = await fetch("/api/orbit-design/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        flash(data.error ?? "Handoff failed — try again.");
        setHandoffPhase("idle");
      } else {
        const sum = data.summary ?? "Backend wired.";
        setHoSummary(sum);
        setHandoffPhase("done");
        setWiredOnce(true);
        setMessages((m) => [...m, { role: "assistant", content: `Orbit Code — ${sum} Ask me here to change any page or wire a new part.` }]);
        try {
          const g = await fetch("/api/orbit-design").then((r) => r.json());
          if (g.doc) setDoc(g.doc);
        } catch {
          /* preview refresh is best-effort */
        }
      }
    } catch {
      flash("Network error during Handoff.");
      setHandoffPhase("idle");
    } finally {
      setHandingOff(false);
    }
  }

  async function runHandoff() {
    if (handingOff) return;
    setHoSummary(null);
    setHandingOff(true);
    setHandoffPhase("asking");
    try {
      const res = await fetch("/api/orbit-design/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json();
      if (!res.ok) {
        flash(data.error ?? "Handoff failed — try again.");
        setHandoffPhase("idle");
        setHandingOff(false);
        return;
      }
      if (Array.isArray(data.questions) && data.questions.length) {
        setHandoffPhase("idle");
        setHandingOff(false);
        setMobileTab("chat");
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: "Orbit Code — before I wire the backend, a couple of quick things I can't tell from the design:",
            orbitQuestions: data.questions,
          },
        ]);
        return;
      }
      setHandoffPhase("wiring");
      const sum = data.summary ?? "Backend wired.";
      setHoSummary(sum);
      setHandoffPhase("done");
      setWiredOnce(true);
      setMessages((m) => [...m, { role: "assistant", content: `Orbit Code — ${sum} Ask me here to change any page or wire a new part.` }]);
      try {
        const g = await fetch("/api/orbit-design").then((r) => r.json());
        if (g.doc) setDoc(g.doc);
      } catch {
        /* best effort */
      }
    } catch {
      flash("Network error during Handoff.");
      setHandoffPhase("idle");
    } finally {
      setHandingOff(false);
    }
  }

  if (mode === "launch") {
    return (
      <LaunchScreen
        storeName={doc.storeName}
        sending={sending}
        onSend={submitBrief}
        onExtract={extractFromSite}
        starters={STARTERS}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex h-dvh flex-col bg-bg">
      {/* top bar */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-3.5">
        <div className="flex items-center gap-2.5">
          <Link
            href="/dashboard"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-faint hover:bg-panel-2 hover:text-text"
            aria-label="Back to dashboard"
            title="Back to dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <StudioIdentity wired={wiredOnce} initialWired={initialWired} storeName={doc.storeName} accent={doc.tokens.accent} />
        </div>

        <div className="flex items-center gap-2">
          <button onClick={extractFromSite} className="hidden items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-[12.5px] font-medium text-text-dim hover:text-text sm:flex">
            <Globe className="h-3.5 w-3.5" /> From my site
          </button>
          <button onClick={downloadHtml} className="hidden items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-[12.5px] font-medium text-text-dim hover:text-text sm:flex">
            <Download className="h-3.5 w-3.5" /> HTML
          </button>
          <button onClick={runHandoff} disabled={handingOff} title="Orbit Code writes the backend for every interactive part you designed" className="hidden items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-[12.5px] font-medium text-text-dim hover:text-text disabled:opacity-60 md:flex">
            {handingOff ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCopy className="h-3.5 w-3.5" />} {wiredOnce ? "Re-wire" : "Handoff"}
          </button>
          <button
            onClick={runAudit}
            disabled={auditPhase === "scanning" || auditPhase === "applying"}
            title="Deep QA pass — checks alignment, responsiveness and contrast on every page, then asks before fixing anything"
            className="hidden items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-[12.5px] font-medium text-text-dim hover:text-text disabled:opacity-60 md:flex"
          >
            {auditPhase === "scanning" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanEye className="h-3.5 w-3.5" />} Audit Design
          </button>
          <button
            onClick={cleanSlate}
            disabled={cleaning}
            title="Clear this design and chat, start blank"
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-[12.5px] font-medium text-text-dim hover:border-bad/40 hover:text-bad disabled:opacity-50"
          >
            {cleaning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Clean</span>
          </button>
          <button
            onClick={() => {
              setCommentMode((c) => !c);
              setEditMode(false);
              setPickedEl(null);
              setShowContent(false);
              setShowTweaks(false);
              setShowAdjust(false);
            }}
            aria-pressed={commentMode}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[12.5px] font-medium transition-colors ${
              commentMode ? "border-accent/40 bg-accent-soft text-accent-strong" : "border-border text-text-dim hover:text-text"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" /> Comment
          </button>
          <button
            onClick={() => {
              setEditMode((e) => !e);
              setCommentMode(false);
              setPickedEl(null);
              setShowContent(false);
              setShowTweaks(false);
              setShowAdjust(false);
              setShowPages(false);
            }}
            aria-pressed={editMode}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[12.5px] font-medium transition-colors ${
              editMode ? "border-accent/40 bg-accent-soft text-accent-strong" : "border-border text-text-dim hover:text-text"
            }`}
          >
            <MousePointerClick className="h-3.5 w-3.5" /> Edit
          </button>
          <button
            onClick={() => {
              setShowContent((s) => !s);
              setShowAdjust(false);
              setShowPages(false);
            }}
            aria-pressed={showContent}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[12.5px] font-medium transition-colors ${
              showContent ? "border-accent/40 bg-accent-soft text-accent-strong" : "border-border text-text-dim hover:text-text"
            }`}
          >
            <Type className="h-3.5 w-3.5" /> Content
          </button>
          <button
            onClick={() => {
              setShowPages((s) => !s);
              setShowContent(false);
              setShowAdjust(false);
              setShowTweaks(false);
            }}
            aria-pressed={showPages}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[12.5px] font-medium transition-colors ${
              showPages ? "border-accent/40 bg-accent-soft text-accent-strong" : "border-border text-text-dim hover:text-text"
            }`}
          >
            <Files className="h-3.5 w-3.5" /> Pages
          </button>
          <button
            onClick={() => {
              setShowAdjust((s) => !s);
              setShowContent(false);
              setShowTweaks(false);
              setShowPages(false);
            }}
            aria-pressed={showAdjust}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[12.5px] font-medium transition-colors ${
              showAdjust ? "border-accent/40 bg-accent-soft text-accent-strong" : "border-border text-text-dim hover:text-text"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> Adjust
          </button>
          <button
            onClick={() => {
              setShowTweaks((s) => !s);
              setShowContent(false);
              setShowAdjust(false);
              setShowPages(false);
            }}
            aria-pressed={showTweaks}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[12.5px] font-medium transition-colors ${
              showTweaks ? "border-accent/40 bg-accent-soft text-accent-strong" : "border-border text-text-dim hover:text-text"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" /> Tweaks
          </button>
          <label className="ml-1 flex cursor-pointer items-center gap-2 text-[12.5px] font-medium">
            <span className={publishing ? "text-accent-strong" : published ? "text-good" : "text-text-faint"}>
              {publishing ? "Wiring…" : published ? "Live" : "Draft"}
            </span>
            <span className="relative inline-block h-5 w-9">
              <input type="checkbox" checked={published} onChange={togglePublish} disabled={publishing} className="peer sr-only" />
              <span className="absolute inset-0 rounded-full bg-panel-2 transition-colors peer-checked:bg-good" />
              <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
            </span>
          </label>
        </div>
      </div>

      {/* mobile tab switch */}
      <div className="flex border-b border-border lg:hidden">
        {(["chat", "preview"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setMobileTab(t)}
            className={`flex-1 py-2.5 text-[13px] font-medium capitalize ${
              mobileTab === t ? "border-b-2 border-accent text-text" : "text-text-faint"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {notice && (
        <div className="border-b border-accent/20 bg-accent-soft px-6 py-2 text-[12.5px] text-accent-strong" role="status">
          {notice}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* chat */}
        <div className={`${mobileTab === "chat" ? "flex" : "hidden"} w-full flex-col border-r border-border lg:flex lg:w-[340px] lg:shrink-0`}>
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="pt-6">
                <p className="text-[13.5px] text-text-dim">Describe your storefront and I&apos;ll build it live. Try:</p>
                <div className="mt-3 space-y-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      onClick={() => submitBrief(s)}
                      className="w-full rounded-xl border border-border bg-panel px-3.5 py-2.5 text-left text-[13px] text-text-dim transition-colors hover:border-accent/40 hover:text-text"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex flex-col items-start"}>
                <div
                  className={`rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
                    m.pending ? "w-full max-w-[92%]" : "max-w-[85%]"
                  } ${m.role === "user" ? "gradient-fill text-white" : "border border-border bg-panel text-text"}`}
                >
                  {m.images && m.images.length > 0 && (
                    <div className="mb-1.5 flex flex-wrap gap-1.5">
                      {m.images.map((src, k) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={k}
                          src={src}
                          alt={`reference ${k + 1}`}
                          className="h-16 w-16 rounded-lg border border-white/25 object-cover"
                        />
                      ))}
                    </div>
                  )}
                  {m.pending ? <PendingBubble hasRef={!!m.hadRef} planning={planning} heavy={!!m.heavy} /> : m.content || (m.images?.length ? <span className="opacity-80">{m.images.length} reference image{m.images.length > 1 ? "s" : ""}</span> : "")}
                </div>
                {m.fixed && m.fixed.length > 0 && (
                  <div className="mt-1.5 flex max-w-[85%] items-center gap-1.5 rounded-lg bg-good-soft px-2.5 py-1.5 text-[12px] text-good">
                    <Check className="h-3 w-3 shrink-0" />
                    <span>Polished {m.fixed.length} small {m.fixed.length === 1 ? "detail" : "details"} along the way</span>
                  </div>
                )}
                {m.orbitQuestions && !m.answered && (
                  <OrbitCodeQuestions
                    questions={m.orbitQuestions}
                    onSubmit={(answers) => {
                      setMessages((prev) => prev.map((x, k) => (k === i ? { ...x, answered: true } : x)));
                      const lines = m.orbitQuestions!.map((q) => `• ${q.q} → ${answers[q.id] || "(skipped)"}`).join("\n");
                      setMessages((prev) => [...prev, { role: "user", content: lines }]);
                      void wire({ answers });
                    }}
                    onSkip={() => {
                      setMessages((prev) => prev.map((x, k) => (k === i ? { ...x, answered: true } : x)));
                      void wire({ skipQuestions: true });
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitBrief(input, attach.items.map((a) => a.dataUrl));
            }}
            className="border-t border-border p-3"
            {...attach.dropHandlers}
          >
            <div
              className={`flex flex-col gap-2 rounded-2xl border bg-panel px-3 pt-2.5 pb-2 focus-within:border-accent/50 ${
                attach.dragging ? "border-accent border-dashed" : "border-border"
              }`}
            >
              <AttachmentTray items={attach.items} onRemove={attach.remove} />
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={attach.onPaste}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitBrief(input, attach.items.map((a) => a.dataUrl));
                  }
                }}
                rows={1}
                placeholder={wiredOnce ? "Ask Orbit Code to change a page, wire a new part, or tweak the backend…" : "Describe a change, paste a screenshot, or drop a link to a site you like…"}
                className="max-h-40 min-h-[24px] w-full resize-none bg-transparent text-[13.5px] outline-none placeholder:text-text-faint"
              />
              <div className="flex items-center justify-between">
                <AttachButton onFiles={attach.add} disabled={sending || attach.atMax} />
                <button
                  type="submit"
                  disabled={sending || (!input.trim() && !attach.items.length)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full gradient-fill text-white transition-opacity disabled:opacity-30"
                  aria-label="Send"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="mt-2 flex gap-3 sm:hidden">
              <button type="button" onClick={extractFromSite} className="text-[12px] text-text-faint">
                From my site
              </button>
              <button type="button" onClick={downloadHtml} className="text-[12px] text-text-faint">
                Download HTML
              </button>
            </div>
          </form>
        </div>

        {/* preview + adjustments */}
        <div className={`relative ${mobileTab === "preview" ? "flex" : "hidden"} min-w-0 flex-1 flex-col lg:flex`}>

          {handoffPhase !== "idle" && (
            <HandoffOverlay
              phase={handoffPhase}
              summary={hoSummary}
              storeName={doc.storeName}
              onClose={closeHandoff}
            />
          )}

          {auditPhase !== "idle" && (
            <AuditOverlay
              phase={auditPhase}
              summary={auditSummary}
              findings={auditFindings}
              error={auditError}
              onApply={applyAudit}
              onClose={closeAudit}
            />
          )}

          <div className="flex min-h-0 flex-1">
            {plan ? (
              <div className="flex-1 overflow-y-auto p-6 sm:p-10">
                <div className="mx-auto max-w-xl">
                  {plan.summary && <p className="mb-6 text-[15px] leading-relaxed text-text-dim">{plan.summary}</p>}
                  <PlanCard
                    plan={plan}
                    onAnswer={(key, val) => setPlan((p) => (p ? { ...p, answers: { ...p.answers, [key]: val } } : p))}
                    onBuild={() => buildFromPlan(false)}
                    onSkip={() => buildFromPlan(true)}
                  />
                </div>
              </div>
            ) : (
            <div className="min-w-0 flex-1">
              <PreviewPane
                doc={doc}
                products={products}
                businessId={businessId}
                published={published}
                pageSlug={safePage}
                currency={currency}
                onNavigate={(slug) => {
                  if (doc.pages.some((p) => p.slug === slug)) setActivePage(slug);
                }}
                editMode={editMode}
                onPick={(p) => setPickedEl(p)}
                commentMode={commentMode}
                onComment={(t) => setCommentTarget(t)}
                busy={sending || planning}
                hasDesign={hasDesign}
                freshBuild={planning || messages.some((m) => m.pending && m.heavy)}
              />
            </div>
            )}
            {editMode && pickedEl && (
              (() => {
                const sid = pickedEl.block.replace(/^s:/, "");
                const isBlock = doc.pages.some((p) => p.sections.some((s) => s.id === sid && s.block));
                return isBlock ? (
                  <BlockInspector
                    key={"blk:" + sid}
                    doc={doc}
                    sectionId={pickedEl.block}
                    onDoc={(d) => setDoc(d)}
                    onClose={() => setPickedEl(null)}
                  />
                ) : (
                  <ElementInspector
                    key={pickedEl.block + pickedEl.path.join(".")}
                    doc={doc}
                    pick={pickedEl}
                    onClose={() => setPickedEl(null)}
                    onSaved={(d) => setDoc(d)}
                  />
                );
              })()
            )}
            {commentTarget && (
              <CommentComposer
                target={commentTarget}
                contextLabel={blockLabel(doc, commentTarget.block)}
                onCancel={() => setCommentTarget(null)}
                onSend={(note, opts) => {
                  const t = commentTarget;
                  setCommentTarget(null);
                  setCommentMode(false);
                  const where = blockLabel(doc, t.block);
                  const base = t.text ? `the ${t.role} that reads “${t.text}”` : `the ${t.role}`;
                  const what = opts?.applyToSimilar ? `${base} — and every element like it in that section` : base;
                  send(`In ${where}, about ${what}: ${note}`, opts?.images);
                }}
              />
            )}
            {showPages && (
              <PagesPanel
                doc={doc}
                onDoc={setDoc}
                onClose={() => setShowPages(false)}
                onBuildPage={(slug, title, prompt) => {
                  setActivePage(slug);
                  setMobileTab("chat");
                  // If the brief names one of the store's product categories, make the page's grid scoped to it.
                  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
                  const cats = [...new Set(products.map((p) => (p.category || "").trim()).filter(Boolean))];
                  const hit = cats.find((c) => new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(prompt));
                  const scope = hit
                    ? ` This page should show a product grid of ONLY the "${hit}" category — give its product-grid section the html comment <!--grid-only:${slugify(hit)}--> so the platform scopes and filters it.`
                    : "";
                  void send(`Build out the "${title}" page (/${slug}): ${prompt}${scope}`);
                }}
              />
            )}
            {showAdjust && <AdjustmentsPanel tokens={doc.tokens} onChange={patchTokens} onClose={() => setShowAdjust(false)} />}
            {showTweaks && <TweaksPanel doc={doc} onDoc={setDoc} onClose={() => setShowTweaks(false)} />}
            {showContent && (
              <ContentPanel
                content={doc.content}
                storeName={doc.storeName}
                tagline={doc.tagline}
                onChange={patchContent}
                onMeta={patchMeta}
                onClose={() => setShowContent(false)}
              />
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

/**
 * The studio's identity in the top bar. When the backend is handed off, "Orbit Design" morphs into
 * "Orbit Code" with a one-time animation — the mark flips + hue-sweeps, the wordmark rolls up.
 */
function StudioIdentity({
  wired,
  initialWired,
  storeName,
  accent,
}: {
  wired: boolean;
  initialWired: boolean;
  storeName: string;
  accent?: string;
}) {
  const [swapped, setSwapped] = useState(initialWired);
  const [animating, setAnimating] = useState(wired && !initialWired);
  const [seenWired, setSeenWired] = useState(wired);
  if (seenWired !== wired) {
    setSeenWired(wired);
    if (wired && !swapped) setAnimating(true); // just got wired — play the flip once
  }
  useEffect(() => {
    if (!animating) return;
    const a = setTimeout(() => setSwapped(true), 470); // flip apex — icon + wordmark cross here
    const b = setTimeout(() => setAnimating(false), 1000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [animating]);

  return (
    <div className="flex items-center gap-2.5" style={{ "--od-id-accent": accent || "#c9803f" } as React.CSSProperties}>
      <div className={`od-id-mark relative flex h-7 w-7 items-center justify-center overflow-visible rounded-lg gradient-fill ${animating ? "od-id-mark-anim" : ""}`}>
        <Sparkles className={`absolute h-4 w-4 text-white transition-opacity duration-300 ${swapped ? "opacity-0" : "opacity-100"}`} strokeWidth={2.5} />
        <Braces className={`absolute h-4 w-4 text-white transition-opacity duration-300 ${swapped ? "opacity-100" : "opacity-0"}`} strokeWidth={2.5} />
      </div>
      <div>
        <div className="relative h-[19px] overflow-hidden text-[15px] font-semibold leading-[19px]">
          <div className={`od-id-rail ${animating ? "od-id-rail-anim" : swapped ? "od-id-rail-code" : ""}`}>
            <div>Orbit Design</div>
            <div>Orbit Code</div>
          </div>
        </div>
        <div className="text-[12px] text-text-faint">{storeName}</div>
      </div>

      <style>{`
        .od-id-mark::after{content:"";position:absolute;inset:-4px;border-radius:12px;border:2px solid var(--od-id-accent,#c9803f);opacity:0;pointer-events:none}
        .od-id-mark-anim{animation:od-id-flip .95s cubic-bezier(.5,0,.25,1)}
        .od-id-mark-anim::after{animation:od-id-ring .95s ease-out}
        .od-id-rail{transition:none}
        .od-id-rail-code{transform:translateY(-19px)}
        .od-id-rail-anim{animation:od-id-roll .95s cubic-bezier(.6,0,.2,1) forwards}
        @keyframes od-id-flip{
          0%{transform:rotate(0) scale(1);filter:hue-rotate(0)}
          42%{transform:rotate(190deg) scale(1.3);filter:hue-rotate(140deg)}
          70%{transform:rotate(342deg) scale(1.3);filter:hue-rotate(60deg)}
          100%{transform:rotate(360deg) scale(1);filter:hue-rotate(0)}
        }
        @keyframes od-id-ring{0%{opacity:.75;transform:scale(.7)}100%{opacity:0;transform:scale(1.7)}}
        @keyframes od-id-roll{
          0%{transform:translateY(0);filter:blur(0);opacity:1}
          45%{transform:translateY(-7px);filter:blur(2px);opacity:.4}
          55%{transform:translateY(-30px);filter:blur(2px);opacity:.4}
          100%{transform:translateY(-19px);filter:blur(0);opacity:1}
        }
        @media (prefers-reduced-motion:reduce){.od-id-mark-anim,.od-id-mark-anim::after,.od-id-rail-anim{animation:none!important}.od-id-rail-anim{transform:translateY(-19px)}}
      `}</style>
    </div>
  );
}

/** Orbit Code's clarifying questions, rendered inline in the chat thread. */
function OrbitCodeQuestions({
  questions,
  onSubmit,
  onSkip,
}: {
  questions: { id: string; q: string; options?: string[] }[];
  onSubmit: (answers: Record<string, string>) => void;
  onSkip: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const allAnswered = questions.every((q) => (answers[q.id] ?? "").trim());
  return (
    <div className="mt-2 w-full max-w-[92%] space-y-3 rounded-2xl border border-accent/30 bg-accent-soft/40 p-3">
      {questions.map((q) => (
        <div key={q.id}>
          <p className="mb-1.5 text-[12.5px] font-medium text-text">{q.q}</p>
          {q.options?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {q.options.map((o) => (
                <button
                  key={o}
                  onClick={() => setAnswers((a) => ({ ...a, [q.id]: o }))}
                  className={`rounded-lg border px-2.5 py-1 text-[12px] font-medium transition-colors ${
                    answers[q.id] === o ? "border-accent bg-accent-soft text-accent-strong" : "border-border text-text-dim hover:text-text"
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
          ) : (
            <input
              value={answers[q.id] ?? ""}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              className="w-full rounded-lg border border-border bg-panel px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent/50"
              placeholder="Type your answer…"
            />
          )}
        </div>
      ))}
      <div className="flex items-center gap-3 pt-0.5">
        <button
          onClick={() => onSubmit(answers)}
          disabled={!allAnswered}
          className="rounded-lg gradient-fill px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-40"
        >
          Wire it up
        </button>
        <button onClick={onSkip} className="text-[12px] font-medium text-text-faint hover:text-text">
          Skip — best guess
        </button>
      </div>
    </div>
  );
}

const HANDOFF_STEPS = [
  "Reading your design",
  "Mapping the interactive zones",
  "Writing the backend spec",
  "Connecting checkout, accounts & forms",
  "Publishing the wiring",
];

/**
 * The Handoff experience: a full-screen skeleton-storefront canvas (BuildingCanvas, film-grain
 * variant) while Orbit Code wires the backend, then a smooth iris-wipe that reveals the studio.
 * Clarifying questions are asked in the chat, not here. The studio identity flips
 * "Orbit Design" → "Orbit Code" once wiring completes.
 */
function HandoffOverlay({
  phase,
  summary,
  storeName,
  onClose,
}: {
  phase: "asking" | "wiring" | "done";
  summary: string | null;
  storeName: string;
  onClose: () => void;
}) {
  const running = phase === "wiring" || phase === "asking";
  const [step, setStep] = useState(0);
  const [revealing, setRevealing] = useState(false);
  const [wasRunning, setWasRunning] = useState(running);
  if (wasRunning !== running) {
    setWasRunning(running);
    if (running) setStep(0); // a new handoff starts from the first step
  }

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setStep((s) => Math.min(s + 1, HANDOFF_STEPS.length - 2)), 1400);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (phase !== "done") return;
    const a = setTimeout(() => setRevealing(true), 1100); // let "wired" land, then wipe away
    const b = setTimeout(onClose, 2050); // safety close if transitionend doesn't fire
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [phase, onClose]);

  const doneStep = phase === "done" ? HANDOFF_STEPS.length : step;

  return (
    <div
      className={`od-handoff absolute inset-0 z-40 overflow-hidden ${revealing ? "od-ho-reveal" : ""}`}
      onTransitionEnd={(e) => {
        if (revealing && e.propertyName === "clip-path") onClose();
      }}
    >
      <div className="absolute inset-0">
        <div className="h-full w-full p-6 sm:p-12 pt-24">
          <BuildingCanvas label={phase === "done" ? "Wired" : HANDOFF_STEPS[Math.min(doneStep, HANDOFF_STEPS.length - 1)]} variant="grain" dark />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/80 via-black/25 to-black/75" />
      </div>

      <div className="relative z-10 flex h-full flex-col items-center px-6 pt-10 text-center">
        <div className={`od-ho-badge flex h-11 w-11 items-center justify-center rounded-2xl ${phase === "done" ? "od-ho-badge-done" : ""}`}>
          {phase === "done" ? <Check className="h-5 w-5 text-white" strokeWidth={3} /> : <Sparkles className="h-5 w-5 text-white" strokeWidth={2.5} />}
        </div>
        <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">Orbit Code</div>
        <div className="mt-1.5 text-[20px] font-semibold text-white">
          {phase === "done" ? "Your store is wired" : `Wiring ${storeName}`}
        </div>

        {phase === "done" && summary && (
          <p className="od-ho-fade mt-6 max-w-[330px] text-[12.5px] leading-relaxed text-white/60">{summary}</p>
        )}
      </div>

      <style>{`
        .od-handoff{--accent:${"var(--od-accent,#c9803f)"};background:#07060c;clip-path:circle(150% at 50% 52%);transition:clip-path .9s cubic-bezier(.7,0,.3,1),opacity .9s ease}
        .od-handoff.od-ho-reveal{clip-path:circle(0% at 50% 52%);opacity:0}
        .od-ho-canvas{animation:od-ho-fade .6s ease both}
        .od-ho-badge{background:linear-gradient(135deg,var(--accent),#a855f7);box-shadow:0 0 0 6px rgba(168,85,247,.12),0 10px 40px -8px rgba(168,85,247,.5);animation:od-ho-rise .55s cubic-bezier(.2,.7,.2,1)}
        .od-ho-badge-done{animation:od-ho-pop .5s cubic-bezier(.2,.8,.2,1)}
        .od-ho-step{color:rgba(255,255,255,.3);transition:color .4s}
        .od-ho-step .od-ho-dot{border:1.5px solid rgba(255,255,255,.2);transition:all .4s;color:#fff}
        .od-ho-step-active{color:#fff}
        .od-ho-step-active .od-ho-dot{border-color:var(--accent);box-shadow:0 0 0 4px rgba(201,128,63,.15);animation:od-ho-blink 1s ease-in-out infinite}
        .od-ho-step-done{color:rgba(255,255,255,.68)}
        .od-ho-step-done .od-ho-dot{background:var(--accent);border-color:var(--accent)}
        .od-ho-fade{animation:od-ho-fade .5s ease both}
        @keyframes od-ho-rise{from{opacity:0;transform:translateY(12px) scale(.9)}to{opacity:1;transform:none}}
        @keyframes od-ho-pop{0%{transform:scale(.6)}60%{transform:scale(1.15)}100%{transform:scale(1)}}
        @keyframes od-ho-fade{from{opacity:0}to{opacity:1}}
        @keyframes od-ho-blink{0%,100%{opacity:1}50%{opacity:.4}}
      `}</style>
    </div>
  );
}

/** Friendly name for a preview target's nearest data-od-block, for the comment context line. */
function blockLabel(doc: OrbitDesignDoc, block: string | null): string {
  if (!block) return "this page";
  if (block === "header") return "the header";
  if (block === "footer") return "the footer";
  if (block.startsWith("s:")) {
    const id = block.slice(2);
    const sec = doc.pages.flatMap((p) => p.sections).find((s) => s.id === id);
    return sec ? `the “${sec.label}” section` : "this section";
  }
  return "this section";
}

/**
 * Claude-Design-style build progress: one compact, collapsible card that walks the real pipeline
 * phases on a timer (plan → pages → sections → review → finish) instead of flooding the chat with
 * a new line per step. Never claims "done" — the turn resolving replaces it with the real reply.
 */
function PendingBubble({ hasRef, planning, heavy }: { hasRef: boolean; planning?: boolean; heavy?: boolean }) {
  const phases = useMemo(
    () =>
      planning
        ? [
            { label: hasRef ? "Looking at your reference" : "Reading your brief", at: 0 },
            { label: "Working out what to ask", at: 6 },
          ]
        : heavy
          ? [
              { label: hasRef ? "Looking at your reference" : "Reading your brief", at: 0 },
              { label: "Planning the structure", at: 6 },
              { label: "Choosing colours & type", at: 18 },
              { label: "Designing every page", at: 26 },
              { label: "Writing the sections", at: 60 },
              { label: "Reviewing the design", at: 110 },
              { label: "Polishing the details", at: 160 },
              { label: "Finishing up", at: 200 },
            ]
          : [
              { label: hasRef ? "Looking at your reference" : "Reading your request", at: 0 },
              { label: "Making the change", at: 5 },
              { label: "Checking it holds up", at: 30 },
              { label: "Finishing up", at: 55 },
            ],
    [hasRef, planning, heavy],
  );
  const [secs, setSecs] = useState(0);
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const a = setInterval(() => setSecs((s) => s + 1), 1000);
    const b = setInterval(() => setTick((t) => t + 1), 90); // drives the shimmer / creeping bar
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, []);
  // current phase = last one whose start time has passed (never past the final one early)
  let cur = 0;
  for (let k = 0; k < phases.length; k++) if (secs >= phases[k].at) cur = k;
  const total = phases[phases.length - 1].at + 60;
  // progress creeps toward — but never reaches — 100 so it never looks finished-but-stuck. The
  // planning phase is capped lower: it's a short pre-check that may resolve straight into a full
  // build with no question asked, and letting it visually near 100% first made that handoff read
  // as "it finished, then restarted" instead of "one step led straight into the next."
  const pct = Math.min(planning ? 60 : 94, (1 - Math.exp(-secs / (total * 0.42))) * 100);
  const dots = ".".repeat(1 + (tick % 3));

  return (
    <div className="w-full">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left text-text-dim">
        <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/40" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
        <span className="flex-1 truncate">
          {phases[cur].label}
          <span className="inline-block w-3 text-left text-text-faint">{dots}</span>
        </span>
        <span className="shrink-0 tabular-nums text-[11px] text-text-faint">{Math.floor(pct)}%</span>
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>

      {/* creeping progress bar with a moving sheen */}
      <div className="relative mt-2 h-1 overflow-hidden rounded-full bg-border/60">
        <div className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} />
        <div
          className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent"
          style={{ left: `${(tick * 2.2) % 130 - 30}%`, transition: "left .09s linear" }}
        />
      </div>

      {open && (
        <div className="mt-2.5 space-y-1.5 border-l border-border pl-3">
          {phases.map((p, k) => (
            <div
              key={p.label}
              className={`flex items-center gap-2 text-[12px] transition-colors ${k > cur ? "text-text-faint" : "text-text-dim"}`}
            >
              {k < cur ? (
                <Check className="h-3 w-3 shrink-0 text-good" />
              ) : k === cur ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" />
              ) : (
                <span className="h-3 w-3 shrink-0 rounded-full border border-border" />
              )}
              <span className={`truncate ${k === cur ? "text-text" : ""}`}>{p.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The "ask before building" card — the model's read-back + a few quick questions, each optional. */
function PlanCard({
  plan,
  onAnswer,
  onBuild,
  onSkip,
}: {
  plan: {
    summary: string;
    questions: { key: string; question: string; why?: string; type?: "select" | "toggle" | "multi" | "text"; suggestions: string[] }[];
    answers: Record<string, string>;
  };
  onAnswer: (key: string, val: string) => void;
  onBuild: () => void;
  onSkip: () => void;
}) {
  const toggleMulti = (key: string, s: string) => {
    const cur = (plan.answers[key] || "").split(", ").filter(Boolean);
    const next = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s];
    onAnswer(key, next.join(", "));
  };

  return (
    <div className="rounded-2xl border border-accent/30 bg-accent-soft/40 p-4">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-accent-strong">A few things before I build</p>
      <p className="mt-1 text-[12px] text-text-faint">Locking these down first so I build the right thing once.</p>
      <div className="mt-4 space-y-4">
        {plan.questions.map((q) => {
          const type = q.type ?? (q.suggestions.length ? "select" : "text");
          const selected = (plan.answers[q.key] || "").split(", ").filter(Boolean);
          return (
            <div key={q.key}>
              <p className="text-[13px] font-medium text-text">{q.question}</p>
              {q.why && <p className="mt-0.5 text-[11.5px] leading-snug text-text-faint">{q.why}</p>}

              {type === "toggle" && q.suggestions.length === 2 ? (
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {q.suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => onAnswer(q.key, s)}
                      className={`rounded-lg border px-2.5 py-2 text-[12px] transition-colors ${
                        plan.answers[q.key] === s ? "border-accent bg-accent text-white" : "border-border bg-panel text-text-dim hover:border-accent/40 hover:text-text"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              ) : q.suggestions.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {q.suggestions.map((s) => {
                    const on = type === "multi" ? selected.includes(s) : plan.answers[q.key] === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => (type === "multi" ? toggleMulti(q.key, s) : onAnswer(q.key, s))}
                        className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                          on ? "border-accent bg-accent text-white" : "border-border bg-panel text-text-dim hover:border-accent/40 hover:text-text"
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {/* Every question gets a free-text field, not just the open-ended ones — a seller should
                  never be stuck picking the closest of a few preset options when none of them are
                  quite it, even on a toggle or a multi-select. */}
              <input
                value={plan.answers[q.key] ?? ""}
                onChange={(e) => onAnswer(q.key, e.target.value)}
                placeholder={q.suggestions.length ? "or type your own…" : "Type your answer…"}
                className="mt-2 w-full rounded-lg border border-border bg-panel px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent/50"
              />
            </div>
          );
        })}
      </div>
      <div className="mt-5 flex items-center gap-2">
        <button type="button" onClick={onBuild} className="flex-1 rounded-lg gradient-fill py-2 text-[13px] font-semibold text-white">
          Build my store
        </button>
        <button type="button" onClick={onSkip} className="rounded-lg px-3 py-2 text-[12.5px] font-medium text-text-faint hover:text-text">
          Decide for me
        </button>
      </div>
    </div>
  );
}

/** The Claude-Design-style opening screen: one centered prompt, then it hands off to the studio. */
function LaunchScreen({
  storeName,
  sending,
  onSend,
  onExtract,
  starters,
}: {
  storeName: string;
  sending: boolean;
  onSend: (text: string, images?: string[]) => void;
  onExtract: () => void;
  starters: string[];
}) {
  const [value, setValue] = useState("");
  const attach = useImageAttachments();
  const fire = () => onSend(value, attach.items.map((a) => a.dataUrl));
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl">
        <div className="mb-8 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-fill">
            <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[15px] font-semibold">Orbit Design</span>
        </div>

        <h1 className="text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]">
          What should your storefront be?
        </h1>
        <p className="mt-2 text-[14px] text-text-dim">
          Describe the store you want for <span className="text-text">{storeName}</span> — the look, the pages, the feel.
          Orbit Design builds it live, and you refine it from there.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            fire();
          }}
          className="mt-6"
          {...attach.dropHandlers}
        >
          <div
            className={`rounded-2xl border bg-panel p-3 focus-within:border-accent/50 ${
              attach.dragging ? "border-accent border-dashed" : "border-border"
            }`}
          >
            <AttachmentTray items={attach.items} onRemove={attach.remove} />
            <textarea
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onPaste={attach.onPaste}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  fire();
                }
              }}
              rows={3}
              placeholder="Describe the store you want, paste a screenshot of a site you like, or drop its link…"
              className="w-full resize-none bg-transparent px-2 py-1.5 text-[14px] leading-relaxed outline-none"
            />
            <div className="mt-1 flex items-center justify-between px-1">
              <div className="flex items-center gap-1">
                <AttachButton onFiles={attach.add} disabled={sending || attach.atMax} />
                <button type="button" onClick={onExtract} className="flex items-center gap-1.5 text-[12.5px] text-text-faint hover:text-text">
                  <Globe className="h-3.5 w-3.5" /> Match my website
                </button>
              </div>
              <button
                type="submit"
                disabled={sending || (!value.trim() && !attach.items.length)}
                className="inline-flex items-center gap-1.5 rounded-lg gradient-fill px-4 py-2 text-[13.5px] font-semibold text-white disabled:opacity-40"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Build it
              </button>
            </div>
          </div>
        </form>

        <div className="mt-5 flex flex-wrap gap-2">
          {starters.map((s) => (
            <button
              key={s}
              onClick={() => onSend(s)}
              className="rounded-full border border-border bg-panel px-3.5 py-1.5 text-left text-[12.5px] text-text-dim transition-colors hover:border-accent/40 hover:text-text"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
