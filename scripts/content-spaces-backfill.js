const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function defaultSpace(user, kind, name, icon, sortOrder, visibility) {
  const existing = await prisma.contentSpace.findFirst({
    where: { tenantId: user.tenantId, ownerId: user.id, kind, archivedAt: null },
    orderBy: { createdAt: "asc" }
  });
  if (existing) return { space: existing, created: false };
  const space = await prisma.contentSpace.create({
    data: { tenantId: user.tenantId || undefined, ownerId: user.id, name, kind, icon, sortOrder, visibility }
  });
  return { space, created: true };
}

async function apply() {
  const users = await prisma.user.findMany({ where: { active: true }, select: { id: true, tenantId: true, circleId: true } });
  let spacesCreated = 0;
  let entriesCreated = 0;
  for (const user of users) {
    const [pages, ideaItems] = await Promise.all([
      prisma.wikiPage.findMany({ where: { ownerId: user.id, ...(user.tenantId ? { tenantId: user.tenantId } : {}) }, select: { id: true, createdAt: true, visibility: true, shares: { select: { targetUserId: true, targetCircleId: true } } } }),
      prisma.activityPlan.findMany({ where: { ownerId: user.id, ...(user.tenantId ? { tenantId: user.tenantId } : {}), category: "IDEA_COLLECTION" }, select: { id: true, createdAt: true } })
    ]);
    const userIds = [...new Set(pages.flatMap((page) => page.shares.map((share) => share.targetUserId).filter(Boolean)))];
    const circleIds = [...new Set([
      ...pages.flatMap((page) => page.shares.map((share) => share.targetCircleId).filter(Boolean)),
      ...(pages.some((page) => page.visibility === "PARTNER") && user.circleId ? [user.circleId] : [])
    ])];
    const diaryVisibility = pages.some((page) => page.visibility === "SHARED") ? "SHARED" : circleIds.length ? "CIRCLES" : userIds.length ? "USERS" : "PRIVATE";
    const [diary, ideas] = await Promise.all([
      defaultSpace(user, "DIARY", "Tagebuch", "book.closed", 0, diaryVisibility),
      defaultSpace(user, "IDEAS", "Ideen", "lightbulb", 10, user.circleId ? "CIRCLES" : "PRIVATE")
    ]);
    if (diary.created) {
      if (diaryVisibility === "USERS" && userIds.length) await prisma.contentSpaceUserShare.createMany({ data: userIds.map((userId) => ({ spaceId: diary.space.id, userId })) });
      if (diaryVisibility === "CIRCLES" && circleIds.length) await prisma.contentSpaceCircleShare.createMany({ data: circleIds.map((circleId) => ({ spaceId: diary.space.id, circleId })) });
    }
    if (ideas.created && user.circleId) await prisma.contentSpaceCircleShare.create({ data: { spaceId: ideas.space.id, circleId: user.circleId } });
    spacesCreated += Number(diary.created) + Number(ideas.created);
    const result = await prisma.contentSpaceEntry.createMany({
      data: [
        ...pages.map((page) => ({ spaceId: diary.space.id, sourceType: "WIKI_PAGE", sourceId: page.id, calendarDate: page.createdAt })),
        ...ideaItems.map((idea) => ({ spaceId: ideas.space.id, sourceType: "IDEA", sourceId: idea.id, calendarDate: idea.createdAt }))
      ],
      skipDuplicates: true
    });
    entriesCreated += result.count;
  }
  console.log(JSON.stringify({ ok: true, mode: "apply", users: users.length, spacesCreated, entriesCreated }));
}

async function rollbackDefaults() {
  const defaults = await prisma.contentSpace.findMany({ where: { kind: { in: ["DIARY", "IDEAS"] } }, select: { id: true } });
  const ids = defaults.map((entry) => entry.id);
  const removedEntries = ids.length ? await prisma.contentSpaceEntry.deleteMany({ where: { spaceId: { in: ids } } }) : { count: 0 };
  const removedSpaces = ids.length ? await prisma.contentSpace.deleteMany({ where: { id: { in: ids } } }) : { count: 0 };
  console.log(JSON.stringify({ ok: true, mode: "rollback-defaults", removedSpaces: removedSpaces.count, removedMappings: removedEntries.count, legacyContentDeleted: 0 }));
}

const mode = process.argv.includes("--rollback-defaults") ? "rollback" : "apply";
(mode === "rollback" ? rollbackDefaults() : apply())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
