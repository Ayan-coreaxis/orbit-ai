import { describe, expect, it } from "vitest";
import { liftOrphanVarRules, undefinedClasses } from "@/lib/site-craft-build";
import { storeCss } from "@/lib/orbit-design";

describe("site-craft builder helpers", () => {
  it("moves custom properties off an imagined wrapper class onto :root", () => {
    const css = ".sc-root{--sc-step-5:4rem}\n.sc-h1{font-size:var(--sc-step-5)}\n.sc-dark{--sc-fg:#fff;color:var(--sc-fg)}";
    const html = '<section class="sc-dark"><h1 class="sc-h1">Hi</h1></section>';
    const out = liftOrphanVarRules(css, html);
    expect(out).toContain(":root{--sc-step-5:4rem}");
    expect(out).toContain(".sc-dark{--sc-fg:#fff"); // used class keeps its own scope
  });

  it("lists sc- classes the stylesheet never defines", () => {
    expect(undefinedClasses('<div class="sc-a sc-b other"></div>', ".sc-a{color:red}")).toEqual(["sc-b"]);
  });

  it("keeps the stylesheet inside its <style> and drops unsafe urls", () => {
    const out = storeCss("a{color:red}</style><script>x</script>@import url(http://x.com/a.css);b{background:url(javascript:alert(1))}c{background:url('https://img.example/a.png')}");
    expect(out).not.toMatch(/<\/style/i);
    expect(out).not.toMatch(/@import/i);
    expect(out).not.toMatch(/javascript/i);
    expect(out).toContain("https://img.example/a.png");
  });
});
