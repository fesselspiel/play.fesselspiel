import { mediaVisibilityScope, ownerScope, type AccessUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export const ENTITY_LIKE_ANCHOR_ACTION = "entity_like_anchor";
type EntityLikeType = "media" | "trackerEntry";

type LikeUser = {
  id: string;
  username?: string | null;
  name?: string | null;
  email?: string | null;
  profile?: { displayName?: string | null; imageUrl?: string | null } | null;
};

function displayName(user?: LikeUser | null) {
  return user?.profile?.displayName || user?.name || user?.username || user?.email || null;
}

function normalizeEntityType(value: string): EntityLikeType | null {
  const raw = value.trim().toLowerCase();
  if (["media", "image", "gallery", "bild"].includes(raw)) return "media";
  if (["tracker", "trackerentry", "tracker-entry", "history"].includes(raw)) return "trackerEntry";
  return null;
}

function serializeLikes(likes: {
  id: string;
  createdAt: Date;
  userId: string | null;
  user: LikeUser | null;
}[], userId: string) {
  return likes.map((like) => ({
    id: like.id,
    createdAt: like.createdAt.toISOString(),
    own: like.userId === userId,
    user: like.user ? {
      id: like.user.id,
      username: like.user.username,
      displayName: displayName(like.user),
      imageUrl: like.user.profile?.imageUrl || null
    } : null
  }));
}

export function emptyEntityLikeState() {
  return {
    eventId: null as string | null,
    canLike: true,
    likedByMe: false,
    own: false,
    likeCount: 0,
    likes: [] as ReturnType<typeof serializeLikes>
  };
}

export async function entityLikeStateMap(entityType: EntityLikeType, entityIds: string[], userId: string) {
  const ids = Array.from(new Set(entityIds.filter(Boolean)));
  const states = new Map<string, ReturnType<typeof emptyEntityLikeState>>();
  ids.forEach((id) => states.set(id, emptyEntityLikeState()));
  if (!ids.length) return states;
  const anchors = await prisma.auditLog.findMany({
    where: { action: ENTITY_LIKE_ANCHOR_ACTION, entityType, entityId: { in: ids } },
    include: {
      feedLikes: {
        include: { user: { include: { profile: true } } },
        orderBy: { createdAt: "asc" }
      }
    }
  });
  for (const anchor of anchors) {
    const likes = serializeLikes(anchor.feedLikes, userId);
    states.set(anchor.entityId || "", {
      eventId: anchor.id,
      canLike: true,
      likedByMe: anchor.feedLikes.some((like) => like.userId === userId),
      own: anchor.feedLikes.some((like) => like.userId === userId),
      likeCount: anchor.feedLikes.length,
      likes
    });
  }
  return states;
}

export async function entityLikeState(entityType: EntityLikeType, entityId: string, userId: string) {
  return (await entityLikeStateMap(entityType, [entityId], userId)).get(entityId) || emptyEntityLikeState();
}

export async function findLikeableEntity(user: AccessUser, rawEntityType: string, entityId: string) {
  const entityType = normalizeEntityType(rawEntityType);
  if (!entityType) return null;
  if (entityType === "media") {
    const media = await prisma.media.findFirst({
      where: { id: entityId, ...(await mediaVisibilityScope(user)) },
      select: { id: true, title: true, ownerId: true, tenantId: true }
    });
    if (!media) return null;
    return {
      entityType,
      entityId: media.id,
      ownerId: media.ownerId,
      tenantId: media.tenantId,
      title: media.title,
      href: `/media?item=${media.id}`
    };
  }
  const tracker = await prisma.trackerEntry.findFirst({
    where: { OR: [{ id: entityId }, { slug: entityId }], ...(await ownerScope(user)), trackerType: { enabled: true } },
    include: { trackerType: { select: { key: true, title: true } } }
  });
  if (!tracker) return null;
  return {
    entityType,
    entityId: tracker.id,
    ownerId: tracker.ownerId,
    tenantId: tracker.tenantId,
    title: tracker.title || tracker.trackerType.title,
    href: `/trackers/${tracker.trackerType.key}/${tracker.slug || tracker.id}`
  };
}

export async function findOrCreateEntityLikeAnchor(entity: {
  entityType: "media" | "trackerEntry";
  entityId: string;
  ownerId: string;
  title: string;
  href: string;
}) {
  const existing = await prisma.auditLog.findFirst({
    where: { action: ENTITY_LIKE_ANCHOR_ACTION, entityType: entity.entityType, entityId: entity.entityId }
  });
  if (existing) return existing;
  return prisma.auditLog.create({
    data: {
      actorId: entity.ownerId,
      action: ENTITY_LIKE_ANCHOR_ACTION,
      entityType: entity.entityType,
      entityId: entity.entityId,
      title: `Like-Anker: ${entity.title}`,
      href: entity.href,
      details: { likeAnchor: true }
    }
  });
}
