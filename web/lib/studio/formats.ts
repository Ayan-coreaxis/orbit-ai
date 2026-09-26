/**
 * Orbit Studio's catalog — every kind of image and video a seller can ask for, as data.
 * Each format says what it makes (`look` — shown to the seller before anything is spent), what
 * material it needs from them (`needs`), and how the pipeline runs it (keyframe → video, etc.).
 * The director (lib/studio/director.ts) turns a format + the seller's material into real prompts.
 * Shared by the server and the Content page, so it must stay free of server-only imports.
 */

export type StudioKind = "image" | "video";
export type Aspect = "1:1" | "4:5" | "9:16" | "16:9";

export type FormatGroup = "product" | "social" | "edit" | "people" | "reel" | "ugc" | "ad";

export const GROUPS: Record<FormatGroup, { label: string; kind: StudioKind }> = {
  product: { label: "Product photos", kind: "image" },
  social: { label: "Posts, banners & offers", kind: "image" },
  edit: { label: "Fix a photo", kind: "image" },
  people: { label: "Models & try-on", kind: "image" },
  reel: { label: "Product reels", kind: "video" },
  ugc: { label: "People talking (UGC)", kind: "video" },
  ad: { label: "Ads & cinematic", kind: "video" },
};

export type Need =
  | { key: "product"; type: "product"; label: string; hint: string; required: boolean }
  | { key: string; type: "photos"; label: string; hint: string; required: boolean; max: number }
  | { key: string; type: "text"; label: string; hint: string; required: boolean; placeholder?: string; long?: boolean }
  | { key: string; type: "choice"; label: string; hint: string; required: boolean; options: "camera" | "style" | "avatar" | "language" | "mood" }
  | { key: "consent"; type: "consent"; label: string; hint: string; required: true };

export type StudioFormat = {
  id: string;
  kind: StudioKind;
  group: FormatGroup;
  name: string;
  tagline: string;
  /** What the seller will get — the director's promise, in plain words, before spending anything. */
  look: string[];
  needs: Need[];
  aspects: Aspect[];
  /** video only */
  seconds?: number;
  audio?: "voice" | "music"; // voice = someone speaks; music = sound/music only
  /** video only: first make a still frame with the image model from the real product photo, then animate it. */
  keyframe?: boolean;
  /** image only: the seller's photo is edited rather than a new scene imagined. */
  edit?: boolean;
  tip?: string;
};

const PRODUCT: Need = { key: "product", type: "product", label: "Product", hint: "Pick the product from your store — its real photo keeps the result accurate.", required: true };
const PRODUCT_OPTIONAL: Need = { ...PRODUCT, required: false, hint: "Optional — pick a product to feature." };
const extraPhotos = (label = "More photos of it", max = 3): Need => ({
  key: "photos",
  type: "photos",
  label,
  hint: "Other angles, the packaging, a close-up of details — the more real photos, the more exact the product looks.",
  required: false,
  max,
});
const NOTE: Need = { key: "note", type: "text", label: "Anything to keep in mind?", hint: "e.g. colours to use, Eid theme, what not to show.", required: false, placeholder: "Optional" };
const STYLE: Need = { key: "style", type: "choice", label: "Look", hint: "The overall feel.", required: false, options: "style" };
const CAMERA: Need = { key: "camera", type: "choice", label: "Camera move", hint: "How the camera moves in the reel.", required: false, options: "camera" };
const AVATAR: Need = { key: "avatar", type: "choice", label: "Who's in it", hint: "Pick a ready person, your saved brand face, or your own photo below.", required: false, options: "avatar" };
const PERSON_PHOTO: Need = {
  key: "person",
  type: "photos",
  label: "Your own model / face photo",
  hint: "Optional — a clear, front-facing photo of the person to use instead of a ready avatar.",
  required: false,
  max: 1,
};
const CONSENT: Need = {
  key: "consent",
  type: "consent",
  label: "I have the right to use this person's face",
  hint: "Only needed when you upload a real person's photo.",
  required: true,
};
const LANGUAGE: Need = { key: "language", type: "choice", label: "Spoken language", hint: "English sounds the most natural; Urdu works but may sound less smooth.", required: false, options: "language" };
const MOOD: Need = { key: "mood", type: "choice", label: "Music & mood", hint: "The sound under the reel.", required: false, options: "mood" };

