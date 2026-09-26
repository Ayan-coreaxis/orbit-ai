import { ImageResponse } from "next/og";

export const alt = "Orbit — the AI team that runs your online store";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social share card for orbit.ai links (WhatsApp, Facebook, X, LinkedIn). */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "radial-gradient(circle at 20% 10%, #3b1d5e 0%, #0b0b0d 55%)",
          color: "#fafafa",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: "linear-gradient(135deg,#8b5cf6,#d946ef,#fb923c)" }} />
          <div style={{ fontSize: 44, fontWeight: 700 }}>orbit.ai</div>
        </div>
        <div style={{ marginTop: 48, fontSize: 68, fontWeight: 800, lineHeight: 1.05, maxWidth: 980 }}>The AI team that runs your online store</div>
        <div style={{ marginTop: 28, fontSize: 30, color: "#a1a1aa", maxWidth: 980 }}>Store, content, ads, WhatsApp and growth plan — one Orchestrator, working on your real numbers.</div>
      </div>
    ),
    size,
  );
}
