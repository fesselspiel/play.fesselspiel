import { accessibleOwnerIds, mediaVisibilityScope, ownerScope, type AccessUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export const ENTITY_LIKE_ANCHOR_ACTION = "entity_like_anchor";
type EntityLikeType = "media" | "trackerEntry" | "trackerQuota";

export type LikeableEntity = {
  entityType: EntityLikeType;
  entityId: string;
  ownerId: string;
  tenantId?: string | null;
  title: string;
  href: string;
};

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
  if (["trackerquota", "tracker-quota", "quota", "kontingent"].includes(raw)) return "trackerQuota";
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
    likes: [] as ReturnType<typeof serializeLikes>,
    canComment: true,
    commentCount: 0,
    comments: [] as {
      id: string;
      body: string;
      createdAt: string;
      author: { id: string; username?: string | null; displayName: string | null; imageUrl?: string | null } | null;
    }[]
  };
}

export async function entityLikeStateMap(entityType: EntityLikeType, entityIds: string[], userId: string, ensureEntities: LikeableEntity[] = []) {
  const ids = Array.from(new Set(entityIds.filter(Boolean)));
  const states = new Map<string, ReturnType<typeof emptyEntityLikeState>>();
  ids.forEach((id) => states.set(id, emptyEntityLikeState()));
  if (!ids.length) return states;
  if (ensureEntities.length) {
    const existing = await prisma.auditLog.findMany({
      where: { action: ENTITY_LIKE_ANCHOR_ACTION, entityType, entityId: { in: ids } },
      select: { entityId: true }
    });
    const existingIds = new Set(existing.map((entry) => entry.entityId).filter(Boolean));
    const missing = ensureEntities.filter((entity) => entity.entityType === entityType && ids.includes(entity.entityId) && !existingIds.has(entity.entityId));
    if (missing.length) {
      await Promise.all(missing.map((entity) => findOrCreateEntityLikeAnchor(entity)));
    }
  }
  const anchors = await prisma.auditLog.findMany({
    where: { action: ENTITY_LIKE_ANCHOR_ACTION, entityType, entityId: { in: ids } },
    include: {
      feedLikes: {
        include: { user: { include: { profile: true } } },
        orderBy: { createdAt: "asc" }
      },
      feedComments: {
        include: { author: { include: { profile: true } } },
        orderBy: { createdAt: "asc" }
      }
    }
  });
  for (const anchor of anchors) {
    const likes = serializeLikes(anchor.feedLikes, userId);
    const comments = anchor.feedComments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      author: comment.author ? {
        id: comment.author.id,
        username: comment.author.username,
        displayName: displayName(comment.author),
        imageUrl: comment.author.profile?.imageUrl || null
      } : null
    }));
    states.set(anchor.entityId || "", {
      eventId: anchor.id,
      canLike: true,
      likedByMe: anchor.feedLikes.some((like) => like.userId === userId),
      own: anchor.feedLikes.some((like) => like.userId === userId),
      likeCount: anchor.feedLikes.length,
      likes,
      canComment: true,
      commentCount: comments.length,
      comments
    });
  }
  return states;
}

export async function entityLikeState(entityType: EntityLikeType, entityId: string, userId: string) {
  return (await entityLikeStateMap(entityType, [entityId], userId)).get(entityId) || emptyEntityLikeState();
}

export async function entityLikeStateForEntity(entity: LikeableEntity, userId: string) {
  return (await entityLikeStateMap(entity.entityType, [entity.entityId], userId, [entity])).get(entity.entityId) || emptyEntityLikeState();
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
  if (entityType === "trackerQuota") {
    const [, ownerId, trackerId] = entityId.split(":");
    if (!ownerId || !trackerId) return null;
    if (!(await accessibleOwnerIds(user)).includes(ownerId)) return null;
    const trackerType = await prisma.trackerType.findFirst({
      where: {
        id: trackerId,
        enabled: true,
        AND: [
          user.tenantId ? { OR: [{ tenantId: user.tenantId }, { tenantId: null }] } : { tenantId: null }
        ]
      },
      select: { id: true, key: true, title: true, tenantId: true }
    });
    if (!trackerType) return null;
    return {
      entityType,
      entityId,
      ownerId,
      tenantId: trackerType.tenantId || user.tenantId,
      title: `Kontingent: ${trackerType.title}`,
      href: `/sessions/${trackerType.key}`
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

export async function findOrCreateEntityLikeAnchor(entity: LikeableEntity) {
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
