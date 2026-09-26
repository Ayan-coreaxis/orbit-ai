import type { MetadataRoute } from "next";
import { appBaseUrl } from "@/lib/public-url";

export default function robots(): MetadataRoute.Robots {
  const base = appBaseUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard", "/admin", "/admin-login", "/api/", "/onboarding", "/review/"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
