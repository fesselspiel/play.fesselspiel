import type { ContentEntry, ContentEntryAttachment, ContentSpace, FileAsset, User } from "@prisma/client";
import { accessibleOwnerIds, type AccessUser } from "@/lib/access";
import { absoluteUrl, displayName, externalFileUrl } from "@/lib/external-mobile-serializers";
import { prisma } from "@/lib/prisma";

export const LEGACY_WIKI_SPACE_ID = "legacy-wiki";
export const LEGACY_IDEAS_SPACE_ID = "legacy-ideas";
export const DEFAULT_WIKI_TEMPLATE_KEY = "wiki";
export const DEFAULT_IDEAS_TEMPLATE_KEY = "ideas";

export type ContentSpaceVisibility = "PRIVATE" | "USERS" | "CIRCLES" | "SHARED";

type SpaceWithCounts = ContentSpace & { owner: User & { profile?: { displayName?: string | null } | null }; _count?: { entries: number } };
type EntryWithRelations = ContentEntry & {
  owner: User & { profile?: { displayName?: string | null } | null };
  space?: ContentSpace | null;
  attachments: (ContentEntryAttachment & { file: FileAsset })[];
};
const defaultSpaceDefinitions = {
  [LEGACY_WIKI_SPACE_ID]: {
    name: "Tagebuch",
    kind: "default-wiki",
    templateKey: DEFAULT_WIKI_TEMPLATE_KEY,
    icon: "book-open",
    sortOrder: -20,
    sourceType: "wiki"
  },
  [LEGACY_IDEAS_SPACE_ID]: {
    name: "Ideensammlung",
    kind: "default-ideas",
    templateKey: DEFAULT_IDEAS_TEMPLATE_KEY,
    icon: "lightbulb",
    sortOrder: -10,
    sourceType: "idea"
  }
} as const;

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

function legacyAliasDefinition(spaceId: string) {
  return spaceId === LEGACY_WIKI_SPACE_ID || spaceId === LEGACY_IDEAS_SPACE_ID ? defaultSpaceDefinitions[spaceId] : null;
}

function defaultDefinitionByTemplateKey(templateKey?: string | null) {
  if (templateKey === DEFAULT_WIKI_TEMPLATE_KEY) return defaultSpaceDefinitions[LEGACY_WIKI_SPACE_ID];
  if (templateKey === DEFAULT_IDEAS_TEMPLATE_KEY) return defaultSpaceDefinitions[LEGACY_IDEAS_SPACE_ID];
  return null;
}

export function isDefaultContentSpace(space: { templateKey?: string | null; kind?: string | null }) {
  return Boolean(defaultDefinitionByTemplateKey(space.templateKey) || String(space.kind || "").startsWith("default-"));
}

function allowed(space: { ownerId: string; visibility: string; allowedUserIds?: unknown; allowedCircleIds?: unknown }, user: AccessUser) {
  if (canEditOwner(user, space.ownerId)) return true;
  if (space.visibility === "SHARED") return true;
  if (space.visibility === "USERS") return stringArray(space.allowedUserIds).includes(user.id);
  if (space.visibility === "CIRCLES") return Boolean(user.circleId && stringArray(space.allowedCircleIds).includes(user.circleId));
  return false;
}

export async function contentSpaceAccess(user: AccessUser, spaceId: string) {
  const legacyDefault = await contentSpaceFromAlias(user, spaceId);
  if (legacyDefault) return { space: legacyDefault };
  const excludedOwnerIds = await blockedContentOwnerIds(user);
  const space = await prisma.contentSpace.findFirst({
    where: { id: spaceId, archivedAt: null, ownerId: { notIn: excludedOwnerIds }, ...contentTenantWhere(user) },
    include: { owner: { include: { profile: true } } }
  });
  if (!space || !allowed(space, user)) return null;
  return { space };
}

export async function editableContentSpace(user: AccessUser, spaceId: string) {
  const resolved = await contentSpaceAccess(user, spaceId);
  if (!resolved || !("space" in resolved) || !resolved.space) return null;
  const { space } = resolved;
  return canEditOwner(user, space.ownerId) ? space : null;
}

export async function ensureDefaultContentSpace(user: AccessUser, alias: typeof LEGACY_WIKI_SPACE_ID | typeof LEGACY_IDEAS_SPACE_ID) {
  const definition = defaultSpaceDefinitions[alias];
  const existing = await prisma.contentSpace.findFirst({
    where: {
      ...contentTenantWhere(user),
      ownerId: user.id,
      templateKey: definition.templateKey,
      archivedAt: null
    },
    include: { owner: { include: { profile: true } }, _count: { select: { entries: true } } },
    orderBy: [{ createdAt: "asc" }]
  });
  if (existing) return existing;
  return prisma.contentSpace.create({
    data: {
      tenantId: user.tenantId || undefined,
      ownerId: user.id,
      name: definition.name,
      kind: definition.kind,
      templateKey: definition.templateKey,
      icon: definition.icon,
      sortOrder: definition.sortOrder,
      visibility: "PRIVATE",
      allowedUserIds: [],
      allowedCircleIds: []
    },
    include: { owner: { include: { profile: true } }, _count: { select: { entries: true } } }
  });
}

