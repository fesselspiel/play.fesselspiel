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
  const email = process.env.ADMIN_EMAIL || "admin@fesselspiel.com";
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "bitte_aendern";
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: { username, role: "ADMIN", active: true },
    create: { email, username, name: "Admin", passwordHash, role: "ADMIN" }
  });

  await prisma.profile.upsert({
    where: { userId: admin.id },
    update: {},
    create: {
      userId: admin.id,
      displayName: "Fesselspiel",
      bio: "Privater Raum fuer Planung, Kommunikation und Dokumentation.",
      imageUrl: "",
      fields: { beziehungsform: "Paar", notizen: "Eigene Profilfelder frei anpassbar" }
    }
  });

  await prisma.userSettings.upsert({
    where: { userId: admin.id },
    update: {},
    create: { userId: admin.id }
  });

  if (process.env.SEED_DEMO_DATA !== "true") return;

  const toyData = [
    ["Leder Manschetten", "Weiche Manschetten fuer ruhige Sessions.", "/toy-cuffs.svg"],
    ["Segufix System", "Dokumentierte Ausruestung fuer geplante Entspannungs-Sessions.", "/toy-system.svg"]
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
      name: "Rueckenlage",
      slug: "rueckenlage",
      description: "Ruhige Position fuer laengere Entspannungsphasen.",
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
      note: "Sanfter Ablauf mit vorbereiteter Ausruestung.",
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
