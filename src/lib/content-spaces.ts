import type {
  ContentSpaceKind,
  ContentSpaceVisibility,
  Prisma
} from "@prisma/client";
import { accessibleOwnerIds, type AccessUser } from "@/lib/access";
import { blockedUserIds } from "@/lib/compliance/ugc";
import { prisma } from "@/lib/prisma";

export const contentSpaceInclude = {
  owner: { include: { profile: true } },
  userShares: { select: { userId: true } },
  circleShares: { select: { circleId: true } },
  _count: { select: { entries: true } }
} satisfies Prisma.ContentSpaceInclude;

export function parseContentSpaceKind(value: unknown): ContentSpaceKind {
  const normalized = String(value || "").toUpperCase();
  return ["DIARY", "WIKI", "IDEAS", "CUSTOM"].includes(normalized)
    ? normalized as ContentSpaceKind
    : "CUSTOM";
}

export function parseContentSpaceVisibility(value: unknown): ContentSpaceVisibility {
  const normalized = String(value || "").toUpperCase();
  return ["PRIVATE", "USERS", "CIRCLES", "SHARED"].includes(normalized)
    ? normalized as ContentSpaceVisibility
    : "PRIVATE";
}

export function stringIds(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map(String).map((entry) => entry.trim()).filter(Boolean))]
    : [];
}

export async function contentSpaceAccessWhere(user: AccessUser): Promise<Prisma.ContentSpaceWhereInput> {
  const ownerIds = await accessibleOwnerIds(user);
  const tenant = user.tenantId ? { tenantId: user.tenantId } : {};
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
    return { ...tenant, ownerId: { in: ownerIds }, archivedAt: null };
  }
  const blockedOwnerIds = user.tenantId ? await blockedUserIds(user.id, user.tenantId) : [];
  return {
    ...tenant,
    archivedAt: null,
    ...(blockedOwnerIds.length ? { ownerId: { notIn: blockedOwnerIds } } : {}),
    OR: [
      { ownerId: user.id },
      { visibility: "SHARED" },
      { visibility: "USERS", userShares: { some: { userId: user.id } } },
      ...(user.circleId
        ? [{ visibility: "CIRCLES" as ContentSpaceVisibility, circleShares: { some: { circleId: user.circleId } } }]
        : [])
    ]
  };
}

export function canEditContentSpace(user: AccessUser, ownerId: string) {
  return ownerId === user.id || user.role === "ADMIN" || user.role === "SUPER_ADMIN";
}

export async function editableContentSpace(user: AccessUser, id: string) {
  return prisma.contentSpace.findFirst({
    where: {
      id,
      archivedAt: null,
      ...(user.tenantId ? { tenantId: user.tenantId } : {}),
      ...(user.role === "ADMIN" || user.role === "SUPER_ADMIN" ? {} : { ownerId: user.id })
    },
    include: contentSpaceInclude
  });
}

export function serializeContentSpace(
  space: Prisma.ContentSpaceGetPayload<{ include: typeof contentSpaceInclude }>,
  user: AccessUser
) {
  return {
    id: space.id,
    name: space.name,
    kind: space.kind,
    icon: space.icon,
    sortOrder: space.sortOrder,
    visibility: space.visibility,
    allowedUserIds: space.userShares.map((entry) => entry.userId),
    allowedCircleIds: space.circleShares.map((entry) => entry.circleId),
    entryCount: space._count.entries,
    canEdit: canEditContentSpace(user, space.ownerId),
    canDelete: canEditContentSpace(user, space.ownerId) && space.kind === "CUSTOM",
    owner: {
      id: space.owner.id,
      username: space.owner.username,
      displayName: space.owner.profile?.displayName || space.owner.name || space.owner.username || space.owner.email
    },
    createdAt: space.createdAt.toISOString(),
    updatedAt: space.updatedAt.toISOString()
  };
}

async function findOrCreateDefaultSpace(
  user: AccessUser,
  kind: "DIARY" | "IDEAS",
  name: string,
  icon: string,
  sortOrder: number,
  visibility: ContentSpaceVisibility
) {
  const existing = await prisma.contentSpace.findFirst({
    where: { tenantId: user.tenantId || null, ownerId: user.id, kind, archivedAt: null },
    orderBy: { createdAt: "asc" }
  });
  if (existing) return { space: existing, created: false };
  const space = await prisma.contentSpace.create({
    data: {
      tenantId: user.tenantId || undefined,
      ownerId: user.id,
      name,
      kind,
      icon,
      sortOrder,
      visibility
    }
  });
  return { space, created: true };
}

