import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanVar, contentVariables, templateSid } from "@/lib/whatsapp-templates";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

const SID = "HX" + "a".repeat(32);

describe("WhatsApp templates", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("cleans variables WhatsApp would reject", () => {
    expect(cleanVar("")).toBe("-");
    expect(cleanVar(null)).toBe("-");
    expect(cleanVar("a\nb\t c      d")).toBe("a b  c   d");
    expect(JSON.parse(contentVariables(["Ali", "", "X"]))).toEqual({ "1": "Ali", "2": "-", "3": "X" });
  });

  it("only accepts real Content SIDs", () => {
    vi.stubEnv("TWILIO_TEMPLATE_OTP", "not-a-sid");
    expect(templateSid("otp")).toBeNull();
    vi.stubEnv("TWILIO_TEMPLATE_OTP", SID);
    expect(templateSid("otp")).toBe(SID);
  });

  it("sends the template when set, plain text otherwise", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC1");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "tok");
    vi.stubEnv("TWILIO_WHATSAPP_FROM", "+10000000000");
    const bodies: URLSearchParams[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: RequestInit) => {
        bodies.push(new URLSearchParams(String(init.body)));
        return new Response(JSON.stringify({ sid: "SM1", status: "queued" }), { status: 201 });
      }),
    );
    vi.stubEnv("TWILIO_TEMPLATE_OTP", "");
    await sendWhatsAppMessage("+923001234567", "code 123456", { template: { kind: "otp", vars: ["123456"] } });
    expect(bodies[0].get("Body")).toBe("code 123456");
    expect(bodies[0].get("ContentSid")).toBeNull();

    vi.stubEnv("TWILIO_TEMPLATE_OTP", SID);
    const r = await sendWhatsAppMessage("+923001234567", "code 123456", { template: { kind: "otp", vars: ["123456"] } });
    expect(r.sent).toBe(true);
    expect(bodies[1].get("Body")).toBeNull();
    expect(bodies[1].get("ContentSid")).toBe(SID);
    expect(JSON.parse(bodies[1].get("ContentVariables")!)).toEqual({ "1": "123456" });
  });
});