export const FORMATS: StudioFormat[] = [
  // ---------- Images: product ----------
  {
    id: "product-studio",
    kind: "image",
    group: "product",
    name: "Studio product shot",
    tagline: "Clean catalogue photo on a studio background",
    look: ["Your product, exactly as it is, centred on a clean seamless background", "Soft studio light with a gentle shadow — ready for your store and marketplaces"],
    needs: [PRODUCT, extraPhotos(), STYLE, NOTE],
    aspects: ["1:1", "4:5"],
  },
  {
    id: "lifestyle",
    kind: "image",
    group: "product",
    name: "Lifestyle scene",
    tagline: "Your product in a real-life setting",
    look: ["The product placed naturally where it's used — a kitchen, a desk, a dressing table", "Warm, believable light, like a photo a customer would take at home"],
    needs: [PRODUCT, extraPhotos(), { key: "scene", type: "text", label: "Where should it be?", hint: "Leave empty and the director picks the best setting.", required: false, placeholder: "e.g. a breakfast table on a sunny morning" }, STYLE, NOTE],
    aspects: ["4:5", "1:1", "9:16"],
  },
  {
    id: "flat-lay",
    kind: "image",
    group: "product",
    name: "Flat lay",
    tagline: "Top-down arrangement with props",
    look: ["Shot from directly above, the product with a few matching props", "Tidy, Instagram-style composition with space around it"],
    needs: [PRODUCT, extraPhotos(), STYLE, NOTE],
    aspects: ["1:1", "4:5"],
  },
  {
    id: "placement",
    kind: "image",
    group: "product",
    name: "Product placement",
    tagline: "Put your product into any scene you describe",
    look: ["The exact product dropped into the scene you describe, with matching light and shadows", "Great for seasonal or themed campaigns"],
    needs: [PRODUCT, extraPhotos(), { key: "scene", type: "text", label: "Describe the scene", hint: "Where, when, what's around it.", required: true, placeholder: "e.g. on a marble counter at an Eid dinner, fairy lights behind" }, NOTE],
    aspects: ["1:1", "4:5", "9:16", "16:9"],
  },

  // ---------- Images: social ----------
  {
    id: "social-post",
    kind: "image",
    group: "social",
    name: "Instagram / Facebook post",
    tagline: "A scroll-stopping post with a short headline",
    look: ["A bold product image designed for the feed", "A short headline on the image (max ~6 words) + a caption written for you"],
    needs: [PRODUCT, { key: "headline", type: "text", label: "Headline on the image", hint: "Leave empty and the director writes one.", required: false, placeholder: "e.g. New arrivals are here" }, STYLE, NOTE],
    aspects: ["4:5", "1:1"],
    tip: "Keep text short — AI writes short text on images much more reliably than long sentences.",
  },
  {
    id: "sale-poster",
    kind: "image",
    group: "social",
    name: "Sale / offer poster",
    tagline: "Announce a discount, deal or free delivery",
    look: ["Big, clear offer text (e.g. 30% OFF) with your product", "High-contrast design made to be read in one second"],
    needs: [PRODUCT_OPTIONAL, { key: "offer", type: "text", label: "The offer", hint: "Exactly what the poster should say.", required: true, placeholder: "e.g. 30% OFF · this weekend only" }, STYLE, NOTE],
    aspects: ["4:5", "1:1", "9:16"],
  },
  {
    id: "banner",
    kind: "image",
    group: "social",
    name: "Store banner",
    tagline: "Wide hero image for your storefront",
    look: ["A wide banner with room on one side for your store's headline", "Matches your brand's feel — use it in Orbit Design"],
    needs: [PRODUCT_OPTIONAL, extraPhotos("Photos to include"), STYLE, NOTE],
    aspects: ["16:9"],
  },

  // ---------- Images: fix a photo ----------
  {
    id: "background",
    kind: "image",
    group: "edit",
    name: "Change / remove background",
    tagline: "Pure white, a colour, or a new setting",
    look: ["Your photo with the background replaced — product untouched", "White background is ready for Daraz / marketplace listings"],
    needs: [
      { key: "photos", type: "photos", label: "Photo to fix", hint: "The photo whose background should change.", required: true, max: 1 },
      { key: "background", type: "text", label: "New background", hint: "Leave empty for pure white.", required: false, placeholder: "e.g. soft beige, or a wooden table" },
    ],
    aspects: ["1:1", "4:5"],
    edit: true,
  },
  {
    id: "enhance",
    kind: "image",
    group: "edit",
    name: "Fix & enhance a photo",
    tagline: "Better light, sharper, cleaner",
    look: ["Same photo, same product — brighter, sharper and cleaner", "Removes dust, glare and clutter; nothing about the product is changed"],
    needs: [
      { key: "photos", type: "photos", label: "Photo to fix", hint: "A phone photo works fine.", required: true, max: 1 },
      { key: "note", type: "text", label: "What's wrong with it?", hint: "Optional — e.g. too dark, messy background.", required: false },
    ],
    aspects: ["1:1", "4:5", "9:16", "16:9"],
    edit: true,
  },

  // ---------- Images: people ----------
  {
    id: "try-on",
    kind: "image",
    group: "people",
    name: "Virtual try-on",
    tagline: "A model wearing or holding your product",
    look: ["A model wearing your clothing, jewellery or accessory — fabric, print and details kept", "Choose the model, or use your own model's photo"],
    needs: [PRODUCT, extraPhotos("Clear photos of the item", 3), AVATAR, PERSON_PHOTO, CONSENT, { key: "scene", type: "text", label: "Setting", hint: "Optional — studio, street, wedding hall…", required: false }, NOTE],
    aspects: ["4:5", "9:16", "1:1"],
    tip: "Flat, well-lit photos of the item (no creases) give the best try-on.",
  },
  {
    id: "avatar",
    kind: "image",
    group: "people",
    name: "Create your brand face",
    tagline: "A reusable AI person for all your reels",
    look: ["A realistic, friendly person that fits your brand", "Saved to your media — pick it as \"My brand face\" in any people reel so every ad has the same face"],
    needs: [{ key: "describe", type: "text", label: "Describe the person", hint: "Age, look, clothing, vibe.", required: true, placeholder: "e.g. woman in her 20s, modern hijab, warm smile, pastel kurta" }],
    aspects: ["4:5", "9:16"],
  },

  // ---------- Videos: product reels ----------
  {
    id: "product-reel",
    kind: "video",
    group: "reel",
    name: "Product showcase reel",
    tagline: "Your product with a cinematic camera move",
    look: ["Opens on the product, camera glides around it to show the details", "Music under it, ends on a clean hero shot — ready for Reels / TikTok"],
    needs: [PRODUCT, extraPhotos(), CAMERA, MOOD, NOTE],
    aspects: ["9:16", "1:1", "16:9"],
    seconds: 8,
    audio: "music",
    keyframe: true,
  },
  {
    id: "animate-photo",
    kind: "video",
    group: "reel",
    name: "Bring a photo to life",
    tagline: "Turn any still photo into a moving clip",
    look: ["Your photo, gently moving — steam, fabric, light, a slow camera push", "Keeps the photo exactly as it is at the first frame"],
    needs: [{ key: "photos", type: "photos", label: "Photo to animate", hint: "Any product or lifestyle photo.", required: true, max: 1 }, CAMERA, MOOD, NOTE],
    aspects: ["9:16", "1:1", "16:9"],
    seconds: 6,
    audio: "music",
  },
  {
    id: "unboxing",
    kind: "video",
    group: "reel",
    name: "Unboxing",
    tagline: "Hands opening your package",
    look: ["Close-up hands open the box and lift your product out", "Satisfying sounds of the unboxing, ends with the product in hand"],
    needs: [PRODUCT, extraPhotos("Photos of the packaging", 3), NOTE],
    aspects: ["9:16", "1:1"],
    seconds: 10,
    audio: "music",
    keyframe: true,
    tip: "Add a photo of your real box/packaging so it looks like yours.",
  },

  // ---------- Videos: UGC ----------
  {
    id: "ugc-review",
    kind: "video",
    group: "ugc",
    name: "Customer review (UGC)",
    tagline: "A person holds your product and recommends it",
    look: ["Selfie-style video: a person shows your product to camera and talks about why they love it", "Natural phone look — the style that performs best in ads"],
    needs: [PRODUCT, extraPhotos(), AVATAR, PERSON_PHOTO, CONSENT, LANGUAGE, { key: "points", type: "text", label: "What should they say?", hint: "Key points — the director writes the script.", required: false, placeholder: "e.g. long-lasting, cheap, fast delivery" }],
    aspects: ["9:16"],
    seconds: 10,
    audio: "voice",
    keyframe: true,
  },
  {
    id: "tutorial",
    kind: "video",
    group: "ugc",
    name: "How to use it",
    tagline: "A quick demo of the product in action",
    look: ["A person shows how to use the product, step by step", "Short spoken tips — great for products people have questions about"],
    needs: [PRODUCT, extraPhotos(), AVATAR, PERSON_PHOTO, CONSENT, LANGUAGE, { key: "steps", type: "text", label: "How is it used?", hint: "The steps in your words.", required: true, long: true }],
    aspects: ["9:16"],
    seconds: 12,
    audio: "voice",
    keyframe: true,
  },
  {
    id: "talking-avatar",
    kind: "video",
    group: "ugc",
    name: "Announcement",
    tagline: "A person announces your sale or news",
    look: ["A person speaks straight to camera with your message", "Use it for sales, new arrivals, delivery news"],
    needs: [PRODUCT_OPTIONAL, AVATAR, PERSON_PHOTO, CONSENT, LANGUAGE, { key: "message", type: "text", label: "The message", hint: "What should they announce? Keep it to 1–2 sentences.", required: true, placeholder: "e.g. Our Eid collection is live — free delivery all week!" }],
    aspects: ["9:16", "1:1"],
    seconds: 10,
    audio: "voice",
    keyframe: true,
  },
  {
    id: "try-on-video",
    kind: "video",
    group: "ugc",
    name: "Try-on haul",
    tagline: "A model shows off your outfit",
    look: ["A model wearing your item turns and poses to show the fit and fabric", "Fashion-reel pacing with music"],
    needs: [PRODUCT, extraPhotos("Clear photos of the item", 3), AVATAR, PERSON_PHOTO, CONSENT, MOOD, NOTE],
    aspects: ["9:16"],
    seconds: 10,
    audio: "music",
    keyframe: true,
  },

  // ---------- Videos: ads & cinematic ----------
  {
    id: "cgi-showcase",
    kind: "video",
    group: "ad",
    name: "3D / CGI showcase",
    tagline: "Premium floating-product ad",
    look: ["Your product floating and rotating in a stylised 3D world — splashes, petals, light rays", "The high-end look big brands use for launches"],
    needs: [PRODUCT, extraPhotos(), MOOD, NOTE],
    aspects: ["9:16", "1:1", "16:9"],
    seconds: 8,
    audio: "music",
    keyframe: true,
  },
  {
    id: "cinematic",
    kind: "video",
    group: "ad",
    name: "Cinematic demo",
    tagline: "A mini film of your product in use",
    look: ["A short, film-like scene of the product being used", "Dramatic lighting, shallow focus and a strong last shot"],
    needs: [PRODUCT, extraPhotos(), CAMERA, MOOD, NOTE],
    aspects: ["16:9", "9:16"],
    seconds: 10,
    audio: "music",
    keyframe: true,
  },
  {
    id: "tv-spot",
    kind: "video",
    group: "ad",
    name: "Story ad (TV spot)",
    tagline: "A 15-second ad with a beginning, middle and end",
    look: ["3–4 shots: the problem, your product, the happy result, your brand at the end", "A voiceover tells the story"],
    needs: [PRODUCT, extraPhotos(), LANGUAGE, { key: "idea", type: "text", label: "The story", hint: "Optional — leave empty and the director writes it.", required: false, long: true }, NOTE],
    aspects: ["16:9", "9:16"],
    seconds: 15,
    audio: "voice",
    keyframe: true,
  },
];