export async function ensureDefaultContentSpaces(user: AccessUser) {
  const [wikiPages, ideaItems] = await Promise.all([
    prisma.wikiPage.findMany({
      where: { ownerId: user.id, ...(user.tenantId ? { tenantId: user.tenantId } : {}) },
      select: { id: true, createdAt: true, visibility: true, shares: { select: { targetUserId: true, targetCircleId: true } } }
    }),
    prisma.activityPlan.findMany({ where: { ownerId: user.id, ...(user.tenantId ? { tenantId: user.tenantId } : {}), category: "IDEA_COLLECTION" }, select: { id: true, createdAt: true } })
  ]);
  const diaryUserIds = [...new Set(wikiPages.flatMap((page) => page.shares.map((share) => share.targetUserId).filter((id): id is string => Boolean(id))))];
  const diaryCircleIds = [...new Set([
    ...wikiPages.flatMap((page) => page.shares.map((share) => share.targetCircleId).filter((id): id is string => Boolean(id))),
    ...(wikiPages.some((page) => page.visibility === "PARTNER") && user.circleId ? [user.circleId] : [])
  ])];
  const diaryVisibility: ContentSpaceVisibility = wikiPages.some((page) => page.visibility === "SHARED")
    ? "SHARED"
    : diaryCircleIds.length ? "CIRCLES" : diaryUserIds.length ? "USERS" : "PRIVATE";
  const ideasVisibility: ContentSpaceVisibility = user.circleId ? "CIRCLES" : "PRIVATE";
  const [diary, ideas] = await Promise.all([
    findOrCreateDefaultSpace(user, "DIARY", "Tagebuch", "book.closed", 0, diaryVisibility),
    findOrCreateDefaultSpace(user, "IDEAS", "Ideen", "lightbulb", 10, ideasVisibility)
  ]);
  if (diary.created) await replaceContentSpaceShares(
    diary.space.id,
    user,
    diaryVisibility === "USERS" ? diaryUserIds : [],
    diaryVisibility === "CIRCLES" ? diaryCircleIds : []
  );
  if (ideas.created && user.circleId) await replaceContentSpaceShares(ideas.space.id, user, [], [user.circleId]);
  const mappings = [
    ...wikiPages.map((page) => ({ spaceId: diary.space.id, sourceType: "WIKI_PAGE" as const, sourceId: page.id, calendarDate: page.createdAt })),
    ...ideaItems.map((idea) => ({ spaceId: ideas.space.id, sourceType: "IDEA" as const, sourceId: idea.id, calendarDate: idea.createdAt }))
  ];
  if (mappings.length) await prisma.contentSpaceEntry.createMany({ data: mappings, skipDuplicates: true });
  return { diary: diary.space, ideas: ideas.space };
}

export async function replaceContentSpaceShares(
  spaceId: string,
  user: AccessUser,
  allowedUserIds: string[],
  allowedCircleIds: string[]
) {
  const [users, circles] = await Promise.all([
    allowedUserIds.length
      ? prisma.user.findMany({
          where: { id: { in: allowedUserIds }, ...(user.tenantId ? { memberships: { some: { tenantId: user.tenantId, active: true } } } : {}) },
          select: { id: true }
        })
      : [],
    allowedCircleIds.length
      ? prisma.circle.findMany({ where: { id: { in: allowedCircleIds }, ...(user.tenantId ? { tenantId: user.tenantId } : {}) }, select: { id: true } })
      : []
  ]);
  await prisma.$transaction([
    prisma.contentSpaceUserShare.deleteMany({ where: { spaceId } }),
    prisma.contentSpaceCircleShare.deleteMany({ where: { spaceId } }),
    ...(users.length ? [prisma.contentSpaceUserShare.createMany({ data: users.map((entry) => ({ spaceId, userId: entry.id })) })] : []),
    ...(circles.length ? [prisma.contentSpaceCircleShare.createMany({ data: circles.map((entry) => ({ spaceId, circleId: entry.id })) })] : [])
  ]);
}

export function legacyVisibility(value: ContentSpaceVisibility) {
  if (value === "SHARED") return "SHARED" as const;
  if (value === "CIRCLES") return "PARTNER" as const;
  return "PRIVATE" as const;
}
