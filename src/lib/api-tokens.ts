import { createHmac, randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { currentTenant } from "@/lib/tenancy";

function tokenHash(token: string) {
  return createHmac("sha256", env.jwtSecret).update(token).digest("hex");
}

function viewContextHash(contextId: string) {
  return createHmac("sha256", env.jwtSecret).update(`view:${contextId}`).digest("hex");
}

export function createPlainApiToken() {
  return `fsp_${randomBytes(32).toString("base64url")}`;
}

export function createPlainViewContextId() {
  return `pvc_${randomBytes(32).toString("base64url")}`;
}

export function hashViewContextId(contextId: string) {
  return viewContextHash(contextId);
}

export function apiTokenLastSix(token: string) {
  return token.slice(-6);
}

export async function createApiToken(userId: string, name: string, tenantId?: string) {
  const token = createPlainApiToken();
  const record = await prisma.apiToken.create({
    data: {
      userId,
      tenantId: tenantId || (await currentTenant()).id,
      name: name.trim() || "API Token",
      tokenHash: tokenHash(token),
      tokenLastSix: apiTokenLastSix(token)
    }
  });
  return { token, record };
}

export function tokenFromRequest(request: NextRequest | Request) {
  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer) return bearer;
  const url = new URL(request.url);
  return url.searchParams.get("token")?.trim() || "";
}

type ApiTokenOptions = {
  ignoreViewContext?: boolean;
};

export async function userFromApiToken(request: NextRequest | Request, options: ApiTokenOptions = {}) {
  const token = tokenFromRequest(request);
  if (!token) return null;
  const record = await prisma.apiToken.findFirst({
    where: { tokenHash: tokenHash(token), active: true, user: { active: true } },
    include: {
      tenant: { include: { domains: true, features: true } },
      user: { include: { settings: true, profile: true, circle: true, tenant: { include: { domains: true, features: true } } } }
    }
  });
  if (!record) return null;
  await prisma.apiToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } });
  const baseMembership = record.tenantId
    ? await prisma.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId: record.tenantId, userId: record.userId } }, include: { circle: true } })
    : null;
  const contextId = options.ignoreViewContext ? "" : (request.headers.get("x-playplaner-view-context") || "").trim();
  let effectiveTenant = record.tenant || record.user.tenant;
  let effectiveUser = record.user;
  let effectiveMembership = baseMembership;
  let effectiveCircleId: string | null | undefined;
  let effectiveCircle: typeof record.user.circle = null;
  if (contextId) {
    const context = await prisma.externalViewContext.findFirst({
      where: {
        contextHash: viewContextHash(contextId),
        tokenId: record.id,
        expiresAt: { gt: new Date() }
      }
    });
    if (!context) return null;
    const actorIsAdmin = record.user.role === "ADMIN" || record.user.role === "SUPER_ADMIN";
    if (!actorIsAdmin && context.mode !== "circle") return null;
    const targetTenant = context.tenantId
      ? await prisma.tenant.findUnique({ where: { id: context.tenantId }, include: { domains: true, features: true } })
      : effectiveTenant;
    if (!targetTenant) return null;
    const targetUser = context.userId
      ? await prisma.user.findFirst({
          where: {
            id: context.userId,
            active: true,
            ...(context.mode === "user" ? { memberships: { some: { tenantId: targetTenant.id, active: true } } } : {})
          },
          include: { settings: true, profile: true, circle: true, tenant: { include: { domains: true, features: true } } }
        })
      : record.user;
    if (!targetUser) return null;
    const membership = await prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId: targetTenant.id, userId: targetUser.id } },
      include: { circle: true }
    });
    if (context.mode === "user" && context.userId && !membership && targetUser.role !== "SUPER_ADMIN") return null;
    if ((context.mode === "tenant" || context.mode === "circle") && targetUser.id !== record.user.id) return null;
    if (context.circleId) {
      const circle = await prisma.circle.findFirst({ where: { id: context.circleId, tenantId: targetTenant.id } });
      if (!circle) return null;
      if (record.user.role !== "ADMIN" && record.user.role !== "SUPER_ADMIN" && membership?.circleId !== circle.id) return null;
      effectiveMembership = membership;
      effectiveCircleId = circle.id;
      effectiveCircle = circle;
    } else {
      effectiveMembership = membership;
    }
    await prisma.externalViewContext.update({ where: { id: context.id }, data: { lastUsedAt: new Date() } }).catch(() => null);
    effectiveTenant = targetTenant;
    effectiveUser = targetUser;
  }
  return {
    user: {
      ...effectiveUser,
      tenantId: effectiveTenant?.id || record.tenantId || effectiveUser.tenantId,
      tenant: effectiveTenant || effectiveUser.tenant,
      circleId: effectiveCircleId ?? effectiveMembership?.circleId ?? effectiveUser.circleId,
      circle: effectiveCircle ?? effectiveMembership?.circle ?? effectiveUser.circle,
      role: effectiveUser.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : effectiveMembership?.role || effectiveUser.role
    },
    token: record
  };
}
