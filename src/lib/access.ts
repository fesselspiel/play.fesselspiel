import type { Visibility } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AccessUser = {
  id: string;
  circleId?: string | null;
  role?: string | null;
};

export async function accessibleOwnerIds(user: AccessUser) {
  if (user.role === "ADMIN") {
    const users = await prisma.user.findMany({ where: { active: true }, select: { id: true } });
    return users.map((entry) => entry.id);
  }
  if (!user.circleId) return [user.id];
  const users = await prisma.user.findMany({
    where: { circleId: user.circleId, active: true },
    select: { id: true }
  });
  const ids = users.map((entry) => entry.id);
  return ids.length ? ids : [user.id];
}

export async function ownerScope(user: AccessUser) {
  return { ownerId: { in: await accessibleOwnerIds(user) } };
}

export async function visibilityScope(user: AccessUser) {
  if (user.role === "ADMIN") return { ownerId: { in: await accessibleOwnerIds(user) } };
  const ownerIds = await accessibleOwnerIds(user);
  const circleVisibility: Visibility[] = ["PARTNER", "SHARED"];
  return {
    OR: [
      { ownerId: user.id },
      ...(user.circleId ? [{ ownerId: { in: ownerIds.filter((id) => id !== user.id) }, visibility: { in: circleVisibility } }] : []),
      { visibility: "SHARED" as const }
    ]
  };
}

export async function isAccessibleOwner(user: AccessUser, ownerId: string) {
  return (await accessibleOwnerIds(user)).includes(ownerId);
}
