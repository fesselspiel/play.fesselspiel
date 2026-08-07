import { NextResponse } from "next/server";
import { currentSessionContext } from "@/lib/auth";
import { createOAuthCode, hashOAuthCode, isValidOAuthResource, normalizeScopes, oauthResource } from "@/lib/oauth";
import { prisma } from "@/lib/prisma";

function redirectWithError(redirectUri: string, state: string, error: string) {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (state) url.searchParams.set("state", state);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const form = await request.formData();
  const clientId = String(form.get("client_id") || "");
  const redirectUri = String(form.get("redirect_uri") || "");
  const responseType = String(form.get("response_type") || "");
  const scope = String(form.get("scope") || "");
  const state = String(form.get("state") || "");
  const codeChallenge = String(form.get("code_challenge") || "");
  const codeChallengeMethod = String(form.get("code_challenge_method") || "");
  const resource = String(form.get("resource") || oauthResource(request));
  const { actor, tenant } = await currentSessionContext();
  if (!actor) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent("/oauth/authorize")}`, request.url));
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  const redirectUris = Array.isArray(client?.redirectUris) ? client.redirectUris.map(String) : [];
  if (!client || responseType !== "code" || !redirectUris.includes(redirectUri) || !codeChallenge || codeChallengeMethod !== "S256" || !isValidOAuthResource(resource, request)) {
    return redirectUri ? redirectWithError(redirectUri, state, "invalid_request") : NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const code = createOAuthCode();
  await prisma.oAuthAuthorizationCode.create({
    data: {
      codeHash: hashOAuthCode(code),
      clientId,
      userId: actor.id,
      tenantId: tenant?.id || actor.tenantId,
      redirectUri,
      scope: normalizeScopes(scope).join(" "),
      resource,
      codeChallenge,
      codeChallengeMethod,
      expiresAt: new Date(Date.now() + 5 * 60_000)
    }
  });
  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  return NextResponse.redirect(url, 303);
}