export function getFormat(id: string): StudioFormat | undefined {
  return FORMATS.find((f) => f.id === id);
}

// ---------- Choice lists ----------

export const CAMERA_MOVES = [
  { id: "auto", label: "Director decides", prompt: "" },
  { id: "orbit", label: "Orbit around", prompt: "the camera slowly orbits 180° around the product" },
  { id: "dolly-in", label: "Slow push-in", prompt: "slow dolly push-in towards the product" },
  { id: "crane-up", label: "Crane up", prompt: "camera cranes up and over the product, revealing it from above" },
  { id: "reveal", label: "Reveal", prompt: "the product is revealed from behind a foreground element as the camera slides sideways" },
  { id: "macro", label: "Macro details", prompt: "extreme close-up macro shots gliding across the product's texture and details" },
  { id: "crash-zoom", label: "Crash zoom", prompt: "a fast, punchy crash zoom onto the product" },
  { id: "fpv", label: "Drone fly-through", prompt: "an FPV drone-style fly-through of the scene ending on the product" },
  { id: "handheld", label: "Handheld", prompt: "natural handheld phone camera with slight movement" },
  { id: "static", label: "Still camera", prompt: "locked-off static camera, only the subject moves" },
] as const;

export const STYLES = [
  { id: "auto", label: "Director decides", prompt: "" },
  { id: "clean", label: "Clean & minimal", prompt: "clean, minimal, lots of negative space, soft neutral tones" },
  { id: "luxury", label: "Luxury", prompt: "premium luxury look, deep tones, gold accents, dramatic soft light" },
  { id: "warm", label: "Warm & homely", prompt: "warm, cosy, natural daylight, homely textures" },
  { id: "bold", label: "Bold & colourful", prompt: "bold saturated colours, high contrast, playful pop-art energy" },
  { id: "festive", label: "Eid / festive", prompt: "festive Eid mood, crescent moon, lanterns, fairy lights, rich greens and golds" },
  { id: "desi", label: "Desi traditional", prompt: "traditional South Asian aesthetic, block prints, brass, jasmine, rich fabrics" },
  { id: "natural", label: "Natural & organic", prompt: "natural organic look, plants, wood, linen, sunlight" },
] as const;

