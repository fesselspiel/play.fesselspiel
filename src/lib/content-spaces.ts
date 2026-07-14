import type { ActivityPlan, ContentEntry, ContentEntryAttachment, ContentSpace, FileAsset, User, WikiPage } from "@prisma/client";
import { accessibleOwnerIds, ownerScope, type AccessUser } from "@/lib/access";
import { absoluteUrl, displayName, externalFileUrl } from "@/lib/external-mobile-serializers";
import { prisma } from "@/lib/prisma";
import { normalizeSlug, uniqueSlug } from "@/lib/slug";
import { uniqueWikiSlug, wikiOwnerSlug, wikiPageAccessWhere } from "@/lib/wiki";

export const LEGACY_WIKI_SPACE_ID = "legacy-wiki";
export const LEGACY_IDEAS_SPACE_ID = "legacy-ideas";

export type ContentSpaceVisibility = "PRIVATE" | "USERS" | "CIRCLES" | "SHARED";

type SpaceWithCounts = ContentSpace & { owner: User & { profile?: { displayName?: string | null } | null }; _count?: { entries: number } };
type EntryWithRelations = ContentEntry & {
  owner: User & { profile?: { displayName?: string | null } | null };
  space?: ContentSpace | null;
  attachments: (ContentEntryAttachment & { file: FileAsset })[];
};
type WikiWithRelations = WikiPage & {
  owner: User & { profile?: { displayName?: string | null } | null };
  images?: { id: string; fileId: string; title: string | null; createdAt: Date; file: FileAsset }[];
};
type IdeaWithRelations = ActivityPlan & {
  owner: User & { profile?: { displayName?: string | null } | null };
  images?: { id: string; fileId: string; title: string | null; createdAt: Date; file: FileAsset }[];
};

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export function normalizeContentVisibility(value: unknown): ContentSpaceVisibility {
  const raw = String(value || "").trim().toUpperCase();
  return raw === "USERS" || raw === "CIRCLES" || raw === "SHARED" ? raw : "PRIVATE";
}

function canEditOwner(user: AccessUser, ownerId: string) {
  return user.id === ownerId || user.role === "ADMIN" || user.role === "SUPER_ADMIN";
}

export async function blockedContentOwnerIds(user: AccessUser) {
  if (!user.tenantId) return [] as string[];
  const blocks = await prisma.userBlock.findMany({
    where: {
      tenantId: user.tenantId,
      OR: [{ blockerId: user.id }, { blockedId: user.id }]
    },
    select: { blockerId: true, blockedId: true }
  });
  return [...new Set(blocks.map((block) => block.blockerId === user.id ? block.blockedId : block.blockerId))];
}

export async function hiddenContentIds(user: AccessUser, entityType: "wikiPage" | "activity" | "contentEntry") {
  if (!user.tenantId) return [] as string[];
  const rows = await prisma.moderatedContent.findMany({
    where: { tenantId: user.tenantId, entityType, hidden: true },
    select: { entityId: true }
  });
  return rows.map((row) => row.entityId);
}

function contentTenantWhere(user: AccessUser) {
  return user.tenantId ? { tenantId: user.tenantId } : {};
}

function allowed(space: { ownerId: string; visibility: string; allowedUserIds?: unknown; allowedCircleIds?: unknown }, user: AccessUser) {
  if (canEditOwner(user, space.ownerId)) return true;
  if (space.visibility === "SHARED") return true;
  if (space.visibility === "USERS") return stringArray(space.allowedUserIds).includes(user.id);
  if (space.visibility === "CIRCLES") return Boolean(user.circleId && stringArray(space.allowedCircleIds).includes(user.circleId));
  return false;
}

