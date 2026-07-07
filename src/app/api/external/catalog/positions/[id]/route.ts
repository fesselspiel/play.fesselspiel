import { NextRequest, NextResponse } from "next/server";
import { ownerScope } from "@/lib/access";
import { tokenFromRequest } from "@/lib/api-tokens";
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

function externalFileUrl(request: NextRequest, fileId: string, token?: string) {
  const url = new URL(`/api/external/files/${fileId}`, request.url);
  if (token) url.searchParams.set("token", token);
  return url.toString();
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

function serializePosition(request: NextRequest, position: any, tokenForDownloadUrl = "", currentUserId?: string) {
  const fileId = fileIdFromUrl(position.imageUrl);
  const imageUrl = fileId ? externalFileUrl(request, fileId) : position.imageUrl ? absoluteUrl(request, position.imageUrl) : null;
  return {
    id: position.id,
    name: position.name,
    title: position.name,
    slug: position.slug,
    description: position.description,
    selfBondageCapable: position.selfBondageCapable,
    sortOrder: position.sortOrder,
    createdAt: position.createdAt.toISOString(),
    updatedAt: position.updatedAt.toISOString(),
    href: `/positions/${position.slug}`,
    url: absoluteUrl(request, `/positions/${position.slug}`),
    image: {
      fileId,
      url: imageUrl,
      downloadUrl: imageUrl,
      downloadUrlWithToken: fileId && tokenForDownloadUrl ? externalFileUrl(request, fileId, tokenForDownloadUrl) : null,
      requiresAuthorization: Boolean(fileId && !tokenForDownloadUrl)
    },
    category: position.category ? { id: position.category.id, name: position.category.name, sortOrder: position.category.sortOrder } : { id: null, name: "Allgemein", sortOrder: 0 },
    owner: { id: position.owner.id, username: position.owner.username, displayName: displayName(position.owner) },
    favorites: position.favorites.map((favorite: any) => ({
      userId: favorite.userId,
      displayName: displayName(favorite.user),
      createdAt: favorite.createdAt.toISOString()
    })),
    isFavorite: currentUserId ? position.favorites.some((favorite: any) => favorite.userId === currentUserId) : false,
    toys: position.tools.map((toy: any) => ({
      id: toy.id,
      title: toy.title,
      slug: toy.slug,
      href: `/toys/${toy.slug}`,
      category: toy.category ? { id: toy.category.id, name: toy.category.name } : null
    })),
    bondageSystemItems: position.bondageSystemItems.map((item: any) => ({ id: item.id, title: item.product.title, slug: item.product.slug, href: `/bondage-system/${item.product.slug}` })),
    activities: position.activities.map((activity: any) => ({ id: activity.id, title: activity.title, slug: activity.slug, href: `/activities/${activity.slug}` }))
  };
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "positions");
  if (blocked) return blocked;

  const token = request.nextUrl.searchParams.get("token") || "";
  const tokenForDownloadUrl = token && token === tokenFromRequest(request) ? token : "";
  const position = await prisma.position.findFirst({
    where: { ...(await ownerScope(auth.user)), OR: [{ id: params.id }, { slug: params.id }] },
    include: {
      category: true,
      owner: { include: { profile: true } },
      favorites: { include: { user: { include: { profile: true } } } },
      tools: { include: { category: true } },
      activities: true,
      bondageSystemItems: { include: { product: true } }
    }
  });
  if (!position) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    item: serializePosition(request, position, tokenForDownloadUrl, auth.user.id)
  });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "positions");
  if (blocked) return blocked;

  const existing = await prisma.position.findFirst({
    where: { ...(await ownerScope(auth.user)), OR: [{ id: params.id }, { slug: params.id }] },
    include: { category: true, owner: { include: { profile: true } } }
  });
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const payload = await requestPayload(request);
  const name = payload.name === undefined && payload.title === undefined ? undefined : text(payload.name ?? payload.title);
  if (name !== undefined && !name) return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });

  const categoryName = text(payload.categoryName) || text(payload.category) || text(payload.categoryNew);
  const requestedCategoryId = text(payload.categoryId);
  let categoryId: string | undefined;
  if (requestedCategoryId) {
    const category = await prisma.catalogCategory.findFirst({
      where: {
        id: requestedCategoryId,
        kind: "position",
        ...(auth.user.tenantId ? { tenantId: auth.user.tenantId } : { tenantId: null })
      }
    });
    if (!category) return NextResponse.json({ ok: false, error: "category_not_found" }, { status: 404 });
    categoryId = category.id;
  } else if (categoryName) {
    categoryId = (await getOrCreateCatalogCategory("position", auth.user.tenantId, categoryName)).id;
  }

  const uploadedFile = payload.file instanceof File && payload.file.size > 0 ? payload.file : null;
  const uploadedAsset = uploadedFile ? await saveUploadedFile(existing.ownerId, uploadedFile, auth.user.tenantId) : null;
  const previousFileId = uploadedAsset ? fileIdFromUrl(existing.imageUrl) : null;
  const imageUrl = uploadedAsset ? fileAssetUrl(uploadedAsset.id) : payload.imageUrl === undefined ? undefined : text(payload.imageUrl) || null;

  const position = await prisma.position.update({
    where: { id: existing.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(payload.description !== undefined ? { description: text(payload.description) || null } : {}),
      ...(categoryId !== undefined ? { categoryId } : {}),
      ...(imageUrl !== undefined ? { imageUrl } : {}),
      ...(payload.selfBondageCapable !== undefined ? { selfBondageCapable: booleanValue(payload.selfBondageCapable) } : {})
    },
    include: {
      category: true,
      owner: { include: { profile: true } },
      favorites: { include: { user: { include: { profile: true } } } },
      tools: { include: { category: true } },
      activities: true,
      bondageSystemItems: { include: { product: true } }
    }
  });

  if (previousFileId) await deleteOwnedFile(existing.ownerId, previousFileId);

  await logAction({
    actorId: auth.user.id,
    action: "position_updated_api",
    entityType: "position",
    entityId: position.id,
    title: `Szene per API geändert: ${position.name}`,
    href: `/positions/${position.slug}`,
    details: { categoryId: categoryId || existing.categoryId, imageFileId: uploadedAsset?.id || null, multipart: Boolean(uploadedAsset) }
  });

  return NextResponse.json({
    ok: true,
    item: serializePosition(request, position, "", auth.user.id)
  });
}
