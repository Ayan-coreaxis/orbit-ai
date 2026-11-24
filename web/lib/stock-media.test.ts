import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveStockMedia } from "@/lib/stock-media";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PEXELS_API_KEY;
});

describe("resolveStockMedia", () => {
  it("fills a described photo from the stock library and keeps the description", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results: [{ url: "https://img.example/honey.jpg", width: 1200 }] }))));
    const [out] = await resolveStockMedia(['<img class="sc-hero-img" data-img-query="raw honey jar" alt="Honey">']);
    expect(out).toContain('src="https://img.example/honey.jpg"');
    expect(out).toContain('class="sc-hero-img"');
  });

  it("falls back to a stand-in photo and a video slot when nothing is found", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    const [img, vid] = await resolveStockMedia(['<img data-img-query="x y">', '<video class="sc-v" data-video-query="bees" autoplay muted></video>']);
    expect(img).toMatch(/src="https:\/\/picsum\.photos\/seed\//);
    expect(vid).toBe('<div data-video-slot="bees" class="sc-v"></div>');
  });
});
