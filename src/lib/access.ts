import { prisma } from "@/lib/prisma";

export type AccessUser = {
  id: string;
  circleId?: string | null;
};

export async function accessibleOwnerIds(user: AccessUser) {
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

export async function isAccessibleOwner(user: AccessUser, ownerId: string) {
  return (await accessibleOwnerIds(user)).includes(ownerId);
}
