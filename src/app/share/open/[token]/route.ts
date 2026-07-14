import { NextRequest, NextResponse } from "next/server";
import { openShareDelivery } from "@/lib/share";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const result = await openShareDelivery(params.token);
  const host = _request.headers.get("x-forwarded-host") || _request.headers.get("host") || _request.nextUrl.host;
  const protocol = _request.headers.get("x-forwarded-proto") || _request.nextUrl.protocol.replace(":", "") || "https";
  return NextResponse.redirect(new URL(result?.href || "/", `${protocol}://${host}`));
}
