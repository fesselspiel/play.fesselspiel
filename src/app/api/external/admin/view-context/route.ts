import { NextRequest, NextResponse } from "next/server";
import { logAction, userDisplayName } from "@/lib/audit";
import { createPlainViewContextId, hashViewContextId, userFromApiToken } from "@/lib/api-tokens";
import { requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function text(value: unknown) {
  return String(value || "").trim();
}

function ttlSeconds(value: unknown) {
  const parsed = Number(value || 7200);
  return Math.min(60 * 60 * 12, Math.max(60, Number.isFinite(parsed) ? parsed : 7200));
}

function serializeTenant(tenant: { id: string; name: string; slug: string; domains: { hostname: string; primary: boolean; active: boolean }[] }) {
  const activeDomains = tenant.domains.filter((domain) => domain.active);
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    domain: activeDomains.find((domain) => domain.primary)?.hostname || activeDomains[0]?.hostname || "",
    domains: activeDomains.map((domain) => ({
      hostname: domain.hostname,
      primary: domain.primary
    }))
  };
}

function serializeUser(user: {
  id: string;
  username?: string | null;
  email?: string | null;
  name?: string | null;
  role?: string | null;
  profile?: { displayName?: string | null; imageUrl?: string | null } | null;
}, role?: string | null) {
  return {
    id: user.id,
    displayName: user.profile?.displayName || user.name || user.username || user.email,
    username: user.username,
    email: user.email,
    role: role || user.role,
    imageUrl: user.profile?.imageUrl || null
  };
}

async function tokenRecordId(request: NextRequest) {
  const userAuth = await userFromApiToken(request, { ignoreViewContext: true });
  return userAuth?.token.id || null;
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, { ignoreViewContext: true });
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const mode = text(body.mode) || "clear";
  const actorIsAdmin = auth.user.role === "ADMIN" || auth.user.role === "SUPER_ADMIN";
  if (!actorIsAdmin && mode !== "circle" && mode !== "clear") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const apiTokenId = await tokenRecordId(request);
  if (!apiTokenId) return NextResponse.json({ ok: false, error: "token_not_found" }, { status: 401 });

  if (mode === "clear") {
    await prisma.externalViewContext.deleteMany({ where: { tokenId: apiTokenId } });
    await logAction({
      actorId: auth.user.id,
      action: "external_admin_view_context_cleared",
      entityType: "apiToken",
      entityId: apiTokenId,
      title: `${userDisplayName(auth.user)} hat die mobile Admin-Sicht beendet`,
      href: "/settings/view-as"
    });
    return NextResponse.json({ ok: true, context: null, contextId: null, expiresAt: null });
  }
  if (mode !== "tenant" && mode !== "user" && mode !== "circle") {
    return NextResponse.json({ ok: false, error: "invalid_mode" }, { status: 400 });
  }

  const requestedTenantId = text(body.tenantId);
  const requestedUserId = text(body.userId);
  const requestedCircleId = text(body.circleId);
  const targetTenant = requestedTenantId
    ? await prisma.tenant.findFirst({
        where: {
          id: requestedTenantId,
          ...(auth.user.role === "SUPER_ADMIN" ? {} : { id: auth.user.tenantId || "" })
        },
        include: { domains: true, features: true }
      })
    : auth.user.tenantId
      ? await prisma.tenant.findUnique({ where: { id: auth.user.tenantId }, include: { domains: true, features: true } })
      : null;
  if (!targetTenant) return NextResponse.json({ ok: false, error: "tenant_not_found" }, { status: 404 });
  if (auth.user.role !== "SUPER_ADMIN" && targetTenant.id !== auth.user.tenantId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let targetUser = null;
  let targetMembership = null;
  if (mode === "user") {
    if (!requestedUserId) return NextResponse.json({ ok: false, error: "userId_required" }, { status: 400 });
    targetUser = await prisma.user.findFirst({
      where: {
        id: requestedUserId,
        active: true,
        memberships: { some: { tenantId: targetTenant.id, active: true } }
      },
      include: { profile: true }
    });
    if (!targetUser) return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
    targetMembership = await prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId: targetTenant.id, userId: targetUser.id } }
    });
    if (!targetMembership && targetUser.role !== "SUPER_ADMIN") return NextResponse.json({ ok: false, error: "membership_not_found" }, { status: 404 });
  } else {
    targetMembership = await prisma.tenantMembership.findFirst({
      where: { tenantId: targetTenant.id, userId: auth.user.id, active: true, user: { active: true } },
      include: { user: { include: { profile: true } } }
    });
    if (!targetMembership && auth.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ ok: false, error: "membership_not_found" }, { status: 404 });
    }
    targetUser = targetMembership?.user || auth.user;
  }

  let targetCircle = null;
  if (mode === "circle") {
    if (!requestedCircleId) return NextResponse.json({ ok: false, error: "circleId_required" }, { status: 400 });
    targetCircle = await prisma.circle.findFirst({ where: { id: requestedCircleId, tenantId: targetTenant.id } });
    if (!targetCircle) return NextResponse.json({ ok: false, error: "circle_not_found" }, { status: 404 });
    if (!actorIsAdmin && targetMembership?.circleId !== targetCircle.id) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
  }

  const contextId = createPlainViewContextId();
  const expiresAt = new Date(Date.now() + ttlSeconds(body.ttlSeconds) * 1000);
  await prisma.$transaction([
    prisma.externalViewContext.deleteMany({ where: { tokenId: apiTokenId } }),
    prisma.externalViewContext.create({
    data: {
      tokenId: apiTokenId,
      actorId: auth.user.id,
      tenantId: targetTenant.id,
      userId: targetUser.id,
      circleId: targetCircle?.id || null,
      mode,
      contextHash: hashViewContextId(contextId),
      expiresAt
    }
    })
  ]);
  await logAction({
    actorId: auth.user.id,
    action: "external_admin_view_context_created",
    entityType: mode === "user" ? "user" : mode === "circle" ? "circle" : "tenant",
    entityId: mode === "user" ? targetUser.id : mode === "circle" ? targetCircle?.id || targetTenant.id : targetTenant.id,
    title: mode === "user"
      ? `${userDisplayName(auth.user)} hat die mobile Ansicht von ${userDisplayName(targetUser)} geöffnet`
      : mode === "circle"
        ? `${userDisplayName(auth.user)} hat den mobilen Zirkel ${targetCircle?.name || ""} geöffnet`
        : `${userDisplayName(auth.user)} hat die mobile Seite ${targetTenant.name} geöffnet`,
    href: "/settings/view-as",
    details: { mode, tenantId: targetTenant.id, userId: targetUser.id, circleId: targetCircle?.id || null, expiresAt: expiresAt.toISOString() }
  });

  return NextResponse.json({
    ok: true,
    contextId,
    expiresAt: expiresAt.toISOString(),
    context: {
      id: contextId,
      mode,
      expiresAt: expiresAt.toISOString(),
      tenant: serializeTenant(targetTenant),
      user: serializeUser(targetUser, targetMembership?.role || targetUser.role),
      circle: targetCircle ? { id: targetCircle.id, name: targetCircle.name, current: true } : null
    }
  });
}