export const AVATARS = [
  { id: "auto", label: "Director decides", prompt: "" },
  { id: "brand", label: "My brand face (saved)", prompt: "" },
  { id: "young-woman", label: "Young woman, casual", prompt: "a friendly South Asian woman in her early 20s, casual modern clothes" },
  { id: "hijabi", label: "Woman in hijab", prompt: "a warm, confident South Asian woman in her 20s wearing a modern hijab" },
  { id: "young-man", label: "Young man, casual", prompt: "a friendly South Asian man in his mid 20s, casual t-shirt, neat beard" },
  { id: "mother", label: "Mother / homemaker", prompt: "a kind South Asian woman in her late 30s, elegant everyday shalwar kameez" },
  { id: "professional", label: "Office professional", prompt: "a South Asian professional in their 30s, smart office wear" },
  { id: "student", label: "Student", prompt: "a cheerful South Asian university student around 20, trendy streetwear" },
  { id: "elder", label: "Older man", prompt: "a respectable South Asian man in his 50s with grey hair, kurta" },
  { id: "fashion", label: "Fashion model", prompt: "a stylish South Asian fashion model in her 20s, editorial look" },
] as const;

export const LANGUAGES = [
  { id: "english", label: "English", prompt: "English" },
  { id: "urdu", label: "Urdu", prompt: "Urdu" },
  { id: "mixed", label: "Urdu + English mix", prompt: "casual Urdu mixed with English words, the way young Pakistanis speak" },
] as const;

