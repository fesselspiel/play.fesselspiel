import type { Visibility } from "@prisma/client";
import { userDisplayName } from "@/lib/audit";

export type PackingUser = {
  id: string;
  tenantId?: string | null;
  circleId?: string | null;
  role?: string | null;
};

export function packingVisibilityScope(user: PackingUser) {
  const tenantScope = user.tenantId ? { tenantId: user.tenantId } : {};
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return tenantScope;
  const circleVisibility: Visibility[] = ["PARTNER", "SHARED"];
  return {
    OR: [
      { ...tenantScope, ownerId: user.id },
      ...(user.circleId ? [{ ...tenantScope, visibility: { in: circleVisibility } }] : []),
      { ...tenantScope, visibility: "SHARED" as const }
    ]
  };
}

export function canManagePacking(user: PackingUser, ownerId: string) {
  return user.id === ownerId || user.role === "ADMIN" || user.role === "SUPER_ADMIN";
}

export const packingListInclude = {
  owner: { include: { profile: true } },
  packingEvent: { include: { event: true } },
  event: true,
  items: {
    include: {
      packedBy: { include: { profile: true } },
      toy: { include: { category: true } }
    },
    orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }]
  }
};

export const packingEventInclude = {
  owner: { include: { profile: true } },
  event: true,
  lists: {
    include: {
      owner: { include: { profile: true } },
      items: { include: { toy: true } }
    },
    orderBy: [{ sortOrder: "asc" as const }, { title: "asc" as const }]
  }
};

function toyImage(toy: { imageUrl: string | null }) {
  return toy.imageUrl || "/toy-placeholder.svg";
}

export function serializePackingList(list: any, user?: PackingUser) {
  const total = list.items?.length || 0;
  const packed = (list.items || []).filter((item: any) => item.packed).length;
  return {
    id: list.id,
    title: list.title,
    slug: list.slug,
    href: `/packing/${list.slug}`,
    note: list.note,
    visibility: list.visibility,
    canManage: user ? canManagePacking(user, list.ownerId) : false,
    owner: {
      id: list.owner.id,
      displayName: userDisplayName(list.owner)
    },
    packingEvent: list.packingEvent ? {
      id: list.packingEvent.id,
      title: list.packingEvent.title,
      slug: list.packingEvent.slug,
      href: `/packing?packingEvent=${list.packingEvent.id}`,
      startsAt: list.packingEvent.startsAt?.toISOString() || null,
      event: list.packingEvent.event ? {
        id: list.packingEvent.event.id,
        title: list.packingEvent.event.title,
        startsAt: list.packingEvent.event.startsAt.toISOString()
      } : null
    } : null,
    event: list.event ? {
      id: list.event.id,
      title: list.event.title,
      startsAt: list.event.startsAt.toISOString(),
      location: list.event.location
    } : null,
    progress: {
      total,
      packed,
      open: total - packed,
      percent: total ? Math.round((packed / total) * 100) : 0
    },
    items: (list.items || []).map((item: any) => ({
      id: item.id,
      quantity: item.quantity,
      note: item.note,
      packed: item.packed,
      packedAt: item.packedAt?.toISOString() || null,
      packedBy: item.packedBy ? { id: item.packedBy.id, displayName: userDisplayName(item.packedBy) } : null,
      toy: {
        id: item.toy.id,
        title: item.toy.title,
        slug: item.toy.slug,
        href: `/toys/${item.toy.slug}`,
        imageUrl: toyImage(item.toy),
        category: item.toy.category ? { id: item.toy.category.id, name: item.toy.category.name } : null
      }
    }))
  };
}

export function serializePackingEvent(packingEvent: any, user?: PackingUser) {
  const lists = packingEvent.lists || [];
  const totalItems = lists.reduce((sum: number, list: any) => sum + (list.items?.length || 0), 0);
  const packedItems = lists.reduce((sum: number, list: any) => sum + (list.items || []).filter((item: any) => item.packed).length, 0);
  return {
    id: packingEvent.id,
    title: packingEvent.title,
    slug: packingEvent.slug,
    description: packingEvent.description,
    location: packingEvent.location,
    startsAt: packingEvent.startsAt?.toISOString() || null,
    visibility: packingEvent.visibility,
    canManage: user ? canManagePacking(user, packingEvent.ownerId) : false,
    owner: { id: packingEvent.owner.id, displayName: userDisplayName(packingEvent.owner) },
    event: packingEvent.event ? {
      id: packingEvent.event.id,
      title: packingEvent.event.title,
      startsAt: packingEvent.event.startsAt.toISOString(),
      location: packingEvent.event.location
    } : null,
    progress: {
      lists: lists.length,
      total: totalItems,
      packed: packedItems,
      open: totalItems - packedItems,
      percent: totalItems ? Math.round((packedItems / totalItems) * 100) : 0
    },
    lists: lists.map((list: any) => ({
      id: list.id,
      title: list.title,
      slug: list.slug,
      href: `/packing/${list.slug}`,
      total: list.items?.length || 0,
      packed: (list.items || []).filter((item: any) => item.packed).length
    }))
  };
}
