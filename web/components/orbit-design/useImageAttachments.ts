"use client";

import { useCallback, useRef, useState } from "react";

export interface Attachment {
  id: string;
  dataUrl: string; // downscaled JPEG data URL
  name: string;
}

const MAX = 4;
const MAX_EDGE = 1568; // Anthropic downscales past this anyway

/** Read a File, downscale it to a bounded JPEG data URL. */
function loadImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no ctx"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Image attachments for a chat composer: file picker, paste (Ctrl+V) and drag-drop, all
 * downscaled client-side. Returns the tray state plus handlers to wire onto an input/textarea.
 */
export function useImageAttachments() {
  const [items, setItems] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const seq = useRef(0);

  const add = useCallback(async (files: FileList | File[]) => {
    const pics = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!pics.length) return;
    const loaded = await Promise.all(
      pics.map(async (f) => {
        try {
          return { id: `a${seq.current++}`, dataUrl: await loadImage(f), name: f.name || "image" };
        } catch {
          return null;
        }
      }),
    );
    setItems((prev) => [...prev, ...loaded.filter((x): x is Attachment => x !== null)].slice(0, MAX));
  }, []);

  const remove = useCallback((id: string) => setItems((prev) => prev.filter((x) => x.id !== id)), []);
  const clear = useCallback(() => setItems([]), []);

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData.files);
      if (files.some((f) => f.type.startsWith("image/"))) {
        e.preventDefault();
        void add(files);
      }
    },
    [add],
  );

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes("Files")) {
        e.preventDefault();
        setDragging(true);
      }
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e: React.DragEvent) => {
      if (e.dataTransfer.files.length) {
        e.preventDefault();
        setDragging(false);
        void add(e.dataTransfer.files);
      }
    },
  };

  return { items, dragging, add, remove, clear, onPaste, dropHandlers, atMax: items.length >= MAX };
}
