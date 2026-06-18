import { prisma } from "@/lib/prisma";

export function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function normalizeSlug(value: string, fallback: string) {
  return slugify(value || fallback) || "eintrag";
}

export async function uniqueSlug(kind: "toy" | "position" | "activityPlan", base: string) {
  let slug = normalizeSlug(base, "eintrag");
  let counter = 2;
  while (true) {
    const existing =
      kind === "toy"
        ? await prisma.toy.findUnique({ where: { slug } })
        : kind === "position"
          ? await prisma.position.findUnique({ where: { slug } })
          : await prisma.activityPlan.findUnique({ where: { slug } });
    if (!existing) return slug;
    slug = `${normalizeSlug(base, "eintrag")}-${counter++}`;
  }
}

export async function uniqueSlugForUpdate(kind: "toy" | "position" | "activityPlan", base: string, currentId: string) {
  let slug = normalizeSlug(base, "eintrag");
  let counter = 2;
  while (true) {
    const existing =
      kind === "toy"
        ? await prisma.toy.findUnique({ where: { slug } })
        : kind === "position"
          ? await prisma.position.findUnique({ where: { slug } })
          : await prisma.activityPlan.findUnique({ where: { slug } });
    if (!existing || existing.id === currentId) return slug;
    slug = `${normalizeSlug(base, "eintrag")}-${counter++}`;
  }
}
