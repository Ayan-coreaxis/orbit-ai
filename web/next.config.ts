import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf.js loads its own worker file at runtime — keep it out of the server bundle.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
