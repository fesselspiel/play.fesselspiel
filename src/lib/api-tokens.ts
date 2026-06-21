import { createHmac, randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { currentTenant } from "@/lib/tenancy";

function tokenHash(token: string) {
  return createHmac("sha256", env.jwtSecret).update(token).digest("hex");
}

export function createPlainApiToken() {
  return `fsp_${randomBytes(32).toString("base64url")}`;
}

export function apiTokenLastSix(token: string) {
  return token.slice(-6);
}

export async function createApiToken(userId: string, name: string) {
  const token = createPlainApiToken();
  const record = await prisma.apiToken.create({
    data: {
      userId,
      tenantId: (await currentTenant()).id,
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

export async function userFromApiToken(request: NextRequest | Request) {
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
  const membership = record.tenantId
    ? await prisma.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId: record.tenantId, userId: record.userId } }, include: { circle: true } })
    : null;
  return {
    user: {
      ...record.user,
      tenantId: record.tenantId || record.user.tenantId,
      tenant: record.tenant || record.user.tenant,
      circleId: membership?.circleId || record.user.circleId,
      circle: membership?.circle || record.user.circle,
      role: record.user.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : membership?.role || record.user.role
    },
    token: record
  };
}
