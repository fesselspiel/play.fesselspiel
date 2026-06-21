const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "playplaner" },
    update: {},
    create: {
      slug: "playplaner",
      name: "Playplaner",
      headline: "Private Planung für Paare und Kreise",
      description: "Geschützte Seite für Planung, Bilder, Tracker und Telegram."
    }
  });
  for (const [hostname, primary] of [["playplaner.com", true], ["play.fesselspiel.com", false]]) {
    await prisma.tenantDomain.upsert({
      where: { hostname },
      update: { tenantId: tenant.id, active: true, primary },
      create: { tenantId: tenant.id, hostname, active: true, primary }
    });
  }
  const features = [
    "positions",
    "toys",
    "media",
    "activities",
    "selfBondage",
    "trackers",
    "tracker.segufix",
    "tracker.kg",
    "telegram",
    "externalApi",
    "email",
    "dataTransfer",
    "auditLog"
  ];
  for (const key of features) {
    await prisma.tenantFeature.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key } },
      update: {},
      create: { tenantId: tenant.id, key, enabled: true }
    });
  }

  const email = process.env.ADMIN_EMAIL || "admin@fesselspiel.com";
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "bitte_ändern";
  const passwordHash = await bcrypt.hash(password, 12);
  const adminRole = process.env.ADMIN_IS_SUPER_ADMIN === "false" ? "ADMIN" : "SUPER_ADMIN";

  const admin = await prisma.user.upsert({
    where: { email },
    update: { tenantId: tenant.id, username, role: adminRole, active: true },
    create: { tenantId: tenant.id, email, username, name: "Admin", passwordHash, role: adminRole }
  });

  await prisma.profile.upsert({
    where: { userId: admin.id },
    update: {},
    create: {
      userId: admin.id,
      displayName: "Fesselspiel",
      bio: "Privater Raum für Planung, Kommunikation und Dokumentation.",
      imageUrl: "",
      fields: { beziehungsform: "Paar", notizen: "Eigene Profilfelder frei anpassbar" }
    }
  });

  await prisma.userSettings.upsert({
    where: { userId: admin.id },
    update: {},
    create: { userId: admin.id }
  });

  await Promise.all([
    prisma.user.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } }),
    prisma.circle.updateMany({ where: { tenantId: null }, data: { tenantId: tenant.id } })
  ]);

  const segufixType = await prisma.trackerType.upsert({
    where: { tenantId_key: { tenantId: tenant.id, key: "segufix" } },
    update: {
      title: "Segufix Time Tracker",
      color: "#E30613",
      enabled: true
    },
    create: {
      tenantId: tenant.id,
      key: "segufix",
      title: "Segufix Time Tracker",
      description: "Sessions mit Stimmung, Dauer und Begleitnotiz dokumentieren.",
      color: "#E30613",
      icon: "shield",
      fields: [
        { key: "moodBefore", label: "Stimmung vorher", type: "select", scale: true },
        { key: "moodAfter", label: "Stimmung nachher", type: "select", scale: true }
      ]
    }
  });
  const kgType = await prisma.trackerType.upsert({
    where: { tenantId_key: { tenantId: tenant.id, key: "kg" } },
    update: {
      title: "KG Time Tracker",
      color: "#0284C7",
      enabled: true
    },
    create: {
      tenantId: tenant.id,
      key: "kg",
      title: "KG Time Tracker",
      description: "Tragezeiten minutengenau erfassen.",
      color: "#0284C7",
      icon: "timer",
      fields: []
    }
  });

  for (const session of await prisma.segufixSession.findMany()) {
    const owner = await prisma.user.findUnique({ where: { id: session.ownerId }, select: { tenantId: true } });
    await prisma.trackerEntry.upsert({
      where: { trackerTypeId_legacyType_legacyId: { trackerTypeId: segufixType.id, legacyType: "segufix", legacyId: session.id } },
      update: {},
      create: {
        tenantId: owner?.tenantId || tenant.id,
        ownerId: session.ownerId,
        trackerTypeId: segufixType.id,
        legacyType: "segufix",
        legacyId: session.id,
        slug: session.slug || slugify(`session-${session.startTime.toISOString()}`),
        title: "Segufix Session",
        startTime: session.startTime,
        endTime: session.endTime,
        durationMinutes: session.durationMinutes,
        notes: session.notes,
        fieldValues: {
          moodBefore: session.moodBefore,
          moodAfter: session.moodAfter
        }
      }
    });
  }
  for (const session of await prisma.kgSession.findMany()) {
    const owner = await prisma.user.findUnique({ where: { id: session.ownerId }, select: { tenantId: true } });
    await prisma.trackerEntry.upsert({
      where: { trackerTypeId_legacyType_legacyId: { trackerTypeId: kgType.id, legacyType: "kg", legacyId: session.id } },
      update: {},
      create: {
        tenantId: owner?.tenantId || tenant.id,
        ownerId: session.ownerId,
        trackerTypeId: kgType.id,
        legacyType: "kg",
        legacyId: session.id,
        slug: slugify(`kg-${session.startTime.toISOString()}`),
        title: "KG Tracker",
        startTime: session.startTime,
        endTime: session.endTime,
        durationMinutes: session.durationMinutes,
        notes: session.notes,
        fieldValues: {}
      }
    });
  }

  if (process.env.SEED_DEMO_DATA !== "true" || process.env.SEED_ALLOW_DEMO_RECREATE !== "true") return;

  const toyData = [
    ["Leder Manschetten", "Weiche Manschetten für ruhige Sessions.", "/toy-cuffs.svg"],
    ["Segufix System", "Dokumentierte Ausrüstung für geplante Entspannungs-Sessions.", "/toy-system.svg"]
  ];
  for (const [title, description, imageUrl] of toyData) {
    await prisma.toy.upsert({
      where: { slug: slugify(title) },
      update: {},
      create: { ownerId: admin.id, title, slug: slugify(title), description, imageUrl }
    });
  }

  const cuffs = await prisma.toy.findUnique({ where: { slug: "leder-manschetten" } });
  const system = await prisma.toy.findUnique({ where: { slug: "segufix-system" } });

  await prisma.position.upsert({
    where: { slug: "rueckenlage" },
    update: {},
    create: {
      ownerId: admin.id,
      name: "Rückenlage",
      slug: "rueckenlage",
      description: "Ruhige Position für längere Entspannungsphasen.",
      imageUrl: "/position-back.svg",
      tools: { connect: [cuffs, system].filter(Boolean).map((tool) => ({ id: tool.id })) }
    }
  });

  await prisma.activityPlan.upsert({
    where: { slug: "entspannungsabend" },
    update: {},
    create: {
      ownerId: admin.id,
      title: "Entspannungsabend",
      slug: "entspannungsabend",
      category: "Entspannung",
      note: "Sanfter Ablauf mit vorbereiteter Ausrüstung.",
      plannedAt: new Date(),
      tools: { connect: [cuffs, system].filter(Boolean).map((tool) => ({ id: tool.id })) },
      positions: { connect: [{ slug: "rueckenlage" }] }
    }
  });
}

main()
  .finally(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
