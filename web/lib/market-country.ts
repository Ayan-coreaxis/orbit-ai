import { PK_CITIES } from "@/lib/pk-cities";

// City names are plain letters and spaces, so they go into the pattern as-is.
const PK_TEXT = new RegExp(String.raw`\b(pakistan|pkr|${PK_CITIES.map((c) => c.toLowerCase()).join("|")})\b|\brs\.?\s?\d`, "i");

/** True when what the seller wrote says they sell in Pakistan — a Pakistani city, "Rs 450", PKR. */
export function mentionsPakistan(text: string): boolean {
  return PK_TEXT.test(text);
}

/**
 * Store currency is the main signal for which market a seller is in, but "usd" is also just the
 * default a store starts with — so when it's usd and the seller's own words point to Pakistan,
 * trust the words (a Lahore chai shop must not be researched as an American one).
 */
export function marketCurrency(currency: string, sellerText: string): string {
  const c = (currency || "usd").toLowerCase();
  return c === "usd" && mentionsPakistan(sellerText) ? "pkr" : c;
}
