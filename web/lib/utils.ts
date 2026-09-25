import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * Truncates a string like `.slice(0, maxLen)`, but never leaves a dangling high surrogate at the
 * cut point. Plain `.slice()` operates on UTF-16 code units, so it can split a real character
 * (emoji, some non-Latin scripts) that's encoded as a surrogate pair — the resulting string is
 * still valid JS, but `JSON.stringify`ing it and sending it over HTTP produces literally invalid
 * JSON ("no low surrogate in string"), which real scraped web text hits often enough to matter.
 */
export function safeSlice(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastCode = cut.charCodeAt(cut.length - 1);
  return lastCode >= 0xd800 && lastCode <= 0xdbff ? cut.slice(0, -1) : cut;
}
