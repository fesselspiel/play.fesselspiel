import { NextRequest, NextResponse } from "next/server";
import { logAction, userDisplayName } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { createWebSessionBridgeToken } from "@/lib/web-session-bridge";

export const runtime = "nodejs";

function redirectPath(value: unknown) {
  const path = String(value || "/").trim();
  if (!path || path.startsWith("//") || /^https?:\/\//i.test(path)) return "/";
  return path.startsWith("/") ? path : `/${path}`;
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
  const url = new URL("/api/auth/web-session", request.url);
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
