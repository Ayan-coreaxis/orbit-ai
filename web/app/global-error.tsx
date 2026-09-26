"use client";

/** Last-resort screen when even the root layout fails. Plain styles — global CSS isn't loaded here. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0b0b0d", color: "#f4f4f5", minHeight: "100dvh", display: "grid", placeItems: "center" }}>
        <title>Orbit — something went wrong</title>
        <div style={{ textAlign: "center", padding: 24, maxWidth: 420 }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ color: "#a1a1aa", fontSize: 14, lineHeight: 1.6 }}>Please try again in a moment.</p>
          {error.digest && <p style={{ color: "#71717a", fontSize: 12, fontFamily: "monospace" }}>Ref: {error.digest}</p>}
          <button onClick={() => retry()} style={{ marginTop: 16, background: "#d946ef", color: "#fff", border: 0, borderRadius: 10, padding: "10px 18px", fontWeight: 600, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
