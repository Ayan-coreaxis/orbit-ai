import { describe, expect, it } from "vitest";
import { cleanAnswers, FALLBACK_QUESTIONS, generateOnboardingQuestions, sellerAnswersBlock } from "@/lib/onboarding-questions";

describe("onboarding questions", () => {
  it("falls back to the fixed set without an AI key", async () => {
    const old = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const r = await generateOnboardingQuestions({ name: "Noor", niche: "lawn suits" });
    expect(r).toEqual({ questions: FALLBACK_QUESTIONS, ai: false });
    process.env.ANTHROPIC_API_KEY = old;
  });

  it("keeps only real answers and builds the prompt block", () => {
    const a = cleanAnswers([{ question: "Q1", answer: " Eid " }, { question: "Q2", answer: "" }, { nope: 1 }, "x"]);
    expect(a).toEqual([{ question: "Q1", answer: "Eid" }]);
    expect(sellerAnswersBlock(JSON.stringify(a))).toContain("- Q1 → Eid");
    expect(sellerAnswersBlock(null)).toBe("");
    expect(sellerAnswersBlock("not json")).toBe("");
  });
});
