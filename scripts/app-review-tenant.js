const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();
const tenantSlug = process.env.APP_REVIEW_TENANT_SLUG || "test";
const circleName = "App Review";
const marker = "app-review";

const accounts = [
  { key: "ALEX", email: "app-review-alex@playplaner.com", name: "Alex", role: "USER" },
  { key: "SAM", email: "app-review-sam@playplaner.com", name: "Sam", role: "USER" },
  { key: "ADMIN", email: "app-review-admin@playplaner.com", name: "Review Admin", role: "ADMIN" },
  { key: "DELETE", email: "app-review-delete@playplaner.com", name: "Delete Test", role: "USER" }
];

function passwordFor(account) {
  const password = process.env[`APP_REVIEW_${account.key}_PASSWORD`];
  if (!password || password.length < 12) {
    throw new Error(`APP_REVIEW_${account.key}_PASSWORD must contain at least 12 characters`);
  }
  return password;
}

async function cleanup(tenant) {
  const users = await prisma.user.findMany({
    where: { email: { in: accounts.map((account) => account.email) } },
    select: { id: true }
  });
  const userIds = users.map((user) => user.id);

  await prisma.$transaction([
    prisma.contentReport.deleteMany({
      where: {
        tenantId: tenant.id,
        OR: [
          { reporterId: { in: userIds } },
          { reportedUserId: { in: userIds } },
          { entityId: { startsWith: marker } }
        ]
      }
    }),
    prisma.trackerType.deleteMany({ where: { tenantId: tenant.id, key: { startsWith: marker } } }),
    prisma.catalogCategory.deleteMany({ where: { tenantId: tenant.id, name: { startsWith: "App Review" } } }),
    prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    prisma.circle.deleteMany({ where: { tenantId: tenant.id, name: circleName } })
  ]);
}

async function createUser(tenant, circle, account) {
  const passwordHash = await bcrypt.hash(passwordFor(account), 12);
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      circleId: account.key === "DELETE" ? null : circle.id,
      email: account.email,
      username: `${marker}-${account.key.toLowerCase()}`,
      name: account.name,
      passwordHash,
      role: account.role,
      active: true,
      emailVerifiedAt: new Date()
    }
  });

  await prisma.profile.create({
    data: {
      userId: user.id,
      displayName: account.name,
      bio: account.key === "DELETE" ? "Konto zum Pruefen der Kontoloeschung." : "Privater App-Review-Testzugang."
    }
  });
  await prisma.userSettings.create({
    data: { userId: user.id, notificationPreviewMode: "DISCREET" }
  });
  await prisma.tenantMembership.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      circleId: account.key === "DELETE" ? null : circle.id,
      role: account.role,
      active: true
    }
  });

  const documents = await prisma.legalDocument.findMany({
    where: { tenantId: tenant.id, active: true, required: true },
    select: { id: true }
  });
  if (documents.length) {
    await prisma.userLegalAcceptance.createMany({
      data: documents.map((document) => ({ userId: user.id, documentId: document.id, source: "APP_REVIEW_SEED" })),
      skipDuplicates: true
    });
  }
  return user;
}

