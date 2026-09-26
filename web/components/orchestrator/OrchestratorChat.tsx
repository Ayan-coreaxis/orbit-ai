"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Send, Mic, Square, Volume2, VolumeX, Compass, ClipboardCheck, Paperclip, AudioLines, Upload, X } from "lucide-react";
import { MessageFiles, PendingFiles, usePendingFiles, useVoiceNote } from "@/components/orchestrator/ChatAttachments";
import { MEDIA_ACCEPT, type UploadedMedia } from "@/lib/media-client";
import { cn } from "@/lib/utils";
import { VoiceOrb, type VoiceOrbHandle } from "@/components/orchestrator/VoiceOrb";
import { AgentOrb, type OrbState } from "@/components/orchestrator/AgentOrb";
import { ChatText } from "@/components/orchestrator/ChatText";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  speaker?: string | null; // null/"orchestrator" = the main persona; a specialist agentId = that specialist visibly speaking in the meeting
  needsUser?: boolean; // true = this specialist message is a real, unmet requirement — the meeting is paused here
  // Growth-plan actions taken (or proposed) in this turn
  opsState?: string | null; // applied | pending | dismissed | failed
  opsSummary?: string[] | null;
  askApproval?: boolean;
  attachments?: UploadedMedia[];
}

/** Real display names + a stable color per specialist, so the same agent always reads the same
 * color across a conversation — matches the personas in lib/specialist-consult.ts. */
const SPECIALIST_LABELS: Record<string, { name: string; color: string }> = {
  seo: { name: "SEO Agent", color: "#2b8a6f" },
  content: { name: "Content Agent", color: "#a8730f" },
  ads: { name: "Ads Agent", color: "#b3541e" },
  pricing: { name: "Pricing Agent", color: "#5b5fc7" },
  personalization: { name: "Personalization Agent", color: "#8a3e8a" },
  experimentation: { name: "Experimentation Agent", color: "#2b7bb3" },
  retention: { name: "Retention Agent", color: "#c2185b" },
  reviews: { name: "Reviews Agent", color: "#6b7c1f" },
  inventory: { name: "Inventory Agent", color: "#0f766e" },
};

// Stages shown while the real API call is in flight — the reply isn't streamed yet, so these
// follow the order the server really works in (read data → consult → write), paced by time.
const THINKING_STAGES: { text: string; orb: OrbState; after: number }[] = [
  { text: "Thinking…", orb: "solving", after: 0 },
  { text: "Reading your store data…", orb: "searching", after: 2500 },
  { text: "Weighing the options…", orb: "connecting", after: 6000 },
  { text: "Writing the reply…", orb: "composing", after: 11000 },
];

/**
 * What kind of FILE an agent's "Needs from you" is asking for, if any — so the Upload button only
 * appears when a file is really needed (not when it wants a price or a yes/no), labelled for it.
 */
const FILE_NEEDS: [RegExp, string][] = [
  [/\b(photos?|pictures?|pics?|images?|tasveer\w*|shots?|photography|lifestyle shots?|logo)\b/i, "photos"],
  [/\b(videos?|reels?|clips?|footage)\b/i, "video"],
  [/\b(voice ?notes?|audio|recording)\b/i, "voice note"],
  [/\b(pdf|catalog(ue)?s?|price ?lists?|documents?|invoices?|menu|brochure)\b/i, "PDF"],
];
function fileNeedLabel(content: string): string | null {
  const need = content.split(/Needs from you:/i)[1] ?? "";
  const kinds = FILE_NEEDS.filter(([re]) => re.test(need)).map(([, k]) => k);
  if (!kinds.length) return null;
  return `Upload ${kinds.length > 1 ? `${kinds.slice(0, -1).join(", ")} or ${kinds[kinds.length - 1]}` : kinds[0]}`;
}

// Minimal shape of the Web Speech API's SpeechRecognition — not in TS's default lib.
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: { transcript: string }[][] }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

