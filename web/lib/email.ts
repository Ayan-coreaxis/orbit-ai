export interface EmailSendResult {
  sent: boolean;
  error?: string;
}

export function emailConfigured(): boolean {
  const key = process.env.RESEND_API_KEY;
  return !!key && key !== "paste_your_key_here";
}

/**
 * Sends a real transactional email via Resend's REST API (no SDK dependency — just fetch).
 * Honest like `lib/whatsapp.ts`: if `RESEND_API_KEY` isn't set it does not pretend to send —
 * in dev it logs the message and reports `sent:false`, in production it returns the error.
 */
export async function sendEmail(to: string, subject: string, text: string, html?: string, opts: { fromName?: string } = {}): Promise<EmailSendResult> {
  const key = process.env.RESEND_API_KEY;
  const configured = process.env.EMAIL_FROM || "Orbit <notifications@orbit.store>";
  // A store's own emails show the store's name; the address stays Orbit's verified sending address.
  const address = configured.match(/<([^>]+)>/)?.[1] ?? configured.trim();
  const from = opts.fromName ? `${opts.fromName.replace(/[<>"\r\n]/g, "").slice(0, 60)} <${address}>` : configured;

  const target = (to || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target)) return { sent: false, error: "No valid email address." };

  if (!key || key === "paste_your_key_here") {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[email] (not sent — RESEND_API_KEY unset) to=${target}\n  subject: ${subject}\n  ${text}`);
      return { sent: false, error: "Email isn't connected yet (RESEND_API_KEY)." };
    }
    return { sent: false, error: "Email isn't connected yet (RESEND_API_KEY)." };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [target], subject, text, ...(html ? { html } : {}) }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { sent: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: String(e).slice(0, 200) };
  }
}
