import type { StudioBrief } from "@/lib/studio/director";
import type { StudioInput } from "@/lib/studio/formats";

/** Shapes the Studio API sends to the page (mirrors lib/studio/engine.ts JobView + config status). */

export type StudioJobView = {
  id: string;
  format: string;
  kind: "image" | "video";
  status: "draft" | "queued" | "generating" | "finishing" | "done" | "failed" | string;
  stage: string | null;
  brief: StudioBrief | null;
  input: StudioInput;
  error: string | null;
  source: string;
  createdAt: string;
  result: { id: string; url: string; kind: string; poster: string | null } | null;
  keyframeUrl: string | null;
  estimateUsd: number;
};

export type StudioStatusView = {
  plan: string;
  allowed: boolean;
  enabled: boolean;
  imageReady: boolean;
  videoReady: boolean;
  limit: { images: number; videos: number };
  used: { images: number; videos: number };
  left: { images: number; videos: number };
  resetsOn: string;
};

export type StudioProduct = { id: string; name: string; imageUrl: string | null };

export type StudioData = {
  status: StudioStatusView;
  products: StudioProduct[];
  jobs: StudioJobView[];
  brandFace: { id: string; url: string } | null;
};

export const WORKING = ["queued", "generating", "finishing"];
