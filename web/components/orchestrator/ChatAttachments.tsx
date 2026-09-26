"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2, X, AlertCircle, Film } from "lucide-react";
import { formatSize, uploadMedia, type UploadedMedia } from "@/lib/media-client";

// ---------- Pending uploads in the composer ----------

export type PendingFile = {
  key: string;
  name: string;
  kind: UploadedMedia["kind"] | "other";
  preview: string | null; // local object URL for images
  status: "uploading" | "done" | "error";
  media?: UploadedMedia;
  error?: string;
};

const kindFromMime = (mime: string): PendingFile["kind"] =>
  mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : mime === "application/pdf" ? "pdf" : "other";

/** Files the owner is attaching to the next message — each one uploads to the media library right away. */
export function usePendingFiles() {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files; // read by take() from event handlers, always after this commit
  }, [files]);

  const add = useCallback((list: (File | { blob: Blob; name: string; transcript?: string })[]) => {
    for (const item of list.slice(0, 10)) {
      const blob = item instanceof File ? item : item.blob;
      const name = item instanceof File ? item.name : item.name;
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const kind = kindFromMime(blob.type);
      setFiles((f) => [...f, { key, name, kind, preview: kind === "image" ? URL.createObjectURL(blob) : null, status: "uploading" }]);
      uploadMedia(blob, { name, source: "chat", transcript: item instanceof File ? undefined : item.transcript })
        .then((media) => setFiles((f) => f.map((x) => (x.key === key ? { ...x, status: "done", media } : x))))
        .catch((e) => setFiles((f) => f.map((x) => (x.key === key ? { ...x, status: "error", error: e instanceof Error ? e.message : "Upload failed" } : x))));
    }
  }, []);

  const remove = useCallback((key: string) => {
    setFiles((f) => {
      const x = f.find((y) => y.key === key);
      if (x?.preview) URL.revokeObjectURL(x.preview);
      return f.filter((y) => y.key !== key);
    });
  }, []);

  /** Take the uploaded files for sending and clear the composer. */
  const take = useCallback((): UploadedMedia[] => {
    const done = filesRef.current.filter((f) => f.status === "done" && f.media).map((f) => f.media!);
    // the same file picked twice uploads to the same library item — send it once
    const unique = done.filter((m, i) => done.findIndex((x) => x.id === m.id) === i);
    filesRef.current.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    setFiles([]);
    return unique;
  }, []);

  return {
    files,
    add,
    remove,
    take,
    uploading: files.some((f) => f.status === "uploading"),
    ready: files.some((f) => f.status === "done"),
  };
}

