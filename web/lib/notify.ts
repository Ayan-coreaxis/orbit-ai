import { sendWhatsAppMessage, type WhatsAppSendResult } from "@/lib/whatsapp";
import { sendEmail, type EmailSendResult } from "@/lib/email";

/**
 * One place that talks to the shopper — order updates go out over WhatsApp AND email (whichever
 * channels are configured + whichever contact details we have). Every send is honest: if a
 * channel isn't connected it reports `sent:false` with a reason, it never pretends.
 */

export type NotifyTemplate =
  | "order_placed"
  | "order_confirmed"
  | "order_shipped"
  | "review_request"
  | "verify_order"
  | "back_in_stock";

export interface NotifyVars {
  storeName: string;
  firstName?: string;
  orderNumber: string; // short, e.g. "A1B2C3"
  total?: string; // already money-formatted
  courierName?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  statusUrl?: string; // absolute link to the order status page
  reviewUrl?: string; // absolute link to the review form
  verifyUrl?: string; // absolute link to the "confirm your order" page
  productName?: string; // for back_in_stock
  productUrl?: string;
}

interface Built {
  subject: string;
  text: string;
}

function build(template: NotifyTemplate, v: NotifyVars): Built {
  const hi = v.firstName ? `Hi ${v.firstName}, ` : "Hi, ";
  switch (template) {
    case "order_placed":
      return {
        subject: `${v.storeName} — order #${v.orderNumber} received`,
        text:
          `${hi}thanks for your order at ${v.storeName}.\n` +
          `Order #${v.orderNumber}${v.total ? ` · ${v.total}` : ""}.\n` +
          `We'll message you again as soon as it's confirmed.` +
          (v.statusUrl ? `\nTrack it: ${v.statusUrl}` : ""),
      };
    case "order_confirmed":
      return {
        subject: `${v.storeName} — order #${v.orderNumber} confirmed`,
        text:
          `${hi}your order #${v.orderNumber} at ${v.storeName} is confirmed and being prepared.` +
          (v.statusUrl ? `\nTrack it: ${v.statusUrl}` : ""),
      };
    case "order_shipped":
      return {
        subject: `${v.storeName} — order #${v.orderNumber} shipped`,
        text:
          `${hi}your order #${v.orderNumber} is on the way!` +
          (v.courierName ? `\nCourier: ${v.courierName}` : "") +
          (v.trackingNumber ? `\nTracking #: ${v.trackingNumber}` : "") +
          (v.trackingUrl ? `\nTrack: ${v.trackingUrl}` : v.statusUrl ? `\nTrack: ${v.statusUrl}` : ""),
      };
    case "review_request":
      return {
        subject: `${v.storeName} — how was your order?`,
        text:
          `${hi}your order #${v.orderNumber} from ${v.storeName} should have arrived.\n` +
          `We'd love a quick review:` +
          (v.reviewUrl ? ` ${v.reviewUrl}` : ""),
      };
    case "verify_order":
      return {
        subject: `${v.storeName} — confirm order #${v.orderNumber}`,
        text:
          `${hi}please confirm your cash-on-delivery order #${v.orderNumber}${v.total ? ` (${v.total})` : ""} at ${v.storeName}.\n` +
          (v.verifyUrl ? `Confirm here: ${v.verifyUrl}\n` : "") +
          `Or just reply YES to this message. Unconfirmed orders are cancelled after 48 hours.`,
      };
    case "back_in_stock":
      return {
        subject: `${v.storeName} — ${v.productName ?? "an item"} is back in stock`,
        text:
          `${hi}${v.productName ?? "the item you wanted"} is back in stock at ${v.storeName}.` +
          (v.productUrl ? `\n${v.productUrl}` : ""),
      };
  }
}

export interface NotifyResult {
  whatsapp?: WhatsAppSendResult;
  email?: EmailSendResult;
  /** true if the message went out on at least one channel */
  anySent: boolean;
  /** a short honest error when nothing sent */
  error?: string;
}

export async function notifyCustomer(
  contact: { phone?: string | null; email?: string | null; whatsappFrom?: string | null }, // whatsappFrom: the seller's own WhatsApp number, if assigned
  template: NotifyTemplate,
  vars: NotifyVars,
): Promise<NotifyResult> {
  const { subject, text } = build(template, vars);
  const out: NotifyResult = { anySent: false };

  if (contact.phone) out.whatsapp = await sendWhatsAppMessage(contact.phone, text, { from: contact.whatsappFrom ?? undefined });
  if (contact.email) out.email = await sendEmail(contact.email, subject, text);

  out.anySent = !!(out.whatsapp?.sent || out.email?.sent);
  if (!out.anySent) {
    out.error =
      out.whatsapp?.error ||
      out.email?.error ||
      (contact.phone || contact.email ? "No channel is connected." : "No phone or email on file.");
  }
  return out;
}

/** Ping the seller — plain text to their WhatsApp number and/or account email. Best effort. */
export async function notifySeller(
  contact: { phone?: string | null; email?: string | null },
  subject: string,
  text: string,
): Promise<NotifyResult> {
  const out: NotifyResult = { anySent: false };
  if (contact.phone) out.whatsapp = await sendWhatsAppMessage(contact.phone, `${subject}\n${text}`);
  if (contact.email) out.email = await sendEmail(contact.email, subject, text);
  out.anySent = !!(out.whatsapp?.sent || out.email?.sent);
  return out;
}
