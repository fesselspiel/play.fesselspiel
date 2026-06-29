import { NextRequest, NextResponse } from "next/server";
import { logAction, userDisplayName } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { env } from "@/lib/env";
import { normalizeHostname } from "@/lib/tenancy";
import { createWebSessionBridgeToken } from "@/lib/web-session-bridge";

export const runtime = "nodejs";

function redirectPath(value: unknown) {
  const path = String(value || "/").trim();
  if (!path || path.startsWith("//") || /^https?:\/\//i.test(path)) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

type TenantDomainSource = {
  domains?: { hostname: string; primary: boolean; active: boolean }[];
} | null | undefined;

function primaryDomain(tenant: TenantDomainSource) {
  return tenant?.domains?.find((domain) => domain.primary && domain.active)?.hostname
    || tenant?.domains?.find((domain) => domain.active)?.hostname
    || normalizeHostname(env.appUrl);
}

function publicBaseUrl(request: NextRequest, tenant: TenantDomainSource) {
  const forwardedHost = normalizeHostname(request.headers.get("x-forwarded-host") || request.headers.get("host") || "");
  const internalHosts = new Set(["0.0.0.0", "127.0.0.1", "localhost"]);
  const host = forwardedHost && !internalHosts.has(forwardedHost)
    ? forwardedHost
    : primaryDomain(tenant);
  const protoHeader = (request.headers.get("x-forwarded-proto") || "").split(",")[0]?.trim();
  const protocol = protoHeader === "http" || protoHeader === "https" ? protoHeader : "https";
  return `${protocol}://${host}`;
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const redirectTo = redirectPath(body.redirectTo || body.path || body.href);
  const ttlSeconds = Math.max(30, Math.min(300, Number(body.ttlSeconds || 120)));
  const token = createWebSessionBridgeToken({
    userId: auth.user.id,
    tenantId: auth.user.tenantId,
    redirectTo,
    ttlSeconds
  });
  const url = new URL("/api/auth/web-session", publicBaseUrl(request, auth.user.tenant));
  url.searchParams.set("token", token);

  await logAction({
    actorId: auth.user.id,
    action: "api_web_session_link_created",
    entityType: "user",
    entityId: auth.user.id,
    title: `${userDisplayName(auth.user)} hat einen App-Web-Login-Link erzeugt`,
    href: redirectTo,
    details: {
      redirectTo,
      ttlSeconds,
      tenantId: auth.user.tenantId || null
    }
  });

  return NextResponse.json({
    ok: true,
    url: url.toString(),
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    ttlSeconds
  });
}
