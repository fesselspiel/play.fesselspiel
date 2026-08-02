import { NextResponse } from "next/server";
import { createOAuthClientId, normalizeRedirectUris } from "@/lib/oauth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const redirectUris = normalizeRedirectUris(body.redirect_uris);
  if (!redirectUris.length) {
    return NextResponse.json({ error: "redirect_uris fehlt oder ist ungueltig." }, { status: 400 });
  }
  const clientId = createOAuthClientId();
  const clientName = String(body.client_name || body.client_uri || "OAuth Client").trim().slice(0, 160) || "OAuth Client";
  await prisma.oAuthClient.create({
    data: {
      clientId,
      clientName,
      redirectUris,
      grantTypes: Array.isArray(body.grant_types) ? body.grant_types : ["authorization_code"],
      responseTypes: Array.isArray(body.response_types) ? body.response_types : ["code"],
      tokenEndpointAuthMethod: "none"
    }
  });
  return NextResponse.json({
    client_id: clientId,
    client_name: clientName,
    redirect_uris: redirectUris,
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none"
  }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
