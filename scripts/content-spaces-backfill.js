const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const defaults = {
  wiki: {
    name: "Tagebuch",
    kind: "default-wiki",
    templateKey: "wiki",
    icon: "book-open",
    sortOrder: -20,
    visibility: "PRIVATE"
  },
  ideas: {
    name: "Ideensammlung",
    kind: "default-ideas",
    templateKey: "ideas",
    icon: "lightbulb",
    sortOrder: -10,
    visibility: "PRIVATE"
  }
};

async function ensureSpace(ownerId, tenantId, definition) {
  const existing = await prisma.contentSpace.findFirst({
    where: {
      ownerId,
      tenantId,
      templateKey: definition.templateKey,
      archivedAt: null
    },
    orderBy: { createdAt: "asc" }
  });
  if (existing) return existing;
  return prisma.contentSpace.create({
    data: {
      tenantId: tenantId || undefined,
      ownerId,
      name: definition.name,
      kind: definition.kind,
      templateKey: definition.templateKey,
      icon: definition.icon,
      sortOrder: definition.sortOrder,
      visibility: definition.visibility,
      allowedUserIds: [],
      allowedCircleIds: []
    }
  });
}

async function syncAttachment(entryId, ownerId, tenantId, fileId, title) {
  const existing = await prisma.contentEntryAttachment.findFirst({ where: { entryId, fileId }, select: { id: true } });
  if (existing) return;
  await prisma.contentEntryAttachment.create({
    data: {
      tenantId: tenantId || undefined,
      ownerId,
      entryId,
      fileId,
      title: title || null
    }
  });
}

async function syncWikiPage(page, space) {
  const existing = await prisma.contentEntry.findFirst({ where: { spaceId: space.id, sourceType: "wikiPage", sourceId: page.id } });
  const data = {
    tenantId: page.tenantId || undefined,
    ownerId: page.ownerId,
    spaceId: space.id,
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
  for (const image of page.images || []) {
    await syncAttachment(entry.id, page.ownerId, page.tenantId, image.fileId, image.title || image.file?.originalName || null);
  }
  return entry;
}

async function syncIdea(idea, space) {
  const existing = await prisma.contentEntry.findFirst({ where: { spaceId: space.id, sourceType: "activity", sourceId: idea.id } });
  const data = {
    tenantId: idea.tenantId || undefined,
    ownerId: idea.ownerId,
    spaceId: space.id,
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
  for (const image of idea.images || []) {
    await syncAttachment(entry.id, idea.ownerId, idea.tenantId, image.fileId, image.title || image.file?.originalName || null);
  }
  return entry;
}

async function main() {
  const owners = new Map();
  const wikiPages = await prisma.wikiPage.findMany({
    include: { images: { include: { file: true }, orderBy: { createdAt: "asc" } } }
  });
  const ideas = await prisma.activityPlan.findMany({
    where: { category: "IDEA_COLLECTION" },
    include: { images: { include: { file: true }, orderBy: { createdAt: "asc" } } }
  });
  for (const item of [...wikiPages, ...ideas]) owners.set(`${item.tenantId || "global"}:${item.ownerId}`, { ownerId: item.ownerId, tenantId: item.tenantId || null });

  const spaces = new Map();
  for (const owner of owners.values()) {
    const wiki = await ensureSpace(owner.ownerId, owner.tenantId, defaults.wiki);
    const ideaSpace = await ensureSpace(owner.ownerId, owner.tenantId, defaults.ideas);
    spaces.set(`${owner.tenantId || "global"}:${owner.ownerId}:wiki`, wiki);
    spaces.set(`${owner.tenantId || "global"}:${owner.ownerId}:ideas`, ideaSpace);
  }

  let wikiCount = 0;
  let ideaCount = 0;
  for (const page of wikiPages) {
    await syncWikiPage(page, spaces.get(`${page.tenantId || "global"}:${page.ownerId}:wiki`) || await ensureSpace(page.ownerId, page.tenantId || null, defaults.wiki));
    wikiCount += 1;
  }
  for (const idea of ideas) {
    await syncIdea(idea, spaces.get(`${idea.tenantId || "global"}:${idea.ownerId}:ideas`) || await ensureSpace(idea.ownerId, idea.tenantId || null, defaults.ideas));
    ideaCount += 1;
  }

  console.log(JSON.stringify({ ok: true, owners: owners.size, wikiEntries: wikiCount, ideaEntries: ideaCount }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