export async function contentSpaceAccess(user: AccessUser, spaceId: string) {
  if (spaceId === LEGACY_WIKI_SPACE_ID || spaceId === LEGACY_IDEAS_SPACE_ID) return { legacy: spaceId as typeof LEGACY_WIKI_SPACE_ID | typeof LEGACY_IDEAS_SPACE_ID };
  const excludedOwnerIds = await blockedContentOwnerIds(user);
  const space = await prisma.contentSpace.findFirst({
    where: { id: spaceId, archivedAt: null, ownerId: { notIn: excludedOwnerIds }, ...contentTenantWhere(user) },
    include: { owner: { include: { profile: true } } }
  });
  if (!space || !allowed(space, user)) return null;
  return { space };
}

export async function editableContentSpace(user: AccessUser, spaceId: string) {
  if (spaceId === LEGACY_WIKI_SPACE_ID || spaceId === LEGACY_IDEAS_SPACE_ID) return null;
  const resolved = await contentSpaceAccess(user, spaceId);
  if (!resolved || !("space" in resolved) || !resolved.space) return null;
  const { space } = resolved;
  return canEditOwner(user, space.ownerId) ? space : null;
}

export async function legacySpaceCounts(user: AccessUser) {
  const excludedOwnerIds = await blockedContentOwnerIds(user);
  const [hiddenWikiIds, hiddenIdeaIds] = await Promise.all([
    hiddenContentIds(user, "wikiPage"),
    hiddenContentIds(user, "activity")
  ]);
  const [wikiCount, ideaCount] = await Promise.all([
    prisma.wikiPage.count({ where: { AND: [await wikiPageAccessWhere(user), { ownerId: { notIn: excludedOwnerIds } }, { id: { notIn: hiddenWikiIds } }] } }),
    prisma.activityPlan.count({ where: { AND: [await ownerScope(user), { category: "IDEA_COLLECTION" }, { ownerId: { notIn: excludedOwnerIds } }, { id: { notIn: hiddenIdeaIds } }] } })
  ]);
  return { wikiCount, ideaCount };
}

export function serializeContentSpace(request: Request, space: SpaceWithCounts | "legacy-wiki" | "legacy-ideas", count = 0, viewer?: AccessUser) {
  if (space === "legacy-wiki") {
    return {
      id: LEGACY_WIKI_SPACE_ID,
      name: "Tagebuch",
      kind: "legacy-wiki",
      templateKey: "wiki",
      icon: "book-open",
      sortOrder: -20,
      visibility: "PRIVATE",
      allowedUserIds: [],
      allowedCircleIds: [],
      canEdit: false,
      canDelete: false,
      entryCount: count,
      legacy: true,
      sourceType: "wiki",
      createdAt: null,
      updatedAt: null
    };
  }
  if (space === "legacy-ideas") {
    return {
      id: LEGACY_IDEAS_SPACE_ID,
      name: "Ideensammlung",
      kind: "legacy-ideas",
      templateKey: "ideas",
      icon: "lightbulb",
      sortOrder: -10,
      visibility: "PRIVATE",
      allowedUserIds: [],
      allowedCircleIds: [],
      canEdit: false,
      canDelete: false,
      entryCount: count,
      legacy: true,
      sourceType: "idea",
      createdAt: null,
      updatedAt: null
    };
  }
  return {
    id: space.id,
    name: space.name,
    kind: space.kind,
    templateKey: space.templateKey,
    icon: space.icon,
    sortOrder: space.sortOrder,
    visibility: normalizeContentVisibility(space.visibility),
    allowedUserIds: stringArray(space.allowedUserIds),
    allowedCircleIds: stringArray(space.allowedCircleIds),
    own: viewer ? viewer.id === space.ownerId : false,
    canEdit: viewer ? canEditOwner(viewer, space.ownerId) : false,
    canDelete: viewer ? canEditOwner(viewer, space.ownerId) : false,
    entryCount: space._count?.entries ?? count,
    legacy: false,
    sourceType: null,
    owner: {
      id: space.owner.id,
      username: space.owner.username,
      displayName: displayName(space.owner)
    },
    createdAt: space.createdAt.toISOString(),
    updatedAt: space.updatedAt.toISOString()
  };
}

