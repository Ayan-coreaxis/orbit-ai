import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(self), microphone=(self)" },
  // Pages may only be framed by Orbit itself (Orbit Design previews) — stops clickjacking.
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; form-action 'self' https://checkout.stripe.com https://sandbox.jazzcash.com.pk https://payments.jazzcash.com.pk https://easypaystg.easypaisa.com.pk https://easypay.easypaisa.com.pk; object-src 'none'" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
];

const nextConfig: NextConfig = {
  // pdf.js loads its own worker file at runtime — keep it out of the server bundle.
  serverExternalPackages: ["pdfjs-dist"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