async function seed() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) throw new Error(`Tenant ${tenantSlug} does not exist`);

  await cleanup(tenant);
  const circle = await prisma.circle.create({ data: { tenantId: tenant.id, name: circleName } });
  const created = {};
  for (const account of accounts) created[account.key] = await createUser(tenant, circle, account);

  const toyCategory = await prisma.catalogCategory.create({
    data: { tenantId: tenant.id, kind: "TOY", name: "App Review Ausruestung", sortOrder: 900 }
  });
  const sceneCategory = await prisma.catalogCategory.create({
    data: { tenantId: tenant.id, kind: "POSITION", name: "App Review Planung", sortOrder: 900 }
  });
  const bag = await prisma.toy.create({
    data: {
      tenantId: tenant.id,
      categoryId: toyCategory.id,
      ownerId: created.ALEX.id,
      title: "Reisetasche",
      slug: `${marker}-reisetasche`,
      description: "Gemeinsame Ausruestung fuer einen Ausflug.",
      imageUrl: "/toy-placeholder.svg"
    }
  });
  await prisma.toy.create({
    data: {
      tenantId: tenant.id,
      categoryId: toyCategory.id,
      ownerId: created.SAM.id,
      title: "Picknickdecke",
      slug: `${marker}-picknickdecke`,
      imageUrl: "/toy-placeholder.svg"
    }
  });
  const scene = await prisma.position.create({
    data: {
      tenantId: tenant.id,
      categoryId: sceneCategory.id,
      ownerId: created.ALEX.id,
      name: "Gemeinsamer Abend",
      slug: `${marker}-gemeinsamer-abend`,
      description: "Eine ruhige gemeinsame Planung.",
      imageUrl: "/position-placeholder.svg"
    }
  });
  await prisma.position.create({
    data: {
      tenantId: tenant.id,
      categoryId: sceneCategory.id,
      ownerId: created.SAM.id,
      name: "Ausflug planen",
      slug: `${marker}-ausflug-planen`,
      imageUrl: "/position-placeholder.svg"
    }
  });

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await prisma.activityPlan.create({
    data: {
      tenantId: tenant.id,
      ownerId: created.ALEX.id,
      title: "Abend gemeinsam planen",
      slug: `${marker}-abend-planen`,
      note: "Bitte bestätigen oder eine andere Zeit vorschlagen.",
      plannedAt: tomorrow,
      status: "REQUESTED",
      consentStatus: "PROPOSED",
      tools: { connect: [{ id: bag.id }] },
      positions: { connect: [{ id: scene.id }] }
    }
  });
  await prisma.activityPlan.create({
    data: {
      tenantId: tenant.id,
      ownerId: created.SAM.id,
      title: "Museum besuchen",
      slug: `${marker}-museum`,
      plannedAt: nextWeek,
      status: "PLANNED",
      consentStatus: "ACCEPTED",
      consentVersion: 1,
      acceptedVersion: 1,
      consentUpdatedAt: now
    }
  });

  const tracker = await prisma.trackerType.create({
    data: {
      tenantId: tenant.id,
      key: `${marker}-gemeinsame-zeit`,
      title: "Gemeinsame Zeit",
      description: "Neutrale Beispielzeit fuer App Review.",
      color: "#2F80ED",
      icon: "clock",
      allowOpenSession: true
    }
  });
  await prisma.trackerEntry.createMany({
    data: [
      {
        tenantId: tenant.id,
        ownerId: created.ALEX.id,
        trackerTypeId: tracker.id,
        slug: `${marker}-zeit-heute`,
        title: "Gemeinsamer Spaziergang",
        startTime: new Date(now.getTime() - 45 * 60 * 1000),
        endTime: now,
        durationMinutes: 45
      },
      {
        tenantId: tenant.id,
        ownerId: created.SAM.id,
        trackerTypeId: tracker.id,
        slug: `${marker}-zeit-gestern`,
        title: "Gemeinsames Kochen",
        startTime: new Date(now.getTime() - 25 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        durationMinutes: 60
      }
    ]
  });

  await prisma.circleChatMessage.createMany({
    data: [
      { tenantId: tenant.id, circleId: circle.id, senderId: created.ALEX.id, body: "Passt der gemeinsame Abend morgen?" },
      { tenantId: tenant.id, circleId: circle.id, senderId: created.SAM.id, body: "Ja, ich freue mich. Ich bestätige gleich die Anfrage." }
    ]
  });
  await prisma.wikiPage.create({
    data: {
      tenantId: tenant.id,
      ownerId: created.ALEX.id,
      title: "Reisetagebuch",
      slug: `${marker}-reisetagebuch`,
      summary: "Neutrales Tagebuch fuer App Review.",
      content: "Heute haben wir gemeinsam den naechsten Ausflug geplant.",
      visibility: "PARTNER",
      shares: { create: { targetCircleId: circle.id } }
    }
  });
  await prisma.media.create({
    data: {
      tenantId: tenant.id,
      ownerId: created.ALEX.id,
      title: "Ausflugsplanung",
      kind: "IMAGE",
      url: "/toy-placeholder.svg",
      visibility: "PARTNER",
      contentClassification: "SAFE",
      showInCalendar: true,
      calendarDate: now
    }
  });
  await prisma.contentReport.create({
    data: {
      tenantId: tenant.id,
      reporterId: created.ALEX.id,
      reportedUserId: created.SAM.id,
      entityType: "toy",
      entityId: bag.id,
      reason: "OTHER",
      details: "Harmloser Testfall fuer den Moderationsablauf.",
      priority: "NORMAL"
    }
  });

  console.log(JSON.stringify({ ok: true, tenant: tenant.slug, circle: circle.name, accounts: accounts.map(({ key, email, name, role }) => ({ key, email, name, role })) }));
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) throw new Error(`Tenant ${tenantSlug} does not exist`);
  if (process.argv.includes("--cleanup")) {
    await cleanup(tenant);
    console.log(JSON.stringify({ ok: true, cleaned: tenant.slug }));
    return;
  }
  await seed();
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