function serializeAttachment(request: Request, attachment: { id: string; fileId: string; title?: string | null; createdAt: Date; file?: FileAsset }) {
  return {
    id: attachment.id,
    fileId: attachment.fileId,
    title: attachment.title || attachment.file?.originalName || null,
    url: externalFileUrl(request, attachment.fileId),
    downloadUrl: externalFileUrl(request, attachment.fileId),
    requiresAuthorization: true,
    mimeType: attachment.file?.mimeType || null,
    sizeBytes: attachment.file?.sizeBytes || null,
    createdAt: attachment.createdAt.toISOString()
  };
}

export function serializeContentEntry(request: Request, entry: EntryWithRelations | { legacyType: "wiki"; page: WikiWithRelations } | { legacyType: "idea"; idea: IdeaWithRelations }, viewer?: AccessUser) {
  if ("legacyType" in entry && entry.legacyType === "wiki") {
    const ownerSlug = wikiOwnerSlug(entry.page.owner);
    const own = viewer ? viewer.id === entry.page.ownerId : false;
    const canEdit = viewer ? canEditOwner(viewer, entry.page.ownerId) : false;
    return {
      id: `wiki:${entry.page.id}`,
      legacyId: entry.page.id,
      legacyType: "wiki",
      sourceType: "wiki",
      sourceId: entry.page.id,
      spaceId: LEGACY_WIKI_SPACE_ID,
      title: entry.page.title,
      content: entry.page.content,
      calendarDate: entry.page.createdAt.toISOString(),
      visibility: entry.page.visibility === "PARTNER" ? "CIRCLES" : entry.page.visibility === "SHARED" ? "SHARED" : "PRIVATE",
      attachments: (entry.page.images || []).map((image) => serializeAttachment(request, image)),
      href: `/wiki/${ownerSlug}/${entry.page.slug}`,
      url: absoluteUrl(request, `/wiki/${ownerSlug}/${entry.page.slug}`),
      owner: { id: entry.page.owner.id, username: entry.page.owner.username, displayName: displayName(entry.page.owner) },
      own,
      canEdit,
      canDelete: canEdit,
      canReport: Boolean(viewer && !own),
      canHide: Boolean(viewer && !own),
      createdAt: entry.page.createdAt.toISOString(),
      updatedAt: entry.page.updatedAt.toISOString()
    };
  }
  if ("legacyType" in entry && entry.legacyType === "idea") {
    const own = viewer ? viewer.id === entry.idea.ownerId : false;
    const canEdit = viewer ? canEditOwner(viewer, entry.idea.ownerId) : false;
    return {
      id: `idea:${entry.idea.id}`,
      legacyId: entry.idea.id,
      legacyType: "idea",
      sourceType: "idea",
      sourceId: entry.idea.id,
      spaceId: LEGACY_IDEAS_SPACE_ID,
      title: entry.idea.title,
      content: entry.idea.note || "",
      calendarDate: (entry.idea.plannedAt || entry.idea.createdAt).toISOString(),
      visibility: "CIRCLES",
      attachments: (entry.idea.images || []).map((image) => serializeAttachment(request, image)),
      href: `/ideas/${entry.idea.slug}`,
      url: absoluteUrl(request, `/ideas/${entry.idea.slug}`),
      owner: { id: entry.idea.owner.id, username: entry.idea.owner.username, displayName: displayName(entry.idea.owner) },
      own,
      canEdit,
      canDelete: canEdit,
      canReport: Boolean(viewer && !own),
      canHide: Boolean(viewer && !own),
      createdAt: entry.idea.createdAt.toISOString(),
      updatedAt: entry.idea.updatedAt.toISOString()
    };
  }
  const own = viewer ? viewer.id === entry.ownerId : false;
  const canEdit = viewer ? canEditContentEntry(viewer, entry, entry.space) : false;
  return {
    id: entry.id,
    spaceId: entry.spaceId,
    title: entry.title,
    content: entry.content,
    calendarDate: (entry.calendarDate || entry.createdAt).toISOString(),
    visibility: normalizeContentVisibility(entry.visibility || entry.space?.visibility),
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    attachments: entry.attachments.map((attachment) => serializeAttachment(request, attachment)),
    href: `/content-spaces/${entry.spaceId}/entries/${entry.id}`,
    url: absoluteUrl(request, `/content-spaces/${entry.spaceId}/entries/${entry.id}`),
    owner: { id: entry.owner.id, username: entry.owner.username, displayName: displayName(entry.owner) },
    own,
    canEdit,
    canDelete: canEdit,
    canReport: Boolean(viewer && !own),
    canHide: Boolean(viewer && !own),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString()
  };
}