export const MOODS = [
  { id: "auto", label: "Director decides", prompt: "" },
  { id: "upbeat", label: "Upbeat", prompt: "upbeat energetic modern music" },
  { id: "calm", label: "Calm", prompt: "calm, soft ambient music" },
  { id: "luxury", label: "Elegant", prompt: "elegant cinematic strings" },
  { id: "festive", label: "Festive", prompt: "festive celebratory music with light percussion" },
  { id: "sfx", label: "Just real sounds", prompt: "no music, only natural sound effects of the scene" },
] as const;

export const CHOICES = { camera: CAMERA_MOVES, style: STYLES, avatar: AVATARS, language: LANGUAGES, mood: MOODS } as const;

export function choiceLabel(list: keyof typeof CHOICES, id: string | undefined): string {
  return (CHOICES[list] as readonly { id: string; label: string }[]).find((c) => c.id === id)?.label ?? "";
}

export function choicePrompt(list: keyof typeof CHOICES, id: string | undefined): string {
  return (CHOICES[list] as readonly { id: string; prompt: string }[]).find((c) => c.id === id)?.prompt ?? "";
}

// ---------- The seller's input ----------

export type StudioInput = {
  productId?: string;
  /** media ids per photos-need key, e.g. { photos: [...], person: [...] } */
  media?: Record<string, string[]>;
  text?: Record<string, string>;
  choice?: Record<string, string>;
  consent?: boolean;
  aspect?: Aspect;
};

