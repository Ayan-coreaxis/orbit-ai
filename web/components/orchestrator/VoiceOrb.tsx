"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Compass } from "lucide-react";

export interface VoiceOrbHandle {
  /** Start reacting to a real microphone stream's amplitude (while listening). */
  attachMicStream: (stream: MediaStream) => void;
  /** Stop reacting to the mic and settle back down. */
  detachMic: () => void;
}

function rmsLevel(analyser: AnalyserNode, data: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(data);
  let sumSquares = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    sumSquares += v * v;
  }
  return Math.min(1, Math.sqrt(sumSquares / data.length) * 4);
}

export const VoiceOrb = forwardRef<VoiceOrbHandle, { size?: number }>(function VoiceOrb({ size = 64 }, ref) {
  const [level, setLevel] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micRafRef = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({
    attachMicStream(stream: MediaStream) {
      const AudioCtxCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtxCtor();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      const data = new Uint8Array(analyser.frequencyBinCount);

      const loop = () => {
        setLevel(rmsLevel(analyser, data));
        micRafRef.current = requestAnimationFrame(loop);
      };
      loop();
    },
    detachMic() {
      if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
      micRafRef.current = null;
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      setLevel(0);
    },
  }));

  useEffect(
    () => () => {
      if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
      audioCtxRef.current?.close().catch(() => {});
    },
    [],
  );

  const scale = 1 + Math.min(level, 1) * 0.4;
  const glow = 8 + Math.min(level, 1) * 36;

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full gradient-fill transition-transform duration-75 ease-out"
      style={{
        width: size,
        height: size,
        transform: `scale(${scale})`,
        filter: `drop-shadow(0 0 ${glow}px var(--accent))`,
      }}
    >
      <Compass className="text-white" style={{ width: size * 0.45, height: size * 0.45 }} strokeWidth={2.5} />
    </div>
  );
});
