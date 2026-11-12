import { describe, expect, it } from "vitest";
import {
  WA_MAX,
  briefingTemplateVars,
  clampForWhatsApp,
  formatApplied,
  formatBriefingMessage,
  formatOwnerReply,
  isOwnerNumber,
  ownerNumberKey,
  parseOwnerCommand,
  proposalFitsWhatsApp,
  toWhatsAppText,
  withinReplyWindow,
} from "./whatsapp-boss";
import { cleanVar, templateDef } from "./whatsapp-templates";
import type { BriefingTask } from "./daily-briefing";

const task = (i: number, over: Partial<BriefingTask> = {}): BriefingTask => ({
  id: `t${i}`,
  kind: "orders",
  impact: 90 - i,
  title: `Confirm ${i} orders waiting since yesterday`,
  why: "Rs 12,500 of cash-on-delivery orders are unconfirmed for over 12 hours. COD buyers cancel or refuse when nobody confirms quickly.",
  prompt: `Do task ${i}`,
  state: "open",
  ...over,
});

const DASH = "https://orbit.example/dashboard/orchestrator";

describe("owner number", () => {
  it("reads every Pakistani spelling as the same number", () => {
    for (const s of ["03001234567", "0300 1234567", "0300-1234567", "+923001234567", "+92 300 1234567", "923001234567", "00923001234567", "3001234567", "whatsapp:+923001234567", "+92 0300 1234567"])
      expect(ownerNumberKey(s), s).toBe("+923001234567");
  });

  it("keeps other countries' numbers and refuses incomplete ones", () => {
    expect(ownerNumberKey("whatsapp:+14155238886")).toBe("+14155238886");
    expect(ownerNumberKey("+44 7700 900123")).toBe("+447700900123");
    expect(ownerNumberKey("")).toBeNull();
    expect(ownerNumberKey(null)).toBeNull();
    expect(ownerNumberKey("0300123456")).toBeNull(); // one digit short
    expect(ownerNumberKey("030012345678")).toBeNull(); // one too many
    expect(ownerNumberKey("042 35761234")).toBeNull(); // landline, no country code
    expect(ownerNumberKey("12345")).toBeNull();
  });

  it("matches the owner strictly", () => {
    expect(isOwnerNumber("whatsapp:+923001234567", "0300 1234567")).toBe(true);
    expect(isOwnerNumber("whatsapp:+923001234567", "+92-300-1234567")).toBe(true);
    expect(isOwnerNumber("whatsapp:+923001234568", "0300 1234567")).toBe(false); // a shopper
    expect(isOwnerNumber("whatsapp:+923001234567", null)).toBe(false);
    expect(isOwnerNumber("whatsapp:+923001234567", "")).toBe(false);
    expect(isOwnerNumber("", "")).toBe(false);
    // a number that only shares the ending is not the owner
    expect(isOwnerNumber("whatsapp:+13001234567", "0300 1234567")).toBe(false);
    expect(isOwnerNumber("whatsapp:+9230012345670", "0300 1234567")).toBe(false);
  });
});

