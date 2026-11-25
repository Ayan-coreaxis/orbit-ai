import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { putFile } from "@/lib/storage";
import { getActiveBusinessId } from "@/lib/get-active-business-id";

const MAX = 20 * 1024 * 1024;

/** The seller's own 3D model (.glb, checked by its first bytes, not its name). */
export async function POST(req: NextRequest) {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "That model is over 20 MB. Please compress it first." }, { status: 413 });
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length < 20 || buf.toString("latin1", 0, 4) !== "glTF" || buf.readUInt32LE(4) !== 2) return NextResponse.json({ error: "Upload a .glb file (glTF 2.0)." }, { status: 415 });
  const url = await putFile(`uploads/${businessId}/${randomUUID()}.glb`, buf, "model/gltf-binary");
  return NextResponse.json({ url, name: file.name.slice(0, 80) });
}
