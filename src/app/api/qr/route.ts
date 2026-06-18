import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url") || "";
  if (!url) return new NextResponse("Missing url", { status: 400 });
  const svg = await QRCode.toString(url, {
    type: "svg",
    margin: 1,
    width: 320,
    color: { dark: "#111111", light: "#FFFFFF" }
  });
  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": request.nextUrl.searchParams.get("download") ? "attachment; filename=qr-code.svg" : "inline"
    }
  });
}
