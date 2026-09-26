import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHOICES, FORMATS, cleanInput, getFormat, missingNeeds } from "@/lib/studio/formats";
import { checkVideo, generateImage, submitVideo } from "@/lib/studio/providers";
import { blockedReason, type StudioStatus } from "@/lib/studio/config";
import { safeUrl } from "@/lib/studio/refs";

describe("studio formats", () => {
  it("every format is complete and ids are unique", () => {
    const ids = new Set<string>();
    for (const f of FORMATS) {
      expect(ids.has(f.id)).toBe(false);
      ids.add(f.id);
      expect(f.look.length).toBeGreaterThan(0);
      expect(f.aspects.length).toBeGreaterThan(0);
      if (f.kind === "video") {
        expect(f.seconds).toBeGreaterThanOrEqual(4);
        expect(f.seconds).toBeLessThanOrEqual(15);
        expect(f.audio).toBeTruthy();
      }
      for (const n of f.needs) if (n.type === "choice") expect(CHOICES[n.options].length).toBeGreaterThan(1);
    }
  });

  it("lists what's missing in plain words", () => {
    const f = getFormat("sale-poster")!;
    expect(missingNeeds(f, {})).toEqual(["Fill in: the offer"]);
    expect(missingNeeds(f, { text: { offer: "30% OFF" } })).toEqual([]);
    const reel = getFormat("product-reel")!;
    expect(missingNeeds(reel, {})).toEqual(["Pick the product"]);
  });

  it("asks for consent only when a real person's photo is added", () => {
    const f = getFormat("ugc-review")!;
    expect(missingNeeds(f, { productId: "p1" })).toEqual([]);
    expect(missingNeeds(f, { productId: "p1", media: { person: ["m1"] } })).toContain("Confirm you may use this person's face");
    expect(missingNeeds(f, { productId: "p1", media: { person: ["m1"] }, consent: true })).toEqual([]);
  });

  it("cleanInput drops unknown keys, bad choices and extra photos", () => {
    const f = getFormat("product-reel")!;
    const clean = cleanInput(f, {
      productId: " p1 ",
      media: { photos: ["a", "b", "c", "d", 5], person: ["x"] },
      text: { note: "  eid theme ", hack: "x" },
      choice: { camera: "orbit", mood: "not-a-mood" },
      aspect: "4:5",
    });
    expect(clean.productId).toBe("p1");
    expect(clean.media).toEqual({ photos: ["a", "b", "c"] });
    expect(clean.text).toEqual({ note: "eid theme" });
    expect(clean.choice).toEqual({ camera: "orbit" });
    expect(clean.aspect).toBeUndefined(); // reels don't do 4:5
  });
});

describe("blockedReason", () => {
  const base: StudioStatus = {
    plan: "growth",
    allowed: true,
    enabled: true,
    imageReady: true,
    videoReady: true,
    limit: { images: 50, videos: 5 },
    used: { images: 0, videos: 0 },
    left: { images: 50, videos: 5 },
    resetsOn: new Date().toISOString(),
  };
  it("allows, then explains every block", () => {
    expect(blockedReason(base, "video")).toBeNull();
    expect(blockedReason({ ...base, allowed: false, plan: "starter" }, "image")).toMatch(/Growth/);
    expect(blockedReason({ ...base, videoReady: false }, "video")).toMatch(/video model key/);
    expect(blockedReason({ ...base, left: { images: 0, videos: 5 } }, "image")).toMatch(/used up/);
  });
});

describe("providers", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "g-key";
    process.env.SEEDANCE_API_KEY = "s-key";
    process.env.STUDIO_VIDEO_MODEL = "seedance-test";
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("sends references + prompt to the image model and returns the picture", async () => {
    const png = Buffer.from("fake-png");
    const f = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.contents[0].parts[0].inline_data.mime_type).toBe("image/jpeg");
      expect(body.contents[0].parts.at(-1).text).toBe("a mango");
      expect(body.generationConfig.imageConfig.aspectRatio).toBe("4:5");
      expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("g-key");
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: png.toString("base64") } }] } }] }));
    });
    const out = await generateImage({ prompt: "a mango", refs: [{ mime: "image/jpeg", data: Buffer.from("x") }], aspect: "4:5" }, f as unknown as typeof fetch);
    expect(out.data.toString()).toBe("fake-png");
    expect(String(f.mock.calls[0][0])).toContain("/models/gemini-3.1-flash-image-preview:generateContent");
  });

  it("turns a safety block into a readable error", async () => {
    const f = async () => new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }));
    await expect(generateImage({ prompt: "x", aspect: "1:1" }, f as unknown as typeof fetch)).rejects.toThrow(/safety/);
  });

  it("explains a rejected key", async () => {
    const f = async () => new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 403 });
    await expect(generateImage({ prompt: "x", aspect: "1:1" }, f as unknown as typeof fetch)).rejects.toThrow(/rejected/);
  });

  it("starts a video task with the first frame and settings", async () => {
    const f = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("seedance-test");
      expect(body.content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
      expect(body.duration).toBe(10);
      expect(body.ratio).toBe("9:16");
      expect(body.generate_audio).toBe(true);
      return new Response(JSON.stringify({ id: "task-1" }));
    });
    const id = await submitVideo({ prompt: "orbit", firstFrame: { mime: "image/jpeg", data: Buffer.from("f") }, seconds: 10, aspect: "9:16", audio: true }, f as unknown as typeof fetch);
    expect(id).toBe("task-1");
    expect(String(f.mock.calls[0][0])).toMatch(/\/contents\/generations\/tasks$/);
  });

  it("reads video task states", async () => {
    const at = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    expect(await checkVideo("t", at({ status: "running" }))).toEqual({ state: "working" });
    expect(await checkVideo("t", at({ status: "succeeded", content: { video_url: "https://v/x.mp4" } }))).toEqual({ state: "done", url: "https://v/x.mp4" });
    expect((await checkVideo("t", at({ status: "failed", error: { message: "input sensitive content" } }))).state).toBe("failed");
    expect(await checkVideo("t", at({}, 503))).toEqual({ state: "working" });
  });
});

describe("safeUrl", () => {
  it("allows our files and public https images, blocks internal addresses", () => {
    for (const ok of ["/uploads/b/media/x.webp", "https://cdn.shopify.com/a.jpg", "https://fcdn.example.com/a.jpg", "https://pub-1.r2.dev/u/x.webp"]) expect(safeUrl(ok)).toBe(true);
    for (const bad of ["http://cdn.shopify.com/a.jpg", "https://127.0.0.1/a", "https://localhost/a", "https://[::1]/a", "https://[fd00::1]/a", "https://10.0.0.5/a", "https://172.20.1.1/a", "https://169.254.169.254/latest", "https://db.internal/a", "file:///etc/passwd"]) expect(safeUrl(bad)).toBe(false);
  });
});
