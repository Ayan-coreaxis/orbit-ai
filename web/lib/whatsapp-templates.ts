/**
 * WhatsApp only delivers free-form text within 24 hours of the customer's last message. Anything
 * Orbit sends first (order updates, cart reminders, codes) needs a Meta-approved template.
 * The Super Admin creates each template once in Twilio > Content Template Builder, with the exact
 * variables listed here ({{1}}, {{2}} … in this order), then pastes its Content SID (HX…) into
 * Super Admin > WhatsApp. When a SID is saved Orbit sends the template; without one it falls back
 * to plain text (fine in the sandbox and inside the 24-hour window).
 */

export type WaTemplateKind =
  | "order_placed"
  | "order_confirmed"
  | "order_shipped"
  | "verify_order"
  | "review_request"
  | "back_in_stock"
  | "cart_recovery"
  | "otp"
  | "owner_alert";

export interface WaTemplateDef {
  kind: WaTemplateKind;
  label: string;
  env: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  /** Variable names, in {{1}}, {{2}} … order. */
  vars: string[];
  /** Suggested body to submit for approval. */
  sample: string;
}

export const WA_TEMPLATES: WaTemplateDef[] = [
  {
    kind: "order_placed",
    label: "Order received",
    env: "TWILIO_TEMPLATE_ORDER_PLACED",
    category: "UTILITY",
    vars: ["customer name", "store name", "order number", "order link"],
    sample: "Hi {{1}}, thanks for your order at {{2}}. Order #{{3}} is received — we'll message you again once it's confirmed. Track it: {{4}}",
  },
  {
    kind: "order_confirmed",
    label: "Order confirmed",
    env: "TWILIO_TEMPLATE_ORDER_CONFIRMED",
    category: "UTILITY",
    vars: ["customer name", "store name", "order number", "order link"],
    sample: "Hi {{1}}, your order #{{3}} at {{2}} is confirmed and being prepared. Track it: {{4}}",
  },
  {
    kind: "order_shipped",
    label: "Order shipped",
    env: "TWILIO_TEMPLATE_ORDER_SHIPPED",
    category: "UTILITY",
    vars: ["customer name", "store name", "order number", "courier and tracking number", "tracking link"],
    sample: "Hi {{1}}, your order #{{3}} from {{2}} is on the way! {{4}}. Track it: {{5}}",
  },
  {
    kind: "verify_order",
    label: "Confirm cash-on-delivery order",
    env: "TWILIO_TEMPLATE_VERIFY_ORDER",
    category: "UTILITY",
    vars: ["customer name", "store name", "order number", "order total", "confirm link"],
    sample: "Hi {{1}}, please confirm your cash-on-delivery order #{{3}} ({{4}}) at {{2}}. Confirm here: {{5}} — or reply YES. Unconfirmed orders are cancelled after 48 hours.",
  },
  {
    kind: "review_request",
    label: "Review request",
    env: "TWILIO_TEMPLATE_REVIEW_REQUEST",
    category: "MARKETING",
    vars: ["customer name", "store name", "what they ordered", "review link"],
    sample: "Hi {{1}}, your order from {{2}} ({{3}}) has been delivered. We'd really appreciate a quick review: {{4}}",
  },
  {
    kind: "back_in_stock",
    label: "Back in stock",
    env: "TWILIO_TEMPLATE_BACK_IN_STOCK",
    category: "MARKETING",
    vars: ["customer name", "store name", "product name", "product link"],
    sample: "Hi {{1}}, {{3}} is back in stock at {{2}}. Get it here: {{4}}",
  },
  {
    kind: "cart_recovery",
    label: "Abandoned cart reminder",
    env: "TWILIO_TEMPLATE_CART_RECOVERY",
    category: "MARKETING",
    vars: ["store name", "items in the cart", "cart total", "cart link"],
    sample: "Hi! You left {{2}} in your cart at {{1}} ({{3}}). Complete your order here: {{4}} — or just reply to this message.",
  },
  {
    kind: "otp",
    label: "Login code",
    env: "TWILIO_TEMPLATE_OTP",
    category: "AUTHENTICATION",
    vars: ["code"],
    sample: "{{1}} is your verification code. It expires in 10 minutes.",
  },
  {
    kind: "owner_alert",
    label: "Seller alert (to the store owner)",
    env: "TWILIO_TEMPLATE_OWNER_ALERT",
    category: "UTILITY",
    vars: ["title", "details"],
    sample: "Orbit update — {{1}}: {{2}}",
  },
];

export function templateDef(kind: WaTemplateKind): WaTemplateDef {
  return WA_TEMPLATES.find((t) => t.kind === kind)!;
}

export function templateSid(kind: WaTemplateKind): string | null {
  const v = process.env[templateDef(kind).env]?.trim();
  return v && /^HX[0-9a-f]{32}$/i.test(v) ? v : null;
}

/**
 * WhatsApp rejects template variables that are empty, contain new lines/tabs, or have more than
 * four spaces in a row, and caps their length — clean them so a send never fails on formatting.
 */
export function cleanVar(v: string | null | undefined): string {
  const s = (v ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim().slice(0, 900);
  return s || "-";
}

/** { "1": "...", "2": "..." } as Twilio's ContentVariables expects. */
export function contentVariables(values: (string | null | undefined)[]): string {
  return JSON.stringify(Object.fromEntries(values.map((v, i) => [String(i + 1), cleanVar(v)])));
}
