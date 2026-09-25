const TWILIO_API = "https://api.twilio.com/2010-04-01/Accounts";

export interface WhatsAppSendResult {
  sent: boolean;
  error?: string;
}

function normalizeWhatsAppNumber(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  const withPlus = digits.startsWith("+") ? digits : `+${digits}`;
  return `whatsapp:${withPlus}`;
}

/**
 * Sends a real WhatsApp message via Twilio. Returns honestly whether it actually
 * sent — never pretend a message went out if Twilio isn't connected or the call failed.
 */
export async function sendWhatsAppMessage(toRaw: string, body: string): Promise<WhatsAppSendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;

  if (!sid || !token || !from || sid === "paste_your_key_here" || token === "paste_your_key_here") {
    return {
      sent: false,
      error: "Twilio isn't connected yet — add Account SID, Auth Token, and WhatsApp sender in Admin > API Keys.",
    };
  }

  const to = normalizeWhatsAppNumber(toRaw);
  const fromNumber = from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const params = new URLSearchParams({ To: to, From: fromNumber, Body: body });

  try {
    const res = await fetch(`${TWILIO_API}/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { sent: false, error: `Twilio error ${res.status}: ${errText.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "Unknown error sending WhatsApp message" };
  }
}
