import { prisma } from "@/lib/prisma";
import type { currentUser } from "@/lib/auth";

type UserLike = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

export function selectedIds(formData: FormData, name: string) {
  return Array.from(new Set(formData.getAll(name).map(String).filter(Boolean)));
}

function visibleBondageWhere(user: UserLike) {
  return {
    tenantId: user.tenantId || "",
    visible: true,
    OR: [
      { targetUserId: null, targetCircleId: null },
      { targetUserId: user.id },
      ...(user.circleId ? [{ targetCircleId: user.circleId }] : [])
    ]
  };
}

export async function trackerLinkOptions(user: UserLike, scope: Record<string, unknown>, features: {
  toys: boolean;
  positions: boolean;
  bondageSystem: boolean;
}) {
  const [toys, positions, bondageItems] = await Promise.all([
    features.toys
      ? prisma.toy.findMany({ where: scope, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] })
      : Promise.resolve([]),
    features.positions
      ? prisma.position.findMany({ where: scope, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] })
      : Promise.resolve([]),
    features.bondageSystem && user.tenantId
      ? prisma.bondageSystemItem.findMany({
          where: visibleBondageWhere(user),
          include: { product: true },
          orderBy: [{ sortOrder: "asc" }, { product: { title: "asc" } }]
        })
      : Promise.resolve([])
  ]);
  return {
    toys,
    positions,
    bondageItems
  };
}

export async function trackerLinkConnectData(user: UserLike, scope: Record<string, unknown>, formData: FormData, features: {
  toys: boolean;
  positions: boolean;
  bondageSystem: boolean;
}) {
  const toyIds = features.toys ? selectedIds(formData, "toys") : [];
  const positionIds = features.positions ? selectedIds(formData, "positions") : [];
  const bondageItemIds = features.bondageSystem ? selectedIds(formData, "bondageItems") : [];
  const [toys, positions, bondageItems] = await Promise.all([
    toyIds.length ? prisma.toy.findMany({ where: { ...scope, id: { in: toyIds } }, select: { id: true } }) : Promise.resolve([]),
    positionIds.length ? prisma.position.findMany({ where: { ...scope, id: { in: positionIds } }, select: { id: true } }) : Promise.resolve([]),
    bondageItemIds.length && user.tenantId
      ? prisma.bondageSystemItem.findMany({ where: { ...visibleBondageWhere(user), id: { in: bondageItemIds } }, select: { id: true } })
      : Promise.resolve([])
  ]);
  return {
    toys: toys.map((entry) => ({ id: entry.id })),
    positions: positions.map((entry) => ({ id: entry.id })),
    bondageItems: bondageItems.map((entry) => ({ id: entry.id }))
  };
}

export function trackerLinkOptionData(options: Awaited<ReturnType<typeof trackerLinkOptions>>) {
  return {
    toys: options.toys.map((toy) => ({ id: toy.id, title: toy.title, imageUrl: toy.imageUrl, href: `/toys/${toy.slug}`, fallback: "/toy-placeholder.svg" })),
    positions: options.positions.map((position) => ({ id: position.id, title: position.name, imageUrl: position.imageUrl, href: `/positions/${position.slug}`, fallback: "/position-placeholder.svg" })),
    bondageItems: options.bondageItems.map((item) => ({ id: item.id, title: item.product.title, imageUrl: item.product.imageUrl, href: `/bondage-system/${item.product.slug}`, fallback: "/toy-placeholder.svg" }))
  };
}
