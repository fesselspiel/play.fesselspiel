import { NextResponse } from "next/server";
import { createApiToken } from "@/lib/api-tokens";
import { hashOAuthCode, isValidOAuthResource, oauthResource, pkceS256, safeEqualText } from "@/lib/oauth";
import { prisma } from "@/lib/prisma";

function tokenError(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = await readTokenBody(request);
  const grantType = String(body.grant_type || "");
  const code = String(body.code || "");
  const redirectUri = String(body.redirect_uri || "");
  const requestedClientId = String(body.client_id || "");
  const verifier = String(body.code_verifier || "");
  const requestedResource = String(body.resource || "");
  if (grantType !== "authorization_code" || !code || !verifier) {
    return tokenError("invalid_request");
  }
  const authCode = await prisma.oAuthAuthorizationCode.findUnique({ where: { codeHash: hashOAuthCode(code) } });
  if (!authCode) return tokenError("invalid_grant");
  const clientId = requestedClientId || authCode.clientId;
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  const redirectUris = Array.isArray(client?.redirectUris) ? client.redirectUris.map(String) : [];
  if (!client || authCode.clientId !== clientId || (redirectUri && authCode.redirectUri !== redirectUri) || !redirectUris.includes(authCode.redirectUri)) {
    return tokenError("invalid_grant");
  }
  const resource = requestedResource || authCode.resource || oauthResource(request);
  if (authCode.resource && resource !== authCode.resource) return tokenError("invalid_target");
  if (!isValidOAuthResource(resource, request)) return tokenError("invalid_target");
  if (authCode.usedAt || authCode.expiresAt.getTime() < Date.now()) return tokenError("invalid_grant");
  if (authCode.codeChallengeMethod !== "S256" || !safeEqualText(pkceS256(verifier), authCode.codeChallenge)) {
    return tokenError("invalid_grant");
  }
  await prisma.oAuthAuthorizationCode.update({ where: { id: authCode.id }, data: { usedAt: new Date() } });
  const { token, record } = await createApiToken(authCode.userId, `OAuth: ${client.clientName}`, authCode.tenantId || undefined);
  return NextResponse.json({
    access_token: token,
    token_type: "Bearer",
    scope: authCode.scope || "",
    expires_in: 0,
    resource,
    token_id: record.id
  }, { headers: { "Cache-Control": "no-store" } });
}

async function readTokenBody(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await request.json().catch(() => ({}))) as Record<string, unknown>;
  }
  const form = await request.formData().catch(() => null);
  if (!form) return {};
  return Object.fromEntries(Array.from(form.entries()).map(([key, value]) => [key, String(value)]));
}
