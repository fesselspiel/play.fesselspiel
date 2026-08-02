import { NextResponse } from "next/server";
import { createApiToken } from "@/lib/api-tokens";
import { hashOAuthCode, pkceS256, safeEqualText } from "@/lib/oauth";
import { prisma } from "@/lib/prisma";

function tokenError(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const grantType = String(form.get("grant_type") || "");
  const code = String(form.get("code") || "");
  const redirectUri = String(form.get("redirect_uri") || "");
  const clientId = String(form.get("client_id") || "");
  const verifier = String(form.get("code_verifier") || "");
  if (grantType !== "authorization_code" || !code || !redirectUri || !clientId || !verifier) {
    return tokenError("invalid_request");
  }
  const [client, authCode] = await Promise.all([
    prisma.oAuthClient.findUnique({ where: { clientId } }),
    prisma.oAuthAuthorizationCode.findUnique({ where: { codeHash: hashOAuthCode(code) } })
  ]);
  const redirectUris = Array.isArray(client?.redirectUris) ? client.redirectUris.map(String) : [];
  if (!client || !authCode || authCode.clientId !== clientId || authCode.redirectUri !== redirectUri || !redirectUris.includes(redirectUri)) {
    return tokenError("invalid_grant");
  }
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
    token_id: record.id
  }, { headers: { "Cache-Control": "no-store" } });
}
