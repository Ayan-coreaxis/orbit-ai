"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Compass } from "lucide-react";

export interface VoiceOrbHandle {
  /** Start reacting to a real microphone stream's amplitude (while listening). */
  attachMicStream: (stream: MediaStream) => void;
  /** Stop reacting to the mic and settle back down. */
  detachMic: () => void;
  /** Start reacting to real playing TTS audio's amplitude (Google Cloud TTS path). */
  attachAudioElement: (audio: HTMLAudioElement) => void;
  /** Stop reacting to the TTS audio and settle back down. */
  detachAudio: () => void;
  /** Call on each TTS word-boundary event — drives a real speech-timed pulse (browser TTS fallback path, which has no audio stream to analyze directly). */
  pulseForSpeech: () => void;
  /** Toggle the decay loop that keeps the orb gently moving while browser-TTS audio is playing. */
  setSpeaking: (speaking: boolean) => void;
}

function rmsLevel(analyser: AnalyserNode, data: Uint8Array): number {
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
  const ttsAudioCtxRef = useRef<AudioContext | null>(null);
  const ttsSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const ttsRafRef = useRef<number | null>(null);
  const speakLevelRef = useRef(0);
  const speakRafRef = useRef<number | null>(null);
  const speakingRef = useRef(false);

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
    attachAudioElement(audio: HTMLAudioElement) {
      const AudioCtxCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtxCtor();
      const source = ctx.createMediaElementSource(audio);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(ctx.destination); // keep it audible — analyser is a pass-through node
      ttsAudioCtxRef.current = ctx;
      ttsSourceRef.current = source;
      const data = new Uint8Array(analyser.frequencyBinCount);

      const loop = () => {
        setLevel(rmsLevel(analyser, data));
        ttsRafRef.current = requestAnimationFrame(loop);
      };
      loop();
    },
    detachAudio() {
      if (ttsRafRef.current) cancelAnimationFrame(ttsRafRef.current);
      ttsRafRef.current = null;
      ttsSourceRef.current?.disconnect();
      ttsSourceRef.current = null;
      ttsAudioCtxRef.current?.close().catch(() => {});
      ttsAudioCtxRef.current = null;
      setLevel(0);
    },
    pulseForSpeech() {
      speakLevelRef.current = 1;
    },
    setSpeaking(speaking: boolean) {
      speakingRef.current = speaking;
      if (speaking && speakRafRef.current === null) {
        const decay = () => {
          speakLevelRef.current *= 0.82;
          setLevel(speakLevelRef.current);
          if (speakingRef.current || speakLevelRef.current > 0.01) {
            speakRafRef.current = requestAnimationFrame(decay);
          } else {
            speakRafRef.current = null;
            setLevel(0);
          }
        };
        speakRafRef.current = requestAnimationFrame(decay);
      }
    },
  }));

  useEffect(
    () => () => {
      if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
      if (speakRafRef.current) cancelAnimationFrame(speakRafRef.current);
      if (ttsRafRef.current) cancelAnimationFrame(ttsRafRef.current);
      audioCtxRef.current?.close().catch(() => {});
      ttsAudioCtxRef.current?.close().catch(() => {});
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
