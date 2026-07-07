import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import { defaultCategoryNames, getOrCreateCatalogCategory } from "@/lib/catalog-categories";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function cleanName(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

function serializeCategory(category: { id: string; name: string; sortOrder: number; createdAt?: Date; updatedAt?: Date }) {
  return {
    id: category.id,
    name: category.name,
    sortOrder: category.sortOrder,
    ...(category.createdAt ? { createdAt: category.createdAt.toISOString() } : {}),
    ...(category.updatedAt ? { updatedAt: category.updatedAt.toISOString() } : {})
  };
}

function tenantWhere(tenantId?: string | null) {
  return tenantId ? { tenantId } : { tenantId: null };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "toys");
  if (blocked) return blocked;

  await getOrCreateCatalogCategory("toy", auth.user.tenantId);
  const categories = await prisma.catalogCategory.findMany({
    where: {
      kind: "toy",
      ...tenantWhere(auth.user.tenantId),
      name: { not: defaultCategoryNames.toy }
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
  });

  return NextResponse.json({
    ok: true,
    items: categories.map(serializeCategory),
    categories: categories.map(serializeCategory)
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "toys");
  if (blocked) return blocked;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const name = cleanName(body.name);
  if (!name) return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });

  const category = await getOrCreateCatalogCategory("toy", auth.user.tenantId, name);
  await logAction({
    actorId: auth.user.id,
    action: "toy_category_created_api",
    entityType: "catalog_category",
    entityId: category.id,
    title: `Spielzeug-Kategorie per API angelegt: ${category.name}`,
    href: "/settings/api-control",
    details: { kind: "toy", name: category.name }
  });

  return NextResponse.json({ ok: true, item: serializeCategory(category), category: serializeCategory(category) }, { status: 201 });
}
