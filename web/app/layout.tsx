import type { Metadata, Viewport } from "next";
import "./globals.css";
import { appBaseUrl } from "@/lib/public-url";

const description = "Your online store, content, ads, WhatsApp and growth plan — run by one AI Orchestrator and its team, on your real numbers.";

export const metadata: Metadata = {
  metadataBase: new URL(appBaseUrl()),
  title: { default: "Orbit — The AI team that runs your store", template: "%s · Orbit" },
  description,
  applicationName: "Orbit",
  openGraph: { type: "website", siteName: "Orbit", title: "Orbit — The AI team that runs your store", description },
  twitter: { card: "summary_large_image", title: "Orbit — The AI team that runs your store", description },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0d" },
    { media: "(prefers-color-scheme: light)", color: "#faf8f5" },
  ],
};

const themeInitScript = `
try {
  var t = localStorage.getItem('theme');
  if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
} catch (e) {}
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
