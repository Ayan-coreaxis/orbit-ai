import { NextResponse } from "next/server";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { buildMetaAuthUrl } from "@/lib/meta-oauth";

export async function GET() {
  const businessId = await getActiveBusinessId();
  if (!businessId) {
    return NextResponse.redirect(new URL("/dashboard/settings?meta=no_business", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
  }

  const authUrl = buildMetaAuthUrl(businessId);
  if (!authUrl) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?meta=not_configured", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
    );
  }

  return NextResponse.redirect(authUrl);
}
