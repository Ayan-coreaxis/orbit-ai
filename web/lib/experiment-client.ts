/** Deterministic real A/B split — same real visitor session always lands on the same variant. Pure, no server deps, safe to import client-side. */
export function assignVariant(sessionId: string): "A" | "B" {
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = (hash << 5) - hash + sessionId.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 2 === 0 ? "A" : "B";
}

export function getOrCreateExperimentSessionId(): string {
  if (typeof window === "undefined") return "";
  const key = "orbit_exp_session";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export function trackExperimentEvent(experimentId: string, variant: "A" | "B", type: "view" | "convert") {
  if (typeof window === "undefined") return;
  const sessionId = getOrCreateExperimentSessionId();
  fetch("/api/experiments/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ experimentId, variant, type, sessionId }),
    keepalive: true,
  }).catch(() => {});
}
