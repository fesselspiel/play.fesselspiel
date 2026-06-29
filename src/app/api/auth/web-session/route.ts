import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { logAction, userDisplayName } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { verifyWebSessionBridgeToken } from "@/lib/web-session-bridge";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const payload = verifyWebSessionBridgeToken(request.nextUrl.searchParams.get("token"));
  if (!payload) return NextResponse.redirect(new URL("/login?bridge=invalid", request.url), { status: 303 });

  const user = await prisma.user.findFirst({
    where: {
      id: payload.userId,
      active: true,
      ...(payload.tenantId ? {
        OR: [
          { role: "SUPER_ADMIN" },
          { tenantId: payload.tenantId },
          { memberships: { some: { tenantId: payload.tenantId, active: true } } }
        ]
      } : {})
    },
    include: { profile: true }
  });
  if (!user) return NextResponse.redirect(new URL("/login?bridge=denied", request.url), { status: 303 });

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await logAction({
    actorId: user.id,
    action: "api_web_session_login",
    entityType: "user",
    entityId: user.id,
    title: `${userDisplayName(user)} wurde aus der App im Web angemeldet`,
    href: payload.redirectTo,
    details: {
      redirectTo: payload.redirectTo,
      tenantId: payload.tenantId || null
    }
  });

  const response = NextResponse.redirect(new URL(payload.redirectTo, request.url), { status: 303 });
  setSessionCookie(response, createSessionToken(user.id, false), false);
  return response;
}
