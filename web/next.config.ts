import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(self), microphone=(self)" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Pages may only be framed by Orbit itself (Orbit Design previews) — stops clickjacking.
];

// Agent-built store pages send their own, stricter CSP (sandbox) — a header set here would replace it.
const pageCsp = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; form-action 'self' https://checkout.stripe.com https://sandbox.jazzcash.com.pk https://payments.jazzcash.com.pk https://easypaystg.easypaisa.com.pk https://easypay.easypaisa.com.pk; object-src 'none'" },
];

const nextConfig: NextConfig = {
  // pdf.js loads its own worker file at runtime — keep it out of the server bundle.
  serverExternalPackages: ["pdfjs-dist"],
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/((?!api/store/[^/]+/site$|api/orbit-design/site/view$).*)", headers: pageCsp },
      // agent-built stores run in a sandboxed frame (opaque origin) and import these as modules
      { source: "/vendor/:path*", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }, { key: "Cache-Control", value: "public, max-age=86400" }] },
      { source: "/uploads/:path*", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }] },
    ];
  },
};

export default nextConfig;
