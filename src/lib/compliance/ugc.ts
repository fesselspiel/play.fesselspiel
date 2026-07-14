import type { AccessUser } from "@/lib/access";
import { mediaVisibilityScope, ownerScope } from "@/lib/access";
import { accessibleCircleChats } from "@/lib/circle-chat";
import { prisma } from "@/lib/prisma";
import { wikiPageAccessWhere } from "@/lib/wiki";
import { contentEntryAccess } from "@/lib/content-spaces";

export async function blockedUserIds(userId: string, tenantId: string) {
  const blocks = await prisma.userBlock.findMany({
    where: {
      tenantId,
      OR: [{ blockerId: userId }, { blockedId: userId }]
    },
    select: { blockerId: true, blockedId: true }
  });
  return [...new Set(blocks.map((block) => block.blockerId === userId ? block.blockedId : block.blockerId))];
}

export async function usersAreBlocked(tenantId: string, firstUserId: string, secondUserId: string) {
  if (firstUserId === secondUserId) return false;
  return Boolean(await prisma.userBlock.findFirst({
    where: {
      tenantId,
      OR: [
        { blockerId: firstUserId, blockedId: secondUserId },
        { blockerId: secondUserId, blockedId: firstUserId }
      ]
    },
    select: { id: true }
  }));
}

export async function hiddenEntityIds(tenantId: string, entityType: string) {
  const rows = await prisma.moderatedContent.findMany({
    where: { tenantId, entityType, hidden: true },
    select: { entityId: true }
  });
  return rows.map((row) => row.entityId);
}

export async function contentIsHidden(tenantId: string, entityType: string, entityId: string) {
  return Boolean(await prisma.moderatedContent.findFirst({
    where: { tenantId, entityType, entityId, hidden: true },
    select: { id: true }
  }));
}

export async function resolveReportTarget(input: {
  user: AccessUser;
  entityType: string;
  entityId: string;
}) {
  if (!input.user.tenantId) return null;
  const tenantId = input.user.tenantId;
  const type = input.entityType.trim().toLowerCase();
  const scope = { id: input.entityId, tenantId };
  if (["chat", "chatmessage", "circlechatmessage"].includes(type)) {
    const circleIds = (await accessibleCircleChats(input.user)).map((circle) => circle.id);
    const item = await prisma.circleChatMessage.findFirst({
      where: { ...scope, circleId: { in: circleIds }, deletedAt: null },
      select: { id: true, senderId: true }
    });
    return item ? { entityType: "circleChatMessage", entityId: item.id, reportedUserId: item.senderId } : null;
  }
  if (["media", "image", "video"].includes(type)) {
    const item = await prisma.media.findFirst({
      where: { AND: [{ id: input.entityId }, await mediaVisibilityScope(input.user)] },
      select: { id: true, ownerId: true }
    });
    return item ? { entityType: "media", entityId: item.id, reportedUserId: item.ownerId } : null;
  }
  if (["toy", "equipment"].includes(type)) {
    const item = await prisma.toy.findFirst({ where: { id: input.entityId, ...(await ownerScope(input.user)) }, select: { id: true, ownerId: true } });
    return item ? { entityType: "toy", entityId: item.id, reportedUserId: item.ownerId } : null;
  }
  if (["scene", "position"].includes(type)) {
    const item = await prisma.position.findFirst({ where: { id: input.entityId, ...(await ownerScope(input.user)) }, select: { id: true, ownerId: true } });
    return item ? { entityType: "position", entityId: item.id, reportedUserId: item.ownerId } : null;
  }
  if (["activity", "session", "order", "idea"].includes(type)) {
    const item = await prisma.activityPlan.findFirst({ where: { id: input.entityId, ...(await ownerScope(input.user)) }, select: { id: true, ownerId: true } });
    return item ? { entityType: "activity", entityId: item.id, reportedUserId: item.ownerId } : null;
  }
  if (["wiki", "diary", "wikipage"].includes(type)) {
    const item = await prisma.wikiPage.findFirst({
      where: { AND: [{ id: input.entityId }, await wikiPageAccessWhere(input.user)] },
      select: { id: true, ownerId: true }
    });
    return item ? { entityType: "wikiPage", entityId: item.id, reportedUserId: item.ownerId } : null;
  }
  if (["profile", "user"].includes(type)) {
    const item = await prisma.user.findFirst({
      where: { id: input.entityId, memberships: { some: { tenantId, active: true } } },
      select: { id: true }
    });
    return item ? { entityType: "profile", entityId: item.id, reportedUserId: item.id } : null;
  }
  if (type === "activitycomment") {
    const item = await prisma.activityComment.findFirst({
      where: { id: input.entityId, activity: await ownerScope(input.user) },
      select: { id: true, ownerId: true }
    });
    return item ? { entityType: "activityComment", entityId: item.id, reportedUserId: item.ownerId } : null;
  }
  if (type === "mediacomment") {
    const item = await prisma.mediaComment.findFirst({
      where: { id: input.entityId, media: await mediaVisibilityScope(input.user) },
      select: { id: true, ownerId: true }
    });
    return item ? { entityType: "mediaComment", entityId: item.id, reportedUserId: item.ownerId } : null;
  }
  if (type === "sessioncomment") {
    const item = await prisma.sessionComment.findFirst({
      where: { id: input.entityId, session: await ownerScope(input.user) },
      select: { id: true, ownerId: true }
    });
    return item ? { entityType: "sessionComment", entityId: item.id, reportedUserId: item.ownerId } : null;
  }
  if (type === "contententry") {
    const item = await prisma.contentEntry.findFirst({
      where: { id: input.entityId, tenantId },
      select: { id: true, spaceId: true }
    });
    if (!item) return null;
    const resolved = await contentEntryAccess(input.user, item.spaceId, item.id);
    return resolved ? { entityType: "contentEntry", entityId: resolved.entry.id, reportedUserId: resolved.entry.ownerId } : null;
  }
  return null;
}
