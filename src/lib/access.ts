import type { Visibility } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AccessUser = {
  id: string;
  tenantId?: string | null;
  circleId?: string | null;
  role?: string | null;
};

function tenantWhere(user: AccessUser) {
  return user.tenantId ? { tenantId: user.tenantId } : {};
}

export async function accessibleOwnerIds(user: AccessUser) {
  if (user.tenantId && (user.role === "SUPER_ADMIN" || user.role === "ADMIN")) {
    const memberships = await prisma.tenantMembership.findMany({
      where: { tenantId: user.tenantId, active: true, user: { active: true } },
      select: { userId: true }
    });
    return memberships.map((entry) => entry.userId);
  }
  if (!user.circleId || !user.tenantId) return [user.id];
  const memberships = await prisma.tenantMembership.findMany({
    where: { tenantId: user.tenantId, circleId: user.circleId, active: true, user: { active: true } },
    select: { userId: true }
  });
  const ids = memberships.map((entry) => entry.userId);
  return ids.length ? ids : [user.id];
}

export async function ownerScope(user: AccessUser) {
  return { ...tenantWhere(user), ownerId: { in: await accessibleOwnerIds(user) } };
}

export async function visibilityScope(user: AccessUser) {
  const tenantScope = tenantWhere(user);
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return { ...tenantScope, ownerId: { in: await accessibleOwnerIds(user) } };
  const ownerIds = await accessibleOwnerIds(user);
  const circleVisibility: Visibility[] = ["PARTNER", "SHARED"];
  return {
    OR: [
      { ...tenantScope, ownerId: user.id },
      ...(user.circleId ? [{ ownerId: { in: ownerIds.filter((id) => id !== user.id) }, visibility: { in: circleVisibility } }] : []),
      { ...tenantScope, visibility: "SHARED" as const }
    ]
  };
}

export async function mediaVisibilityScope(user: AccessUser) {
  const tenantScope = tenantWhere(user);
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return { ...tenantScope, ownerId: { in: await accessibleOwnerIds(user) } };
  const ownerIds = await accessibleOwnerIds(user);
  const circleVisibility: Visibility[] = ["PARTNER", "SHARED"];
  const otherOwnerIds = ownerIds.filter((id) => id !== user.id);
  return {
    OR: [
      { ...tenantScope, ownerId: user.id },
      ...(user.circleId
        ? [
            {
              ...tenantScope,
              ownerId: { in: otherOwnerIds },
              OR: [
                { visibility: { in: circleVisibility } },
                { visibility: null, album: { is: { visibility: { in: circleVisibility } } } }
              ]
            }
          ]
        : []),
      { ...tenantScope, visibility: "SHARED" as const },
      { ...tenantScope, visibility: null, album: { is: { visibility: "SHARED" as const } } }
    ]
  };
}

export function bondageSystemVisibilityScope(user: AccessUser) {
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return {};
  return {
    OR: [
      { visibility: "SHARED" as const },
      { targetUserId: user.id },
      ...(user.circleId ? [{ visibility: "PARTNER" as const, OR: [{ targetCircleId: user.circleId }, { targetCircleId: null }] }] : [])
    ]
  };
}

export async function isAccessibleOwner(user: AccessUser, ownerId: string) {
  return (await accessibleOwnerIds(user)).includes(ownerId);
}

export function contentTenantScope(user: AccessUser) {
  return tenantWhere(user);
}
