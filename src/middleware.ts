import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const match = request.nextUrl.pathname.match(/^\/seite\/([^/]+)(\/.*)?$/);
  if (!match) return NextResponse.next();

  const [, slug, rest = "/"] = match;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-playplaner-tenant-slug", decodeURIComponent(slug).toLowerCase());

  const url = request.nextUrl.clone();
  url.pathname = rest === "/" ? "/" : rest;
  return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/seite/:path*"]
};
