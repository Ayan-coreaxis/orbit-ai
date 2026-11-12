import { describe, expect, it } from "vitest";
import { DIRECTIONS, directionPrompt, pickDirection } from "./design-directions";
import { STYLE_OPTIONS, mergeStyle, normalizeStyle, styleCss, styleVars } from "./design-style";
import { ALWAYS_SKILLS, DESIGN_SKILLS, getSkill, skillsForBuilders } from "./design-skills";

const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

describe("art directions", () => {
  it("every direction has a unique id, font pairs and a valid style", () => {
    expect(new Set(DIRECTIONS.map((d) => d.id)).size).toBe(DIRECTIONS.length);
    for (const d of DIRECTIONS) {
      expect(d.fonts.length).toBeGreaterThan(0);
      expect(normalizeStyle(d.style)).toEqual(d.style);
      for (const k of Object.keys(STYLE_OPTIONS) as (keyof typeof STYLE_OPTIONS)[]) {
        expect(STYLE_OPTIONS[k] as readonly string[]).toContain(d.style[k]);
      }
    }
  });

  it("matches the niche", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 40; i++) ids.add(pickDirection("Unstitched lawn suits and bridal wear", "build my store", [], seq(i / 40, 0)).direction.id);
    expect(ids.has("heritage-ornament")).toBe(true);
    expect(ids.has("tech-spec")).toBe(false);
    expect(ids.has("industrial-raw")).toBe(false);
  });

  it("a style word in the brief wins over the niche", () => {
    const p = pickDirection("mobile accessories", "I want a brutalist store", [], seq(0, 0));
    expect(p.direction.id).toBe("neo-brutal");
  });

  it("product words are not style requests", () => {
    for (let i = 0; i < 30; i++) {
      const honey = pickDirection("Pure raw honey, desi ghee and dry fruits", "Build my store. We sell raw honey, desi ghee and dry fruits.", [], seq(i / 30, 0));
      expect(["heritage-ornament", "sport-energy", "industrial-raw", "tech-spec"]).not.toContain(honey.direction.id);
      const volt = pickDirection("Mobile accessories — chargers, power banks", "Build my store. We sell power banks and fast chargers.", [], seq(i / 30, 0));
      expect(["sport-energy", "heritage-ornament", "cottage-floral"]).not.toContain(volt.direction.id);
      const lawn = pickDirection("Unstitched lawn suits and shawls for women", "Build my store for lawn suits.", [], seq(i / 30, 0));
      expect(["dark-cinematic", "sport-energy", "tech-spec"]).not.toContain(lawn.direction.id);
    }
  });

  it("never repeats the direction the store had before", () => {
    for (let i = 0; i < 30; i++) {
      const p = pickDirection("raw honey and dry fruits", "build my store", ["earth-grain", "warm-artisan"], seq(i / 30, 0));
      expect(["earth-grain", "warm-artisan"]).not.toContain(p.direction.id);
    }
  });

  it("gives different niches different looks", () => {
    const a = new Set<string>();
    const b = new Set<string>();
    for (let i = 0; i < 30; i++) {
      a.add(pickDirection("phone chargers and power banks", "build", [], seq(i / 30, 0)).direction.id);
      b.add(pickDirection("florist and cake bakery", "build", [], seq(i / 30, 0)).direction.id);
    }
    expect(a.size).toBeGreaterThan(2);
    expect([...a].filter((x) => b.has(x)).length).toBeLessThan(Math.min(a.size, b.size));
  });

  it("a detailed brief makes the direction a suggestion", () => {
    expect(pickDirection("tea", "use #112233 as the main colour", [], seq(0, 0)).soft).toBe(true);
    const text = directionPrompt(pickDirection("tea", "use #112233 as the main colour", [], seq(0, 0)));
    expect(text).toMatch(/^SUGGESTED/);
    expect(directionPrompt(pickDirection("tea", "build my store", [], seq(0, 0)))).toMatch(/^ASSIGNED/);
  });
});

describe("shape language", () => {
  it("old stores (no style) keep the original card and get no variant rules", () => {
    const css = styleCss("#s", undefined);
    expect(css).toContain("#s .od-pc-media{width:100%;height:var(--od-pc-h,clamp(180px, 22vw, 260px))");
    expect(css).not.toContain("box-shadow:6px 6px 0");
    expect(styleVars(undefined)).toBe("");
  });

  it("drops unknown values and merges partial edits", () => {
    expect(normalizeStyle({ card: "nonsense" })).toBeUndefined();
    const s = normalizeStyle({ card: "brutal", button: "pill" })!;
    expect(s.card).toBe("brutal");
    expect(mergeStyle(s, { button: "sharp" })).toMatchObject({ card: "brutal", button: "sharp" });
  });

  it("each card variant produces different CSS", () => {
    const outs = STYLE_OPTIONS.card.map((card) => styleCss("#s", normalizeStyle({ card, button: "soft" })!));
    expect(new Set(outs).size).toBe(STYLE_OPTIONS.card.length);
  });

  it("emits no unsafe CSS", () => {
    for (const d of DIRECTIONS) {
      const css = styleCss("#s", d.style) + styleVars(d.style);
      expect(css).not.toMatch(/<|url\(|@import|expression/);
    }
  });
});

describe("design skills", () => {
  it("always-on skills exist and reach the builders", () => {
    for (const n of ALWAYS_SKILLS) expect(getSkill(n)).toBeTruthy();
    const text = skillsForBuilders(["typography", "nope"]);
    expect(text).toContain("SKILL: typography");
    expect(text).not.toContain("nope");
    expect(new Set(DESIGN_SKILLS.map((s) => s.name)).size).toBe(DESIGN_SKILLS.length);
  });
});