/** What's still missing before the director can plan — shown to the seller, in plain words. */
export function missingNeeds(format: StudioFormat, input: StudioInput): string[] {
  const missing: string[] = [];
  const hasPerson = (input.media?.person?.length ?? 0) > 0;
  for (const n of format.needs) {
    if (n.type === "consent") {
      if (hasPerson && !input.consent) missing.push("Confirm you may use this person's face");
      continue;
    }
    if (!n.required) continue;
    if (n.type === "product" && !input.productId) missing.push(`Pick the ${n.label.toLowerCase()}`);
    if (n.type === "photos" && !(input.media?.[n.key]?.length ?? 0)) missing.push(`Add: ${n.label.toLowerCase()}`);
    if (n.type === "text" && !input.text?.[n.key]?.trim()) missing.push(`Fill in: ${n.label.toLowerCase()}`);
  }
  return missing;
}

/** Keep only fields this format knows, trimmed and bounded — never trust the client's shape. */
export function cleanInput(format: StudioFormat, raw: unknown): StudioInput {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const out: StudioInput = {};
  if (typeof r.productId === "string" && r.productId.trim()) out.productId = r.productId.trim();
  const media: Record<string, string[]> = {};
  const text: Record<string, string> = {};
  const choice: Record<string, string> = {};
  for (const n of format.needs) {
    if (n.type === "photos") {
      const ids = obj(r.media)[n.key];
      if (Array.isArray(ids)) media[n.key] = ids.filter((x): x is string => typeof x === "string").slice(0, n.max);
    } else if (n.type === "text") {
      const v = obj(r.text)[n.key];
      if (typeof v === "string" && v.trim()) text[n.key] = v.trim().slice(0, n.long ? 1200 : 400);
    } else if (n.type === "choice") {
      const v = obj(r.choice)[n.key];
      const list = CHOICES[n.options] as readonly { id: string }[];
      if (typeof v === "string" && list.some((c) => c.id === v)) choice[n.key] = v;
    }
  }
  if (Object.keys(media).length) out.media = media;
  if (Object.keys(text).length) out.text = text;
  if (Object.keys(choice).length) out.choice = choice;
  if (r.consent === true) out.consent = true;
  if (typeof r.aspect === "string" && (format.aspects as string[]).includes(r.aspect)) out.aspect = r.aspect as Aspect;
  return out;
}
