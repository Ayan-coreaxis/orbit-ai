const SYMBOLS: Record<string, string> = {
  usd: "$",
  eur: "€",
  gbp: "£",
  pkr: "Rs ",
  inr: "₹",
  aud: "A$",
  cad: "C$",
  nzd: "NZ$",
  aed: "AED ",
  sar: "SAR ",
  bdt: "৳",
  lkr: "Rs ",
};

// Currencies whose shops price in whole units — no minor unit shown to the shopper.
const ZERO_DECIMAL = new Set(["pkr", "inr", "lkr", "bdt", "jpy", "krw", "vnd", "idr"]);

/** Format a price with the store's currency symbol. Defaults to PKR (the platform's home market). */
export function money(amount: number, currency: string | null | undefined = "pkr"): string {
  const code = (currency || "pkr").toLowerCase();
  const symbol = SYMBOLS[code] ?? `${code.toUpperCase()} `;
  const maxFrac = ZERO_DECIMAL.has(code) ? 0 : 2;
  const value = ZERO_DECIMAL.has(code) ? Math.round(amount) : amount;
  return `${symbol}${value.toLocaleString(undefined, { maximumFractionDigits: maxFrac })}`;
}
