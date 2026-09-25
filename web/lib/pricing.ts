// Anthropic list pricing per model, USD per million tokens. Rates for the newest models
// (Opus 5, Sonnet 5, Fable 5.1, Haiku 4.5's current id) are carried over from their same-tier
// predecessor as a real, labeled estimate — verify against Anthropic's published pricing and
// update here if it differs, same as any other rate in this table.
const RATES: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 15, output: 75 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-fable-5-1": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const rate = RATES[model] ?? RATES["claude-sonnet-4-5"];
  return (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
}
