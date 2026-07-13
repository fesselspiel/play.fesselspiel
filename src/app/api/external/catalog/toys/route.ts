import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { getOrCreateCatalogCategory } from "@/lib/catalog-categories";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { featureEnabled } from "@/lib/features";
import { fileAssetUrl, fileIdFromUrl, saveUploadedFile } from "@/lib/files";
import { blockedUserIds, hiddenEntityIds } from "@/lib/compliance/ugc";
import { prisma } from "@/lib/prisma";
import { normalizeSlug, uniqueSlug } from "@/lib/slug";

export const runtime = "nodejs";

function displayName(user: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null }) {
  return user.profile?.displayName || user.name || user.username || user.email || null;
}

function absoluteUrl(request: NextRequest, path: string) {
  return new URL(path, request.url).toString();
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

function stringArray(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((entry) => entry.trim()).filter(Boolean);
  const raw = text(value);
  if (!raw) return [];
  return raw.split(",").map((entry) => entry.trim()).filter(Boolean);
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "toys");
  if (blocked) return blocked;

  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 100)));
  const cursor = searchParams.get("cursor") || undefined;
  const q = String(searchParams.get("q") || "").trim();
  const categoryId = String(searchParams.get("categoryId") || "").trim();
  const positionId = String(searchParams.get("positionId") || "").trim();
  const includeRelations = searchParams.get("includeRelations") !== "0";
  const [blockedOwnerIds, hiddenToyIds] = auth.user.tenantId
    ? await Promise.all([blockedUserIds(auth.user.id, auth.user.tenantId), hiddenEntityIds(auth.user.tenantId, "toy")])
    : [[], []];

  const where: Prisma.ToyWhereInput = {
    AND: [
      await ownerScope(auth.user),
      ...(blockedOwnerIds.length ? [{ ownerId: { notIn: blockedOwnerIds } }] : []),
      ...(hiddenToyIds.length ? [{ id: { notIn: hiddenToyIds } }] : [])
    ],
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(positionId ? { positions: { some: { id: positionId } } } : {})
  };
  const toys = await prisma.toy.findMany({
    where,
    include: {
      category: true,
      owner: { include: { profile: true } },
      favorites: { include: { user: { include: { profile: true } } } },
      positions: true,
      activities: true
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { title: "asc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  });
  const pageItems = toys.slice(0, limit);
  const nextCursor = toys.length > limit ? toys[limit].id : null;

  return NextResponse.json({
    ok: true,
    nextCursor,
    count: pageItems.length,
    items: pageItems.map((toy) => {
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
        favorites: toy.favorites.map((favorite) => ({
          userId: favorite.userId,
          displayName: displayName(favorite.user),
          createdAt: favorite.createdAt.toISOString()
        })),
        isFavorite: toy.favorites.some((favorite) => favorite.userId === auth.user.id),
        positions: includeRelations ? toy.positions.map((position) => ({ id: position.id, name: position.name, slug: position.slug, href: `/positions/${position.slug}` })) : undefined,
        activities: includeRelations ? toy.activities.map((activity) => ({ id: activity.id, title: activity.title, slug: activity.slug, href: `/activities/${activity.slug}` })) : undefined
      };
    })
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "toys");
  if (blocked) return blocked;

  const payload = await requestPayload(request);
  const title = text(payload.title);
  if (!title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });

  const categoryName = text(payload.categoryName) || text(payload.category) || text(payload.categoryNew);
  const requestedCategoryId = text(payload.categoryId);
  const category = requestedCategoryId
    ? await prisma.catalogCategory.findFirst({
        where: {
          id: requestedCategoryId,
          kind: "toy",
          ...(auth.user.tenantId ? { tenantId: auth.user.tenantId } : { tenantId: null })
        }
      })
    : null;
  const categoryId = category?.id || (await getOrCreateCatalogCategory("toy", auth.user.tenantId, categoryName)).id;
  const slug = await uniqueSlug("toy", normalizeSlug(text(payload.slug), title), auth.user.tenantId);
  const uploadedFile = payload.file instanceof File && payload.file.size > 0 ? payload.file : null;
  const uploadedAsset = uploadedFile ? await saveUploadedFile(auth.user.id, uploadedFile, auth.user.tenantId) : null;
  const nextImageUrl = uploadedAsset ? fileAssetUrl(uploadedAsset.id) : text(payload.imageUrl) || null;
  const positionsEnabled = featureEnabled(auth.user.tenant?.features, "positions");
  const positionIds = positionsEnabled ? stringArray(payload.positionIds ?? payload.positions) : [];
  const positions = positionIds.length
    ? await prisma.position.findMany({
        where: { ...(await ownerScope(auth.user)), id: { in: positionIds } },
        select: { id: true }
      })
    : [];

  const toy = await prisma.toy.create({
    data: {
      tenantId: auth.user.tenantId || undefined,
      ownerId: auth.user.id,
      categoryId,
      title,
      slug,
      description: text(payload.description) || null,
      imageUrl: nextImageUrl,
      selfBondageCapable: booleanValue(payload.selfBondageCapable),
      ...(positionsEnabled ? { positions: { connect: positions.map((position) => ({ id: position.id })) } } : {})
    },
    include: {
      category: true,
      owner: { include: { profile: true } },
      favorites: { include: { user: { include: { profile: true } } } },
      positions: true,
      activities: true
    }
  });

  await logAction({
    actorId: auth.user.id,
    action: "toy_created_api",
    entityType: "toy",
    entityId: toy.id,
    title: `Spielzeug per API angelegt: ${toy.title}`,
    href: `/toys/${toy.slug}`,
    details: { categoryId, positionIds: positions.map((position) => position.id), imageFileId: uploadedAsset?.id || null, multipart: Boolean(uploadedAsset) }
  });

  const fileId = fileIdFromUrl(toy.imageUrl);
  const imageUrl = fileId ? externalFileUrl(request, fileId) : toy.imageUrl ? absoluteUrl(request, toy.imageUrl) : null;
  return NextResponse.json({
    ok: true,
    item: {
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
      favorites: [],
      isFavorite: false,
      positions: positionsEnabled ? toy.positions.map((position) => ({ id: position.id, name: position.name, slug: position.slug, href: `/positions/${position.slug}` })) : undefined,
      activities: toy.activities.map((activity) => ({ id: activity.id, title: activity.title, slug: activity.slug, href: `/activities/${activity.slug}` }))
    }
  }, { status: 201 });
}