describe("owner commands", () => {
  it("reads task numbers", () => {
    expect(parseOwnerCommand("1")).toEqual({ type: "task", n: 1 });
    expect(parseOwnerCommand(" 2. ")).toEqual({ type: "task", n: 2 });
    expect(parseOwnerCommand("#3")).toEqual({ type: "task", n: 3 });
    expect(parseOwnerCommand("task 4")).toEqual({ type: "task", n: 4 });
    expect(parseOwnerCommand("0")).toEqual({ type: "chat" });
    expect(parseOwnerCommand("2 products ka stock 50 kar do")).toEqual({ type: "chat" });
    expect(parseOwnerCommand("1500")).toEqual({ type: "chat" });
  });

  it("reads apply in English and Roman Urdu", () => {
    expect(parseOwnerCommand("APPLY")).toEqual({ type: "apply", explicit: true });
    expect(parseOwnerCommand("Apply kar do!")).toEqual({ type: "apply", explicit: true });
    for (const s of ["yes", "Yes.", "YES 👍", "haan", "Haan ji", "han", "ji haan", "kar do", "kardo", "Kar do.", "haan kar do", "bilkul"])
      expect(parseOwnerCommand(s), s).toEqual({ type: "apply", explicit: false });
  });

  it("reads no in English and Roman Urdu", () => {
    for (const s of ["NO", "no.", "nahi", "Nahin", "nai", "nhi", "mat karo", "rehne do", "cancel", "drop it"]) expect(parseOwnerCommand(s), s).toEqual({ type: "dismiss" });
  });

  it("reads stop and start", () => {
    expect(parseOwnerCommand("STOP")).toEqual({ type: "stop" });
    expect(parseOwnerCommand("stop.")).toEqual({ type: "stop" });
    expect(parseOwnerCommand("band karo")).toEqual({ type: "stop" });
    expect(parseOwnerCommand("Start")).toEqual({ type: "start" });
  });

  it("never mistakes a sentence for a command", () => {
    for (const s of [
      "",
      "yes but make it 10% instead",
      "nahi, pehle price batao",
      "apply the discount to all products",
      "stop the Eid ad",
      "start a sale for Black Friday",
      "ok",
      "theek hai",
      "haan lekin kal",
      "kar do stock 60",
    ])
      expect(parseOwnerCommand(s), s).toEqual({ type: "chat" });
  });
});

describe("24-hour window", () => {
  const now = new Date("2026-11-12T09:00:00Z");
  it("is open only within 24 hours of the owner's last message", () => {
    expect(withinReplyWindow(new Date("2026-11-12T08:00:00Z"), now)).toBe(true);
    expect(withinReplyWindow(new Date("2026-11-11T09:30:00Z"), now)).toBe(true);
    expect(withinReplyWindow(new Date("2026-11-11T09:00:00Z"), now)).toBe(false);
    expect(withinReplyWindow(new Date("2026-11-10T09:00:00Z"), now)).toBe(false);
    expect(withinReplyWindow(null, now)).toBe(false);
  });
});

describe("briefing message", () => {
  it("has a greeting, numbered tasks with one line each, and how to reply", () => {
    const msg = formatBriefingMessage([task(1), task(2), task(3)], "en", "Noor Skincare");
    expect(msg).toContain("Good morning! Orbit checked Noor Skincare — 3 things worth doing today:");
    expect(msg).toContain("1. *Confirm 1 orders waiting since yesterday*\nRs 12,500");
    expect(msg).toContain("3. *Confirm 3 orders");
    expect(msg).toContain("Reply 1, 2… and I'll prepare it. Reply STOP to turn these off.");
    expect(msg.length).toBeLessThanOrEqual(WA_MAX);
  });

  it("is written in Roman Urdu for a Roman Urdu owner", () => {
    const msg = formatBriefingMessage([task(1, { title: "2 orders kal se intezar mein", why: "Jaldi confirm karein." })], "ur", "Noor");
    expect(msg).toContain("Subah bakhair! Orbit ne Noor check kiya — aaj 1 kaam karne layak hain:");
    expect(msg).toContain("Band karne ke liye STOP bhejein.");
  });

  it("stays under the limit and keeps every task number and the footer when tasks are long", () => {
    const long = Array.from({ length: 5 }, (_, i) => task(i + 1, { title: "A very long task title ".repeat(8), why: "Because of many reasons. ".repeat(30) }));
    const msg = formatBriefingMessage(long, "en", "Store");
    expect(msg.length).toBeLessThanOrEqual(WA_MAX);
    for (let i = 1; i <= 5; i++) expect(msg).toContain(`\n${i}. *`);
    expect(msg).toContain("Reply STOP");
  });

  it("says so when nothing needs doing", () => {
    expect(formatBriefingMessage([], "en", "Noor")).toContain("nothing needs you today");
  });

  it("builds template variables WhatsApp accepts", () => {
    const tasks = Array.from({ length: 5 }, (_, i) => task(i + 1, { why: "Because of many reasons. ".repeat(30) }));
    const vars = briefingTemplateVars(tasks, "en", "Noor Skincare");
    expect(vars).toHaveLength(templateDef("daily_briefing").vars.length);
    expect(vars).toHaveLength(templateDef("daily_briefing_ur").vars.length);
    expect(vars[0]).toBe("Noor Skincare");
    expect(vars[1]).toBe("5");
    expect(vars[2]).toMatch(/^1\) /);
    expect(vars[2]).toContain("5) ");
    for (const v of vars) {
      expect(v).not.toMatch(/[\r\n\t]/);
      expect(cleanVar(v)).toBe(v); // nothing left for the cleaner to change
    }
  });
});