// The browser's default TTS voice is often an old, robotic-sounding SAPI voice.
// Modern browsers also ship free, much more natural neural voices (e.g. Edge/Windows
// "Online (Natural)" voices, Chrome's "Google" voices) — prefer those when present,
// with no added cost, instead of switching to a paid TTS API.
function pickBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const pool = english.length > 0 ? english : voices;
  if (pool.length === 0) return null;
  const rank = (v: SpeechSynthesisVoice) => {
    const name = v.name.toLowerCase();
    if (name.includes("online (natural)") || name.includes("neural")) return 0;
    if (name.includes("online")) return 1;
    if (name.includes("google")) return 2;
    return 3;
  };
  return [...pool].sort((a, b) => rank(a) - rank(b))[0];
}

const noSubscribe = () => () => {};

export function OrchestratorChat({
  initialMessages,
  onPlanChanged,
  onReviewPlan,
}: {
  initialMessages: ChatMessage[];
  onPlanChanged?: () => void;
  onReviewPlan?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const pending = usePendingFiles();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const voiceNote = useVoiceNote((blob, name, transcript) => pending.add([{ blob, name, transcript }]));
  const [sending, setSending] = useState(false);
  const [stage, setStage] = useState(0);
  const thinking = THINKING_STAGES[stage];
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  // Browser-only capability: false on the server, real value once in the browser.
  const voiceSupported = useSyncExternalStore(noSubscribe, () => !!getSpeechRecognition() && "speechSynthesis" in window, () => false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const orbRef = useRef<VoiceOrbHandle>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const bestVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const typingTimerRef = useRef<number | null>(null);
  // Real-time "who's talking right now" — drives the meeting visualization above the chat.
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  const [meetingSpeakers, setMeetingSpeakers] = useState<string[]>([]); // real specialists consulted THIS turn

  // Word-by-word reveal for a freshly-received reply — history/initial messages skip this
  // (nothing in `revealed` for them) and render their full content immediately.
  const typingRef = useRef<{ id: string; text: string } | null>(null);
  function startTyping(id: string, fullText: string) {
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    // A new turn starting must never leave the previous one frozen half-typed — finish it first.
    const prev = typingRef.current;
    if (prev && prev.id !== id) setRevealed((r) => ({ ...r, [prev.id]: prev.text }));
    typingRef.current = { id, text: fullText };
    const words = fullText.split(" ");
    let i = 0;
    const tick = () => {
      i++;
      setRevealed((r) => ({ ...r, [id]: words.slice(0, i).join(" ") }));
      if (i < words.length) {
        typingTimerRef.current = window.setTimeout(tick, 32);
      }
    };
    tick();
  }

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const loadVoices = () => {
      bestVoiceRef.current = pickBestVoice(window.speechSynthesis.getVoices());
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const [wasSending, setWasSending] = useState(sending);
  if (wasSending !== sending) {
    setWasSending(sending);
    if (sending) setStage(0); // each new reply starts the "thinking" stages over
  }
  useEffect(() => {
    if (!sending) return;
    const timers = THINKING_STAGES.slice(1).map((s, i) => window.setTimeout(() => setStage(i + 1), s.after));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [sending]);

  const firstScrollRef = useRef(true);
  useEffect(() => {
    // First paint jumps straight to the latest message; later updates glide.
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: firstScrollRef.current ? "auto" : "smooth" });
    firstScrollRef.current = false;
  }, [messages, sending]);

  // Orbit also speaks on its own (work summaries, scheduled plan reviews) — pick those up.
  const sendingRef = useRef(false);
  sendingRef.current = sending;
  const lastSeenRef = useRef<string>(new Date().toISOString());
  useEffect(() => {
    const t = window.setInterval(async () => {
      if (sendingRef.current || document.hidden) return;
      try {
        const res = await fetch(`/api/orchestrator/messages?after=${encodeURIComponent(lastSeenRef.current)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { messages: (ChatMessage & { createdAt: string })[] };
        if (!data.messages?.length) return;
        lastSeenRef.current = data.messages[data.messages.length - 1].createdAt;
        let added = false;
        setMessages((ms) => {
          const known = new Set(ms.map((m) => m.id));
          const fresh = data.messages.filter((m) => !known.has(m.id) && m.role === "assistant");
          added = fresh.length > 0;
          return fresh.length ? [...ms, ...fresh] : ms;
        });
        if (added || data.messages.some((m) => m.opsState)) onPlanChanged?.();
      } catch {
        // polling is best-effort
      }
    }, 15000);
    return () => window.clearInterval(t);
  }, [onPlanChanged]);

  useEffect(() => () => stopMicStream(), []);
  useEffect(() => () => {
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
  }, []);

  function speakWithBrowserTts(text: string) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    if (bestVoiceRef.current) utter.voice = bestVoiceRef.current;
    utter.rate = 1.05;
    utter.pitch = 1;
    utter.onstart = () => {
      setSpeaking(true);
      orbRef.current?.setSpeaking(true);
    };
    utter.onend = () => {
      setSpeaking(false);
      orbRef.current?.setSpeaking(false);
    };
    utter.onerror = () => {
      setSpeaking(false);
      orbRef.current?.setSpeaking(false);
    };
    // Fires once per spoken word in Chrome — drives the orb's pulse off real speech timing
    // (this fallback path has no real audio stream to analyze, unlike the Google TTS path below).
    utter.onboundary = () => {
      orbRef.current?.pulseForSpeech();
    };
    window.speechSynthesis.speak(utter);
  }

  /**
   * Real neural voice via Google Cloud TTS (server-side) — sounds natural in every browser,
   * not just Edge. Falls back to the browser's own built-in voice when the server doesn't have
   * a real Google TTS key configured yet, or the request fails, rather than staying silent.
   */
  async function speak(raw: string) {
    if (!ttsEnabled) return;
    // Formatting renders in the chat but must never be read aloud as symbols.
    const text = raw.replace(/\n+Sources:\n[\s\S]*$/, "").replace(/\*\*/g, "").replace(/^\s*(?:[-•*]|\d+[.)])\s+/gm, "");
    window.speechSynthesis?.cancel();
    ttsAudioRef.current?.pause();
    orbRef.current?.detachAudio();

    try {
      const res = await fetch("/api/orchestrator/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("not_configured_or_failed");
      const { audioBase64 } = (await res.json()) as { audioBase64: string };

      const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`);
      ttsAudioRef.current = audio;
      audio.onplay = () => {
        setSpeaking(true);
        orbRef.current?.setSpeaking(true);
      };
      const cleanup = () => {
        setSpeaking(false);
        orbRef.current?.setSpeaking(false);
        orbRef.current?.detachAudio();
      };
      audio.onended = cleanup;
      audio.onerror = cleanup;
      orbRef.current?.attachAudioElement(audio);
      await audio.play();
    } catch {
      speakWithBrowserTts(text);
    }
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (sending || pending.uploading || voiceNote.recording) return;
    if (!trimmed && !pending.ready) return;
    const files = pending.take();
    setInput("");
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "user", content: trimmed, attachments: files }]);
    setSending(true);
    setMeetingSpeakers([]);
    setActiveSpeaker(null);
    try {
      const res = await fetch("/api/orchestrator/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, attachments: files.map((f) => f.id) }),
      });
      const data = await res.json();
      if (!res.ok) {
        const replyId = `local-${Date.now()}-reply`;
        const reply = data.error || "Something went wrong.";
        setMessages((m) => [...m, { id: replyId, role: "assistant", content: reply }]);
        startTyping(replyId, reply);
        return;
      }
      // Real meeting messages (specialist turns, if any, then the Orchestrator's own reply) —
      // append them one at a time so it reads like people actually speaking in sequence, and
      // drive the real-time meeting visualization (activeSpeaker) in lockstep with each turn.
      const turns: ChatMessage[] = Array.isArray(data.messages) && data.messages.length > 0
        ? data.messages
        : [{ id: `local-${Date.now()}-reply`, role: "assistant", content: data.reply, speaker: "orchestrator" }];
      const specialistsThisTurn = turns.filter((t) => t.speaker && t.speaker !== "orchestrator").map((t) => t.speaker as string);
      setMeetingSpeakers(specialistsThisTurn);
      for (let i = 0; i < turns.length; i++) {
        const turn = turns[i];
        setActiveSpeaker(turn.speaker ?? "orchestrator");
        setMessages((m) => [...m, turn]);
        startTyping(turn.id, turn.content);
        if (i < turns.length - 1) await new Promise((r) => setTimeout(r, 550));
      }
      lastSeenRef.current = new Date().toISOString();
      const finalTurn = turns[turns.length - 1];
      if (turns.some((t) => t.opsState)) onPlanChanged?.();
      speak(finalTurn.content);
      window.setTimeout(() => setActiveSpeaker(null), 900);
    } catch {
      setMessages((m) => [
        ...m,
        { id: `local-${Date.now()}-err`, role: "assistant", content: "Couldn't reach the server — try again." },
      ]);
    } finally {
      setSending(false);
    }
  }

  const router = useRouter();
  const [resolving, setResolving] = useState<string | null>(null);
  async function resolveProposal(id: string, action: "apply" | "dismiss") {
    setResolving(id);
    try {
      const res = await fetch(`/api/orchestrator/proposal/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't update the plan.");
      setMessages((ms) =>
        ms.map((m) =>
          m.id === id
            ? { ...m, opsState: action === "apply" ? "applied" : "dismissed", opsSummary: action === "apply" ? (data.applied as string[]) : m.opsSummary }
            : m,
        ),
      );
      onPlanChanged?.();
      // A store setting (e.g. currency) may have changed — re-render server data everywhere.
      if (action === "apply") router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setResolving(null);
    }
  }

  function stopMicStream() {
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    orbRef.current?.detachMic();
  }

  async function toggleMic() {
    const SpeechRecognitionCtor = getSpeechRecognition();
    if (!SpeechRecognitionCtor) return;

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      stopMicStream();
      return;
    }

    window.speechSynthesis?.cancel();
    ttsAudioRef.current?.pause();
    orbRef.current?.detachAudio();
    setSpeaking(false);
    orbRef.current?.setSpeaking(false);

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (e) => {
      const transcript = e.results.map((r) => r[0].transcript).join(" ");
      if (transcript.trim()) sendMessage(transcript);
    };
    recognition.onend = () => {
      setListening(false);
      stopMicStream();
    };
    recognition.onerror = () => {
      setListening(false);
      stopMicStream();
    };
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);

    // Real mic amplitude for the orb — a separate stream from what SpeechRecognition uses internally.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      orbRef.current?.attachMicStream(stream);
    } catch {
      // Mic-level visualization is optional — recognition still works without it.
    }
  }

  const lastUserIdx = messages.reduce((last, m, i) => (m.role === "user" ? i : last), -1);
  const orbStatus = listening ? "Listening…" : speaking ? "Speaking…" : sending ? thinking.text : "Ready";

  return (
    <div
      className={cn("relative flex h-full flex-col overflow-hidden rounded-2xl border bg-panel", dragging ? "border-accent" : "border-border")}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        pending.add(Array.from(e.dataTransfer.files ?? []));
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-accent-soft/80 text-[14px] font-semibold text-accent-strong">
          Drop photos, videos, audio or PDFs to send them to your Orchestrator
        </div>
      )}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <VoiceOrb ref={orbRef} size={38} />
        <div className="min-w-0">
          <div className="text-[14px] font-semibold leading-tight">Orchestrator</div>
          <div className="flex items-center gap-1.5 text-[12px] text-text-faint">
            {(sending || listening) && <AgentOrb state={listening ? "listening" : thinking.orb} size={20} />}
            {orbStatus}
          </div>
        </div>
        {/* Real-time meeting: who's in this turn, and who's speaking right now. */}
        {meetingSpeakers.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="mr-1 hidden text-[11px] text-text-faint sm:inline">In the meeting</span>
            {meetingSpeakers.map((id) => {
              const sp = SPECIALIST_LABELS[id];
              if (!sp) return null;
              const active = activeSpeaker === id;
              return (
                <div
                  key={id}
                  title={sp.name}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[10.5px] font-bold text-white transition-all duration-300"
                  style={{ background: sp.color, opacity: active ? 1 : 0.55, transform: active ? "scale(1.12)" : "scale(1)", boxShadow: active ? `0 0 0 3px ${sp.color}33` : "none" }}
                >
                  {sp.name.charAt(0)}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-6">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-text-faint">
            <p className="max-w-xs text-[13.5px]">
              Ask about your plan, your numbers, or brainstorm what to do next — grounded in your real data, no
              guessing. Say &ldquo;naya plan banao&rdquo; and your growth plan appears next to the chat.
            </p>
          </div>
        )}
        {messages.map((m, idx) => {
          if (m.role === "user") {
            return (
              <div key={m.id} className="flex flex-col items-end gap-1.5">
                <MessageFiles files={m.attachments ?? []} />
                {m.content && (
                  <div className="max-w-[75%] whitespace-pre-line rounded-2xl rounded-br-md border border-accent/25 bg-accent-soft px-4 py-2.5 text-[13.5px] leading-relaxed text-text">
                    {m.content}
                  </div>
                )}
              </div>
            );
          }
          const specialist = m.speaker && m.speaker !== "orchestrator" ? SPECIALIST_LABELS[m.speaker] : null;
          const body = m.id in revealed ? revealed[m.id] : m.content;
          return (
            <div key={m.id} className="flex flex-col items-start">
              {/* Who's speaking — avatar + name on one line, message below it aligned to the name. */}
              <div className="flex items-center gap-2">
                {specialist ? (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full text-[10.5px] font-bold text-white" style={{ background: specialist.color }}>
                    {specialist.name.charAt(0)}
                  </div>
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full gradient-fill">
                    <Compass className="h-3 w-3 text-white" strokeWidth={2.5} />
                  </div>
                )}
                <span className="text-[12.5px] font-semibold" style={specialist ? { color: specialist.color } : undefined}>
                  {specialist ? specialist.name : "Orchestrator"}
                </span>
                {m.needsUser && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[10.5px] font-semibold text-warn">Needs your input</span>}
              </div>
              <div className="mt-1.5 w-full max-w-[640px] pl-8 text-[13.5px] leading-[1.7] text-text-dim">
                {specialist ? (
                  <div className="rounded-xl border border-border bg-panel-2/60 px-4 py-3" style={{ borderLeft: `3px solid ${specialist.color}` }}>
                    <ChatText text={body} />
                  </div>
                ) : (
                  <div className="text-text">
                    <ChatText text={body} />
                  </div>
                )}
              </div>
              {/* Files Orbit made for the owner (e.g. an Orbit Studio image or reel). */}
              {!!m.attachments?.length && (
                <div className="mt-2 pl-8">
                  <MessageFiles files={m.attachments} align="start" />
                </div>
              )}
              {/* Only while this request is still open (the owner hasn't replied since) and only if it asks for a file. */}
              {m.needsUser && idx > lastUserIdx && fileNeedLabel(m.content) && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="ml-8 mt-2 inline-flex items-center gap-1.5 rounded-lg border border-warn/40 bg-warn-soft px-3 py-1.5 text-[12.5px] font-medium text-warn hover:brightness-110"
                >
                  <Upload className="h-3.5 w-3.5" /> {fileNeedLabel(m.content)}
                </button>
              )}
              {m.opsState === "applied" && m.opsSummary && m.opsSummary.length > 0 && (
                <div className="ml-8 mt-2 max-w-[608px] rounded-lg bg-good-soft px-3 py-2 text-[12px] text-good">
                  {m.opsSummary.map((l, i) => (
                    <div key={i}>✓ {l}</div>
                  ))}
                </div>
              )}
              {m.opsState === "failed" && m.opsSummary && (
                <div className="ml-8 mt-2 max-w-[608px] rounded-lg bg-bad-soft px-3 py-2 text-[12px] text-bad">{m.opsSummary.join(" ")}</div>
              )}
              {m.opsState === "pending" && (
                <div className="ml-8 mt-2 max-w-[608px] rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-[12px] text-warn">
                  <div className="font-semibold">Proposed change — nothing happens until you press Apply</div>
                  {(m.opsSummary ?? []).map((l, i) => (
                    <div key={i}>• {l}</div>
                  ))}
                  <div className="mt-2 flex gap-2">
                    <button
                      className="rounded-md gradient-fill px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
                      disabled={resolving === m.id}
                      onClick={() => resolveProposal(m.id, "apply")}
                    >
                      Apply
                    </button>
                    <button
                      className="rounded-md border border-border-strong px-3 py-1.5 text-[12px] font-medium text-text-dim disabled:opacity-50"
                      disabled={resolving === m.id}
                      onClick={() => resolveProposal(m.id, "dismiss")}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
              {m.opsState === "dismissed" && <span className="ml-8 mt-1 text-[11px] text-text-faint">Change dismissed.</span>}
              {m.askApproval && onReviewPlan && (
                <button
                  onClick={onReviewPlan}
                  className="ml-8 mt-2 inline-flex items-center gap-1.5 rounded-lg gradient-fill px-3 py-1.5 text-[12.5px] font-semibold text-white"
                >
                  <ClipboardCheck className="h-3.5 w-3.5" /> Review final plan
                </button>
              )}
            </div>
          );
        })}
        {sending && (
          <div className="flex items-center gap-3 pl-0.5" aria-live="polite">
            <AgentOrb state={thinking.orb} size={32} label={thinking.text} />
            <span key={stage} className="animate-fade-in text-[13px] text-text-dim">{thinking.text}</span>
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        <PendingFiles files={pending.files} onRemove={pending.remove} />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={MEDIA_ACCEPT}
          className="hidden"
          onChange={(e) => {
            pending.add(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        {voiceNote.recording ? (
          <div className="flex items-center gap-3 rounded-full border border-bad/40 bg-bad-soft px-4 py-2">
            <span className="h-2.5 w-2.5 animate-pulse-dot rounded-full bg-bad" />
            <span className="text-[13px] font-medium text-bad">Recording voice note · {Math.floor(voiceNote.seconds / 60)}:{String(voiceNote.seconds % 60).padStart(2, "0")}</span>
            <button onClick={voiceNote.cancel} className="ml-auto rounded-full p-1.5 text-text-faint hover:text-text" title="Discard">
              <X className="h-4 w-4" />
            </button>
            <button onClick={voiceNote.stop} className="rounded-full gradient-fill px-3.5 py-1.5 text-[12.5px] font-semibold text-white">
              Done
            </button>
          </div>
        ) : (
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border-strong text-text-dim hover:text-text"
            title="Attach photos, videos, audio or PDF"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <button
            onClick={voiceNote.start}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border-strong text-text-dim hover:text-text"
            title="Record a voice note"
          >
            <AudioLines className="h-4 w-4" />
          </button>
          {voiceSupported && (
            <button
              onClick={toggleMic}
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
                listening ? "bg-bad text-white animate-pulse-dot" : "border border-border-strong text-text-dim hover:text-text",
              )}
              title={listening ? "Stop listening" : "Push to talk"}
            >
              {listening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
          <input
            className="input order-first min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-auto"
            placeholder={listening ? "Listening…" : pending.files.length ? "Add a message (optional)…" : "Ask your Orchestrator anything…"}
            value={input}
            disabled={listening}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage(input);
            }}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files ?? []);
              if (files.length) {
                e.preventDefault();
                pending.add(files);
              }
            }}
          />
          <button
            onClick={() => setTtsEnabled((v) => !v)}
            className="ml-auto flex h-10 w-10 shrink-0 sm:ml-0 items-center justify-center rounded-full border border-border-strong text-text-dim hover:text-text"
            title={ttsEnabled ? "Mute voice replies" : "Unmute voice replies"}
          >
            {ttsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <button
            onClick={() => sendMessage(input)}
            disabled={(!input.trim() && !pending.ready) || sending || pending.uploading}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full gradient-fill text-white disabled:opacity-40"
            title={pending.uploading ? "Wait for the upload to finish" : "Send"}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        )}
      </div>
    </div>
  );
}
