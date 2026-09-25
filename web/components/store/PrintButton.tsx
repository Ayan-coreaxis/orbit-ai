"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{
        border: "1px solid #111",
        background: "#111",
        color: "#fff",
        padding: "8px 18px",
        borderRadius: 8,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      Print / Save PDF
    </button>
  );
}
