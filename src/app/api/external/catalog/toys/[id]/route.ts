import { NextRequest, NextResponse } from "next/server";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { getOrCreateCatalogCategory } from "@/lib/catalog-categories";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { absoluteUrl } from "@/lib/external-mobile-serializers";
import { deleteOwnedFile, fileAssetUrl, fileIdFromUrl, saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function displayName(user: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null }) {
  return user.profile?.displayName || user.name || user.username || user.email || null;
}

function externalFileUrl(request: NextRequest, fileId: string) {
  return new URL(`/api/external/files/${fileId}`, request.url).toString();
}

async function requestPayload(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    return Object.fromEntries(form.entries());
  }
  return await request.json().catch(() => ({})) as Record<string, unknown>;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function booleanValue(value: unknown) {
  return value === true || value === "true" || value === "1" || value === 1 || value === "on";
}

function serializeToy(request: NextRequest, toy: any, currentUserId?: string) {
  const fileId = fileIdFromUrl(toy.imageUrl);
  const imageUrl = fileId ? externalFileUrl(request, fileId) : toy.imageUrl ? absoluteUrl(request, toy.imageUrl) : null;
  return {
    id: toy.id,
    title: toy.title,
    slug: toy.slug,
    description: toy.description,
    selfBondageCapable: toy.selfBondageCapable,
    sortOrder: toy.sortOrder,
    createdAt: toy.createdAt.toISOString(),
    updatedAt: toy.updatedAt.toISOString(),
    href: `/toys/${toy.slug}`,
    url: absoluteUrl(request, `/toys/${toy.slug}`),
    image: {
      fileId,
      url: imageUrl,
      downloadUrl: imageUrl,
      downloadUrlWithToken: null,
      requiresAuthorization: Boolean(fileId)
    },
    category: toy.category ? { id: toy.category.id, name: toy.category.name, sortOrder: toy.category.sortOrder } : { id: null, name: "Allgemein", sortOrder: 0 },
    owner: { id: toy.owner.id, username: toy.owner.username, displayName: displayName(toy.owner) },
    favorites: toy.favorites.map((favorite: any) => ({
      userId: favorite.userId,
      displayName: displayName(favorite.user),
      createdAt: favorite.createdAt.toISOString()
    })),
    isFavorite: currentUserId ? toy.favorites.some((favorite: any) => favorite.userId === currentUserId) : false,
    positions: toy.positions.map((position: any) => ({
      id: position.id,
      name: position.name,
      slug: position.slug,
      href: `/positions/${position.slug}`,
      category: position.category ? { id: position.category.id, name: position.category.name } : null
    })),
    activities: toy.activities.map((activity: any) => ({ id: activity.id, title: activity.title, slug: activity.slug, href: `/activities/${activity.slug}` }))
  };
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "toys");
  if (blocked) return blocked;

  const toy = await prisma.toy.findFirst({
    where: { ...(await ownerScope(auth.user)), OR: [{ id: params.id }, { slug: params.id }] },
    include: {
      category: true,
      owner: { include: { profile: true } },
      favorites: { include: { user: { include: { profile: true } } } },
      positions: { include: { category: true } },
      activities: true
    }
  });
  if (!toy) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    item: serializeToy(request, toy, auth.user.id)
  });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "toys");
  if (blocked) return blocked;

  const existing = await prisma.toy.findFirst({
    where: { ...(await ownerScope(auth.user)), OR: [{ id: params.id }, { slug: params.id }] },
    include: { category: true, owner: { include: { profile: true } } }
  });
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const payload = await requestPayload(request);
  const title = payload.title === undefined ? undefined : text(payload.title);
  if (title !== undefined && !title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });

  const categoryName = text(payload.categoryName) || text(payload.category) || text(payload.categoryNew);
  const requestedCategoryId = text(payload.categoryId);
  let categoryId: string | undefined;
  if (requestedCategoryId) {
    const category = await prisma.catalogCategory.findFirst({
      where: {
        id: requestedCategoryId,
        kind: "toy",
        ...(auth.user.tenantId ? { tenantId: auth.user.tenantId } : { tenantId: null })
      }
    });
    if (!category) return NextResponse.json({ ok: false, error: "category_not_found" }, { status: 404 });
    categoryId = category.id;
  } else if (categoryName) {
    categoryId = (await getOrCreateCatalogCategory("toy", auth.user.tenantId, categoryName)).id;
  }

  const uploadedFile = payload.file instanceof File && payload.file.size > 0 ? payload.file : null;
  const uploadedAsset = uploadedFile ? await saveUploadedFile(existing.ownerId, uploadedFile, auth.user.tenantId) : null;
  const previousFileId = uploadedAsset ? fileIdFromUrl(existing.imageUrl) : null;
  const imageUrl = uploadedAsset ? fileAssetUrl(uploadedAsset.id) : payload.imageUrl === undefined ? undefined : text(payload.imageUrl) || null;

  const toy = await prisma.toy.update({
    where: { id: existing.id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(payload.description !== undefined ? { description: text(payload.description) || null } : {}),
      ...(categoryId !== undefined ? { categoryId } : {}),
      ...(imageUrl !== undefined ? { imageUrl } : {}),
      ...(payload.selfBondageCapable !== undefined ? { selfBondageCapable: booleanValue(payload.selfBondageCapable) } : {})
    },
    include: {
      category: true,
      owner: { include: { profile: true } },
      favorites: { include: { user: { include: { profile: true } } } },
      positions: { include: { category: true } },
      activities: true
    }
  });

  if (previousFileId) await deleteOwnedFile(existing.ownerId, previousFileId);

  await logAction({
    actorId: auth.user.id,
    action: "toy_updated_api",
    entityType: "toy",
    entityId: toy.id,
    title: `Spielzeug per API geändert: ${toy.title}`,
    href: `/toys/${toy.slug}`,
    details: { categoryId: categoryId || existing.categoryId, imageFileId: uploadedAsset?.id || null, multipart: Boolean(uploadedAsset) }
  });

  return NextResponse.json({
    ok: true,
    item: serializeToy(request, toy, auth.user.id)
  });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "toys");
  if (blocked) return blocked;

  const existing = await prisma.toy.findFirst({
    where: { ...(await ownerScope(auth.user)), OR: [{ id: params.id }, { slug: params.id }] },
    select: { id: true, title: true, slug: true, ownerId: true, imageUrl: true }
  });
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (existing.ownerId !== auth.user.id && auth.user.role !== "ADMIN" && auth.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const previousFileId = fileIdFromUrl(existing.imageUrl);
  await prisma.toy.delete({ where: { id: existing.id } });
  if (previousFileId) await deleteOwnedFile(existing.ownerId, previousFileId);
  await logAction({
    actorId: auth.user.id,
    action: "toy_deleted_api",
    entityType: "toy",
    entityId: existing.id,
    title: `Spielzeug per API gelöscht: ${existing.title}`,
    href: "/toys"
  });
  return NextResponse.json({ ok: true, id: existing.id });
}
