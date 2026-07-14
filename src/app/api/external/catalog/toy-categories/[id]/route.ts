import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { logAction } from "@/lib/audit";
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

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "toys");
  if (blocked) return blocked;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const name = cleanName(body.name);
  if (!name) return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });

  const existing = await prisma.catalogCategory.findFirst({
    where: { id: params.id, kind: "toy", ...tenantWhere(auth.user.tenantId) }
  });
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  try {
    const category = await prisma.catalogCategory.update({
      where: { id: existing.id },
      data: { name }
    });
    await logAction({
      actorId: auth.user.id,
      action: "toy_category_updated_api",
      entityType: "catalog_category",
      entityId: category.id,
      title: `Spielzeug-Kategorie per API geändert: ${category.name}`,
      href: "/settings/api-control",
      details: { kind: "toy", oldName: existing.name, name: category.name }
    });
    return NextResponse.json({ ok: true, item: serializeCategory(category), category: serializeCategory(category) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ ok: false, error: "category_exists" }, { status: 409 });
    }
    throw error;
  }
}
