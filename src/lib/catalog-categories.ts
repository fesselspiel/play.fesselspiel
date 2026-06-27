import { prisma } from "@/lib/prisma";

export type CatalogCategoryKind = "toy" | "position";

export const defaultCategoryNames: Record<CatalogCategoryKind, string> = {
  toy: "Allgemein",
  position: "Allgemein"
};

function cleanName(value: FormDataEntryValue | string | null | undefined) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

export async function getOrCreateCatalogCategory(kind: CatalogCategoryKind, tenantId?: string | null, name?: string | null) {
  const categoryName = cleanName(name) || defaultCategoryNames[kind];
  const where = tenantId
    ? { tenantId_kind_name: { tenantId, kind, name: categoryName } }
    : undefined;
  if (where) {
    return prisma.catalogCategory.upsert({
      where,
      update: {},
      create: { tenantId, kind, name: categoryName }
    });
  }
  const existing = await prisma.catalogCategory.findFirst({ where: { tenantId: null, kind, name: categoryName } });
  if (existing) return existing;
  return prisma.catalogCategory.create({ data: { tenantId: null, kind, name: categoryName } });
}

export async function categoryIdFromForm(kind: CatalogCategoryKind, tenantId: string | null | undefined, formData: FormData) {
  const newName = cleanName(formData.get("categoryNew"));
  if (newName) return (await getOrCreateCatalogCategory(kind, tenantId, newName)).id;
  const requestedId = cleanName(formData.get("categoryId"));
  if (requestedId) {
    const category = await prisma.catalogCategory.findFirst({
      where: {
        id: requestedId,
        kind,
        ...(tenantId ? { tenantId } : { tenantId: null })
      },
      select: { id: true }
    });
    if (category) return category.id;
  }
  return (await getOrCreateCatalogCategory(kind, tenantId)).id;
}

export async function catalogCategories(kind: CatalogCategoryKind, tenantId?: string | null) {
  await getOrCreateCatalogCategory(kind, tenantId);
  return prisma.catalogCategory.findMany({
    where: {
      kind,
      ...(tenantId ? { tenantId } : { tenantId: null })
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
  });
}