export function PendingFiles({ files, onRemove }: { files: PendingFile[]; onRemove: (key: string) => void }) {
  if (!files.length) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {files.map((f) => (
        <div
          key={f.key}
          className={`relative flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[12px] ${f.status === "error" ? "border-bad/50 bg-bad-soft text-bad" : "border-border bg-panel-2 text-text-dim"}`}
          title={f.error ?? f.name}
        >
          {f.preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.preview} alt="" className="h-8 w-8 rounded object-cover" />
          ) : (
            <KindIcon kind={f.kind} />
          )}
          <div className="max-w-[140px]">
            <div className="truncate">{f.kind === "audio" && f.name.startsWith("Voice note") ? "Voice note" : f.name}</div>
            <div className="text-[10.5px] text-text-faint">
              {f.status === "uploading" ? (f.kind === "video" ? "Reading video…" : "Uploading…") : f.status === "error" ? f.error : f.media ? formatSize(f.media.size) : ""}
            </div>
          </div>
          {f.status === "uploading" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-text-faint" />
          ) : (
            <button onClick={() => onRemove(f.key)} className="rounded p-0.5 text-text-faint hover:text-text" aria-label="Remove">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function KindIcon({ kind }: { kind: PendingFile["kind"] }) {
  const cls = "flex h-8 w-8 items-center justify-center rounded bg-panel text-text-faint";
  if (kind === "video") return <div className={cls}><Film className="h-4 w-4" /></div>;
  if (kind === "audio") return <div className={cls}><WaveIcon /></div>;
  if (kind === "pdf") return <div className={cls}><FileText className="h-4 w-4" /></div>;
  return <div className={cls}><AlertCircle className="h-4 w-4" /></div>;
}

function WaveIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
      {[2, 5, 8, 11, 14].map((x, i) => (
        <rect key={x} x={x - 0.75} y={[6, 3, 1.5, 4, 6.5][i]} width="1.5" height={[4, 10, 13, 8, 3][i]} rx="0.75" />
      ))}
    </svg>
  );
}

// ---------- Sent attachments, inside a message ----------

export function MessageFiles({ files, align = "end" }: { files: UploadedMedia[]; align?: "start" | "end" }) {
  if (!files?.length) return null;
  const images = files.filter((f) => f.kind === "image");
  const others = files.filter((f) => f.kind !== "image");
  return (
    <div className={`flex max-w-[75%] flex-col gap-2 ${align === "end" ? "items-end" : "items-start"}`}>
      {images.length > 0 && (
        <div className={`grid gap-1.5 ${images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {images.map((f) => (
            <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={f.name} className={`${images.length === 1 ? "max-h-64 max-w-[260px]" : "h-28 w-28"} object-cover`} />
            </a>
          ))}
        </div>
      )}
      {others.map((f) =>
        f.kind === "video" ? (
          <video key={f.id} src={f.url} controls preload="metadata" className="max-h-60 max-w-[300px] rounded-xl border border-border" />
        ) : f.kind === "audio" ? (
          <div key={f.id} className="w-[280px] rounded-xl border border-border bg-panel-2 p-2.5">
            <audio src={f.url} controls preload="metadata" className="h-9 w-full" />
            {f.text ? (
              <p className="mt-1.5 line-clamp-3 text-[12px] italic text-text-dim">&ldquo;{f.text}&rdquo;</p>
            ) : (
              f.note && <p className="mt-1.5 text-[11px] text-text-faint">{f.note}</p>
            )}
          </div>
        ) : (
          <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-border bg-panel-2 px-3 py-2 text-[12.5px] text-text-dim hover:text-text">
            <FileText className="h-4 w-4 text-bad" />
            <span className="max-w-[200px] truncate">{f.name}</span>
            <span className="text-[11px] text-text-faint">{formatSize(f.size)}</span>
          </a>
        ),
      )}
    </div>
  );
}

// ---------- Voice note recorder ----------

interface Recognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

/**
 * Records a voice note (real audio file) and, at the same time, lets the browser's own speech
 * recognition write down what was said — so the Orchestrator gets a transcript with no paid API.
 */
export function useVoiceNote(onDone: (blob: Blob, name: string, transcript: string) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const speechRef = useRef<Recognition | null>(null);
  const transcriptRef = useRef("");
  const timerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  const cleanup = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    try {
      speechRef.current?.stop();
    } catch {}
    speechRef.current = null;
  };
  useEffect(() => () => cleanup(), []);

  const start = useCallback(async () => {
    if (recording) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert("Microphone permission is needed to record a voice note.");
      return;
    }
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      cleanup();
      setRecording(false);
      if (cancelledRef.current || !chunks.length) return;
      const type = (rec.mimeType || "audio/webm").split(";")[0];
      const blob = new Blob(chunks, { type });
      const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      onDone(blob, `Voice note ${stamp}.${type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm"}`, transcriptRef.current.trim());
    };
    transcriptRef.current = "";
    cancelledRef.current = false;
    rec.start(250);
    recRef.current = rec;
    setRecording(true);
    setSeconds(0);
    timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);

    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (Ctor) {
      const sr = new Ctor();
      sr.continuous = true;
      sr.interimResults = false;
      sr.lang = "en-IN"; // understands Roman-Urdu / Hinglish speech and writes it in Latin letters
      sr.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) transcriptRef.current += ` ${e.results[i][0].transcript}`;
      };
      sr.onend = () => {
        // Chrome stops recognition on silence — keep it going while we're still recording.
        if (recRef.current?.state === "recording" && speechRef.current === sr) {
          try {
            sr.start();
          } catch {}
        }
      };
      speechRef.current = sr;
      try {
        sr.start();
      } catch {}
    }
  }, [recording, onDone]);

  const stop = useCallback(() => recRef.current?.state === "recording" && recRef.current.stop(), []);
  const cancel = useCallback(() => {
    cancelledRef.current = true;
    stop();
  }, [stop]);

  return { recording, seconds, start, stop, cancel };
}
