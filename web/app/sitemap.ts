import type { MetadataRoute } from "next";
import { appBaseUrl } from "@/lib/public-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = appBaseUrl();
  return ["", "/pricing", "/signup", "/login", "/privacy", "/terms"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: p === "" ? "weekly" : "monthly",
    priority: p === "" ? 1 : p === "/pricing" ? 0.8 : 0.4,
  }));
}
