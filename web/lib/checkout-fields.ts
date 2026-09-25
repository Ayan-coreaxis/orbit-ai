/**
 * Seller-defined EXTRA checkout fields — on top of the fixed name/phone/email/address set, which
 * stay fixed because real delivery needs them. A seller adds these when they need something the
 * platform doesn't already collect (a gift message, a delivery-instructions note, an "is this a
 * gift?" checkbox, …). Stored on `Business.checkoutCustomFields`; answers land on
 * `Order.customFieldsData`, both as JSON.
 */

export interface CheckoutCustomField {
  key: string; // stable id, also the answer's key in customFieldsData
  label: string; // shown to the shopper
  type: "text" | "textarea" | "checkbox";
  required: boolean;
}

export function parseCheckoutCustomFields(raw: string | null | undefined): CheckoutCustomField[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .filter((f): f is CheckoutCustomField => f && typeof f.key === "string" && typeof f.label === "string")
      .map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type === "textarea" || f.type === "checkbox" ? f.type : "text",
        required: !!f.required,
      }));
  } catch {
    return [];
  }
}

export function parseCustomFieldAnswers(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** Validate + clean shopper-submitted answers against the seller's field config — drops anything not
 *  in the config, enforces required, caps length. Returns an error string, or null if valid. */
export function validateCustomFieldAnswers(
  fields: CheckoutCustomField[],
  answers: Record<string, unknown> | null | undefined,
): { ok: true; clean: Record<string, string> } | { ok: false; error: string } {
  const clean: Record<string, string> = {};
  for (const f of fields) {
    const raw = answers && typeof answers === "object" ? answers[f.key] : undefined;
    const val = f.type === "checkbox" ? (raw ? "yes" : "") : typeof raw === "string" ? raw.trim().slice(0, 500) : "";
    if (f.required && !val) return { ok: false, error: `Please fill in "${f.label}".` };
    if (val) clean[f.key] = val;
  }
  return { ok: true, clean };
}