export async function ensureDefaultContentSpaces(user: AccessUser) {
  const [wiki, ideas] = await Promise.all([
    ensureDefaultContentSpace(user, LEGACY_WIKI_SPACE_ID),
    ensureDefaultContentSpace(user, LEGACY_IDEAS_SPACE_ID)
  ]);
  return { wiki, ideas };
}

export async function contentSpaceFromAlias(user: AccessUser, spaceId: string) {
  const definition = legacyAliasDefinition(spaceId);
  if (!definition) return null;
  return ensureDefaultContentSpace(user, spaceId as typeof LEGACY_WIKI_SPACE_ID | typeof LEGACY_IDEAS_SPACE_ID);
}

async function syncAttachment(entryId: string, ownerId: string, tenantId: string | null | undefined, fileId: string, title?: string | null) {
  const existing = await prisma.contentEntryAttachment.findFirst({ where: { entryId, fileId }, select: { id: true } });
  if (existing) return existing;
  return prisma.contentEntryAttachment.create({
    data: {
      tenantId: tenantId || undefined,
      ownerId,
      entryId,
      fileId,
      title: title || null
    }
  });
}

export async function syncLegacyContentEntriesForUser(user: AccessUser) {
  const { wiki, ideas } = await ensureDefaultContentSpaces(user);
  const [pages, ideaRows] = await Promise.all([
    prisma.wikiPage.findMany({
      where: { ...contentTenantWhere(user), ownerId: user.id },
      include: { images: { include: { file: true }, orderBy: { createdAt: "asc" } } }
    }),
    prisma.activityPlan.findMany({
      where: { ...contentTenantWhere(user), ownerId: user.id, category: "IDEA_COLLECTION" },
      include: { images: { include: { file: true }, orderBy: { createdAt: "asc" } } }
    })
  ]);

  for (const page of pages) {
    const existing = await prisma.contentEntry.findFirst({ where: { spaceId: wiki.id, sourceType: "wikiPage", sourceId: page.id } });
    const data = {
      tenantId: page.tenantId || undefined,
      ownerId: page.ownerId,
      spaceId: wiki.id,
      title: page.title,
      content: page.content,
      calendarDate: page.createdAt,
      visibility: page.visibility === "PARTNER" ? "CIRCLES" : page.visibility === "SHARED" ? "SHARED" : "PRIVATE",
      sourceType: "wikiPage",
      sourceId: page.id
    };
    const entry = existing
      ? await prisma.contentEntry.update({ where: { id: existing.id }, data })
      : await prisma.contentEntry.create({ data });
    for (const image of page.images || []) await syncAttachment(entry.id, page.ownerId, page.tenantId, image.fileId, image.title || image.file?.originalName || null);
  }

  for (const idea of ideaRows) {
    const existing = await prisma.contentEntry.findFirst({ where: { spaceId: ideas.id, sourceType: "activity", sourceId: idea.id } });
    const data = {
      tenantId: idea.tenantId || undefined,
      ownerId: idea.ownerId,
      spaceId: ideas.id,
      title: idea.title,
      content: idea.note || "",
      calendarDate: idea.plannedAt || idea.createdAt,
      visibility: "CIRCLES",
      sourceType: "activity",
      sourceId: idea.id
    };
    const entry = existing
      ? await prisma.contentEntry.update({ where: { id: existing.id }, data })
      : await prisma.contentEntry.create({ data });
    for (const image of idea.images || []) await syncAttachment(entry.id, idea.ownerId, idea.tenantId, image.fileId, image.title || image.file?.originalName || null);
  }
}

export function serializeContentSpace(request: Request, space: SpaceWithCounts, count = 0, viewer?: AccessUser) {
  const defaultDefinition = defaultDefinitionByTemplateKey(space.templateKey);
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
    canDelete: defaultDefinition ? false : viewer ? canEditOwner(viewer, space.ownerId) : false,
    entryCount: space._count?.entries ?? count,
    legacy: false,
    legacyAlias: defaultDefinition?.templateKey === DEFAULT_WIKI_TEMPLATE_KEY ? LEGACY_WIKI_SPACE_ID : defaultDefinition?.templateKey === DEFAULT_IDEAS_TEMPLATE_KEY ? LEGACY_IDEAS_SPACE_ID : null,
    sourceType: defaultDefinition?.sourceType || null,
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

export function serializeContentEntry(request: Request, entry: EntryWithRelations, viewer?: AccessUser) {
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