describe("replies", () => {
  it("turns chat bold into WhatsApp bold", () => {
    expect(toWhatsAppText("Price **Rs 1,500** hai.\n\n\n- ek\n- do")).toBe("Price *Rs 1,500* hai.\n\n- ek\n- do");
  });

  it("leaves a short answer alone and links to the dashboard for a long one", () => {
    expect(clampForWhatsApp("Short answer.", "en", DASH)).toBe("Short answer.");
    const long = clampForWhatsApp("word ".repeat(600), "en", DASH);
    expect(long.length).toBeLessThanOrEqual(WA_MAX);
    expect(long.endsWith(`Full reply in your dashboard: ${DASH}`)).toBe(true);
    expect(clampForWhatsApp("lafz ".repeat(600), "ur", DASH)).toContain("Poora jawab dashboard mein");
  });

  it("shows a proposal in full with how to approve it", () => {
    const out = formatOwnerReply("I've proposed the new price.", { lang: "en", dashboardUrl: DASH, proposal: ["Lawn Suit: price Rs 2,500 → Rs 2,200", "Delivery fee → Rs 150"] });
    expect(out.offersApply).toBe(true);
    expect(out.text).toContain("I've proposed the new price.");
    expect(out.text).toContain("- Lawn Suit: price Rs 2,500 → Rs 2,200\n- Delivery fee → Rs 150");
    expect(out.text.endsWith("Reply APPLY to make this change, or NO to drop it.")).toBe(true);
  });

  it("shortens the answer, never the change being approved", () => {
    const proposal = ["Lawn Suit: price Rs 2,500 → Rs 2,200", "Delivery fee → Rs 150"];
    const out = formatOwnerReply("Long explanation. ".repeat(200), { lang: "ur", dashboardUrl: DASH, proposal });
    expect(out.text.length).toBeLessThanOrEqual(WA_MAX);
    for (const l of proposal) expect(out.text).toContain(`- ${l}`);
    expect(out.text).toContain("APPLY bhejein");
    expect(out.offersApply).toBe(true);
  });

  it("sends a proposal too big to show to the dashboard instead of offering APPLY", () => {
    const many = Array.from({ length: 12 }, (_, i) => `Product ${i}: price change`);
    expect(proposalFitsWhatsApp(many)).toBe(false);
    expect(proposalFitsWhatsApp(["x".repeat(900)])).toBe(false);
    expect(proposalFitsWhatsApp([])).toBe(false);
    const out = formatOwnerReply("Here is the plan.", { lang: "en", dashboardUrl: DASH, proposal: many });
    expect(out.offersApply).toBe(false);
    expect(out.text).not.toContain("Reply APPLY");
    expect(out.text).toContain(DASH);
    expect(out.text.length).toBeLessThanOrEqual(WA_MAX);
  });

  it("has no APPLY line when there is no proposal", () => {
    const out = formatOwnerReply("You sold **12** orders this week.", { lang: "en", dashboardUrl: DASH });
    expect(out).toEqual({ text: "You sold *12* orders this week.", offersApply: false });
  });

  it("reports what changed after APPLY", () => {
    expect(formatApplied(["Delivery fee → Rs 150"], "en", DASH)).toBe("Done — applied:\n- Delivery fee → Rs 150");
    expect(formatApplied([], "ur", DASH)).toBe("Ho gaya — apply kar diya.");
    expect(formatApplied(Array.from({ length: 80 }, (_, i) => `Change number ${i} was applied to the store`), "en", DASH).length).toBeLessThanOrEqual(WA_MAX);
  });
});
