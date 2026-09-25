/**
 * Real "editable region" system for Orbit-Design-generated pages. Rather than tracking fragile
 * DOM selectors, an editable piece of content is a real, visible marker inside the page's own
 * stored HTML: <span data-orbit-field="opening_hours" data-orbit-label="Opening Hours">Mon–Fri
 * 9–5</span>. The HTML itself is the single source of truth for what's editable — no separate
 * schema to drift out of sync with the actual content.
 */

export interface EditableField {
  key: string;
  label: string;
  value: string;
}

const FIELD_RE = /<span[^>]*\sdata-orbit-field="([^"]+)"[^>]*\sdata-orbit-label="([^"]*)"[^>]*>([\s\S]*?)<\/span>/g;
// Also match the reverse attribute order, since the model won't always emit them in the same sequence.
const FIELD_RE_ALT = /<span[^>]*\sdata-orbit-label="([^"]*)"[^>]*\sdata-orbit-field="([^"]+)"[^>]*>([\s\S]*?)<\/span>/g;

/** Real fields actually present in this page's real HTML — nothing inferred, nothing guessed. */
export function extractEditableFields(html: string): EditableField[] {
  const fields: EditableField[] = [];
  const seen = new Set<string>();

  for (const m of html.matchAll(FIELD_RE)) {
    const [, key, label, value] = m;
    if (seen.has(key)) continue;
    seen.add(key);
    fields.push({ key, label: label || key, value: stripTags(value) });
  }
  for (const m of html.matchAll(FIELD_RE_ALT)) {
    const [, label, key, value] = m;
    if (seen.has(key)) continue;
    seen.add(key);
    fields.push({ key, label: label || key, value: stripTags(value) });
  }
  return fields;
}

/** Real, in-place text swap for each field's current value — the rest of the page's real HTML
 * (structure, styling) is untouched. Only ever replaces text content inside a field's own span,
 * never re-generates or re-interprets anything else on the page. */
export function applyEditableFieldValues(html: string, values: Record<string, string>): string {
  let result = html;
  for (const [key, value] of Object.entries(values)) {
    const escaped = escapeHtml(value);
    result = result.replace(
      new RegExp(`(<span[^>]*\\sdata-orbit-field="${escapeRegExp(key)}"[^>]*>)([\\s\\S]*?)(<\\/span>)`),
      `$1${escaped}$3`,
    );
    result = result.replace(
      new RegExp(`(<span[^>]*\\sdata-orbit-label="[^"]*"[^>]*\\sdata-orbit-field="${escapeRegExp(key)}"[^>]*>)([\\s\\S]*?)(<\\/span>)`),
      `$1${escaped}$3`,
    );
  }
  return result;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
