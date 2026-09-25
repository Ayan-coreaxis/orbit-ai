import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";

export async function POST() {
  const businessId = await getActiveBusinessId();
  if (!businessId) return NextResponse.json({ error: "No active business." }, { status: 400 });

  await prisma.business.update({
    where: { id: businessId },
    data: {
      metaAccessToken: null,
      metaPageId: null,
      metaPageName: null,
      metaInstagramUserId: null,
      metaAdAccountId: null,
      metaConnectedAt: null,
    },
  });
  return NextResponse.json({ ok: true });
}
