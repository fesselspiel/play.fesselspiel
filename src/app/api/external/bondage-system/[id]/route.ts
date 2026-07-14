import { NextRequest, NextResponse } from "next/server";
import { bondageSystemVisibilityScope, ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { absoluteUrl } from "@/lib/external-mobile-serializers";
import { stripHtml } from "@/lib/html";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function bool(value: unknown) {
  return value === true || value === "true" || value === "1" || value === 1 || value === "on";
}

function visibility(value: unknown) {
  const raw = text(value).toUpperCase();
  if (raw === "PRIVATE" || raw === "PARTNER" || raw === "SHARED") return raw as "PRIVATE" | "PARTNER" | "SHARED";
  return null;
}

function stringArray(value: unknown) {
  if (Array.isArray(value)) return Array.from(new Set(value.map(String).map((entry) => entry.trim()).filter(Boolean)));
  if (typeof value === "string") return Array.from(new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean)));
  return [];
}

function serialize(request: Request, item: any) {
  return {
    id: item.id,
    visible: item.visible,
    visibility: item.visibility,
    sortOrder: item.sortOrder,
    showExternalLink: item.showExternalLink,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    title: item.product.title,
    slug: item.product.slug,
    handle: item.product.handle,
    vendor: item.product.vendor,
    description: stripHtml(item.product.description),
    htmlDescription: item.product.description,
    imageUrl: item.product.imageUrl,
    productUrl: item.showExternalLink ? item.product.productUrl : null,
    tags: item.product.tags,
    href: `/bondage-system/${item.product.slug}`,
    url: absoluteUrl(request, `/bondage-system/${item.product.slug}`),
    positions: item.positions.map((position: any) => ({ id: position.id, name: position.name, slug: position.slug, href: `/positions/${position.slug}`, category: position.category ? { id: position.category.id, name: position.category.name } : null })),
    activities: item.activities.map((activity: any) => ({ id: activity.id, title: activity.title, slug: activity.slug, href: `/activities/${activity.slug}` }))
  };
}

async function findItem(user: any, id: string, requireVisible = true) {
  return prisma.bondageSystemItem.findFirst({
    where: {
      tenantId: user.tenantId || undefined,
      ...(requireVisible ? { visible: true } : {}),
      OR: [{ id }, { product: { slug: id } }],
      ...bondageSystemVisibilityScope(user)
    },
    include: { product: true, positions: { include: { category: true } }, activities: true }
  });
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "shopifyBondageSystem");
  if (blocked) return blocked;
  const item = await findItem(auth.user, params.id);
  if (!item) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, item: serialize(request, item) });
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "shopifyBondageSystem");
  if (blocked) return blocked;
  if (auth.user.role !== "ADMIN" && auth.user.role !== "SUPER_ADMIN") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const existing = await findItem(auth.user, params.id, false);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const nextVisibility = body.visibility === undefined ? undefined : visibility(body.visibility);
  if (body.visibility !== undefined && !nextVisibility) return NextResponse.json({ ok: false, error: "invalid_visibility" }, { status: 400 });
  const positionIds = stringArray(body.positionIds ?? body.positions);
  const positions = positionIds.length ? await prisma.position.findMany({ where: { ...(await ownerScope(auth.user)), id: { in: positionIds } }, select: { id: true } }) : [];

  if (body.title !== undefined || body.name !== undefined || body.description !== undefined || body.htmlDescription !== undefined || body.imageUrl !== undefined) {
    await prisma.shopifyProduct.update({
      where: { id: existing.product.id },
      data: {
        ...(body.title !== undefined || body.name !== undefined ? { title: text(body.title ?? body.name) || existing.product.title } : {}),
        ...(body.description !== undefined || body.htmlDescription !== undefined ? { description: String(body.htmlDescription ?? body.description ?? "").trim() } : {}),
        ...(body.imageUrl !== undefined ? { imageUrl: text(body.imageUrl) || null } : {})
      }
    });
  }

  const item = await prisma.bondageSystemItem.update({
    where: { id: existing.id },
    data: {
      ...(body.active !== undefined || body.visible !== undefined || body.status !== undefined ? { visible: body.status !== undefined ? text(body.status).toUpperCase() !== "DISABLED" : bool(body.active ?? body.visible) } : {}),
      ...(nextVisibility ? { visibility: nextVisibility } : {}),
      ...(body.showExternalLink !== undefined ? { showExternalLink: bool(body.showExternalLink) } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: Number(body.sortOrder) || existing.sortOrder } : {}),
      ...(body.positionIds !== undefined || body.positions !== undefined ? { positions: { set: positions.map((position) => ({ id: position.id })) } } : {})
    },
    include: { product: true, positions: { include: { category: true } }, activities: true }
  });
  await logAction({ actorId: auth.user.id, action: "bondage_system_item_updated_api", entityType: "bondageSystemItem", entityId: item.id, title: `Bondage-System per API geändert: ${item.product.title}`, href: `/bondage-system/${item.product.slug}` });
  return NextResponse.json({ ok: true, item: serialize(request, item) });
}
