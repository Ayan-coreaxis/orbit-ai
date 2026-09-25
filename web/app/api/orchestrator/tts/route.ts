import { NextRequest, NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";

/**
 * Real server-side neural voice via Google Cloud Text-to-Speech — sounds natural in every
 * browser, unlike the free client-side Web Speech API voices (which are only decent in real
 * Edge, and robotic/legacy everywhere else, including Chrome). Requires GOOGLE_TTS_API_KEY;
 * the frontend honestly falls back to the browser's own speechSynthesis when this isn't
 * configured or the call fails, rather than going silent.
 */
export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { text } = await req.json();
  if (!text || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Text is required." }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "not_configured" }, { status: 501 });
  }

  try {
    const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text: text.slice(0, 5000) },
        voice: { languageCode: "en-US", name: "en-US-Neural2-F" },
        audioConfig: { audioEncoding: "MP3", speakingRate: 1.03 },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json({ error: `Google TTS failed: ${detail.slice(0, 300)}` }, { status: 502 });
    }
    const data = (await res.json()) as { audioContent?: string };
    if (!data.audioContent) {
      return NextResponse.json({ error: "Google TTS returned no audio." }, { status: 502 });
    }
    return NextResponse.json({ audioBase64: data.audioContent });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: `Google TTS request failed: ${detail}` }, { status: 502 });
  }
}