export async function realSpacesForUser(user: AccessUser) {
  const excludedOwnerIds = await blockedContentOwnerIds(user);
  const spaces = await prisma.contentSpace.findMany({
    where: { ...contentTenantWhere(user), archivedAt: null, ownerId: { notIn: excludedOwnerIds } },
    include: { owner: { include: { profile: true } }, _count: { select: { entries: true } } },
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }]
  });
  return spaces.filter((space) => allowed(space, user));
}

export function parseEntryId(entryId: string) {
  if (entryId.startsWith("wiki:")) return { type: "wiki" as const, id: entryId.slice(5) };
  if (entryId.startsWith("idea:")) return { type: "idea" as const, id: entryId.slice(5) };
  return { type: "content" as const, id: entryId };
}

export async function createLegacyWikiEntry(user: AccessUser, title: string, content: string, visibilityValue: string) {
  const slug = await uniqueWikiSlug(user.id, user.tenantId, title, title);
  return prisma.wikiPage.create({
    data: {
      tenantId: user.tenantId || undefined,
      ownerId: user.id,
      title,
      slug,
      content,
      visibility: visibilityValue === "SHARED" ? "SHARED" : visibilityValue === "CIRCLES" ? "PARTNER" : "PRIVATE"
    },
    include: { owner: { include: { profile: true } }, images: { include: { file: true }, orderBy: { createdAt: "asc" } } }
  });
}

export async function createLegacyIdeaEntry(user: AccessUser, title: string, content: string, calendarDate?: Date | null) {
  const slug = await uniqueSlug("activityPlan", normalizeSlug(title, title), user.tenantId);
  return prisma.activityPlan.create({
    data: {
      tenantId: user.tenantId || undefined,
      ownerId: user.id,
      title,
      slug,
      category: "IDEA_COLLECTION",
      note: content,
      plannedAt: calendarDate || undefined,
      status: "PLANNED"
    },
    include: { owner: { include: { profile: true } }, images: { include: { file: true }, orderBy: { createdAt: "asc" } } }
  });
}

export async function contentEntryAccess(user: AccessUser, spaceId: string, entryId: string) {
  const resolved = await contentSpaceAccess(user, spaceId);
  if (!resolved || !("space" in resolved) || !resolved.space) return null;
  const { space } = resolved;
  const excludedOwnerIds = await blockedContentOwnerIds(user);
  const hiddenEntryIds = await hiddenContentIds(user, "contentEntry");
  const entry = await prisma.contentEntry.findFirst({
    where: {
      AND: [
        { id: entryId, spaceId: space.id, ownerId: { notIn: excludedOwnerIds }, ...contentTenantWhere(user) },
        { id: { notIn: hiddenEntryIds } }
      ]
    },
    include: { owner: { include: { profile: true } }, space: true, attachments: { include: { file: true }, orderBy: { createdAt: "asc" } } }
  });
  if (!entry) return null;
  return { entry, space };
}

export function canEditContentEntry(user: AccessUser, entry: { ownerId: string }, space?: { ownerId: string } | null) {
  return canEditOwner(user, entry.ownerId) || Boolean(space && canEditOwner(user, space.ownerId));
}
