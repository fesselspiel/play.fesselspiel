import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { ownerScope } from "@/lib/access";
import { tokenFromRequest } from "@/lib/api-tokens";
import { logAction } from "@/lib/audit";
import { getOrCreateCatalogCategory } from "@/lib/catalog-categories";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { featureEnabled } from "@/lib/features";
import { fileAssetUrl, fileIdFromUrl, saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { normalizeSlug, uniqueSlug } from "@/lib/slug";

export const runtime = "nodejs";

function displayName(user: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null }) {
  return user.profile?.displayName || user.name || user.username || user.email || null;
}

function absoluteUrl(request: NextRequest, path: string) {
  return new URL(path, request.url).toString();
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

function stringArray(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((entry) => entry.trim()).filter(Boolean);
  const raw = text(value);
  if (!raw) return [];
  return raw.split(",").map((entry) => entry.trim()).filter(Boolean);
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "positions");
  if (blocked) return blocked;

  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 100)));
  const cursor = searchParams.get("cursor") || undefined;
  const q = String(searchParams.get("q") || "").trim();
  const categoryId = String(searchParams.get("categoryId") || "").trim();
  const toyId = String(searchParams.get("toyId") || "").trim();
  const selfBondage = searchParams.get("selfBondage");
  const includeRelations = searchParams.get("includeRelations") !== "0";
  const token = searchParams.get("token") || "";
  const tokenForDownloadUrl = token && token === tokenFromRequest(request) ? token : "";

  const where: Prisma.PositionWhereInput = {
    ...(await ownerScope(auth.user)),
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(toyId ? { tools: { some: { id: toyId } } } : {}),
    ...(selfBondage === "1" || selfBondage === "true" ? { selfBondageCapable: true } : {})
  };
  const positions = await prisma.position.findMany({
    where,
    include: {
      category: true,
      owner: { include: { profile: true } },
      favorites: { include: { user: { include: { profile: true } } } },
      tools: true,
      activities: true,
      bondageSystemItems: { include: { product: true } }
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  });
  const pageItems = positions.slice(0, limit);
  const nextCursor = positions.length > limit ? positions[limit].id : null;

  return NextResponse.json({
    ok: true,
    nextCursor,
    count: pageItems.length,
    items: pageItems.map((position) => {
      const fileId = fileIdFromUrl(position.imageUrl);
      const imageUrl = fileId ? externalFileUrl(request, fileId) : position.imageUrl ? absoluteUrl(request, position.imageUrl) : null;
      return {
        id: position.id,
        name: position.name,
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
        favorites: position.favorites.map((favorite) => ({
          userId: favorite.userId,
          displayName: displayName(favorite.user),
          createdAt: favorite.createdAt.toISOString()
        })),
        isFavorite: position.favorites.some((favorite) => favorite.userId === auth.user.id),
        toys: includeRelations ? position.tools.map((toy) => ({ id: toy.id, title: toy.title, slug: toy.slug, href: `/toys/${toy.slug}` })) : undefined,
        bondageSystemItems: includeRelations ? position.bondageSystemItems.map((item) => ({ id: item.id, title: item.product.title, slug: item.product.slug, href: `/bondage-system/${item.product.slug}` })) : undefined,
        activities: includeRelations ? position.activities.map((activity) => ({ id: activity.id, title: activity.title, slug: activity.slug, href: `/activities/${activity.slug}` })) : undefined
      };
    })
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "positions");
  if (blocked) return blocked;

  const payload = await requestPayload(request);
  const name = text(payload.name ?? payload.title);
  if (!name) return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });

  const categoryName = text(payload.categoryName) || text(payload.category) || text(payload.categoryNew);
  const requestedCategoryId = text(payload.categoryId);
  const category = requestedCategoryId
    ? await prisma.catalogCategory.findFirst({
        where: {
          id: requestedCategoryId,
          kind: "position",
          ...(auth.user.tenantId ? { tenantId: auth.user.tenantId } : { tenantId: null })
        }
      })
    : null;
  const categoryId = category?.id || (await getOrCreateCatalogCategory("position", auth.user.tenantId, categoryName)).id;
  const slug = await uniqueSlug("position", normalizeSlug(text(payload.slug), name), auth.user.tenantId);
  const uploadedFile = payload.file instanceof File && payload.file.size > 0 ? payload.file : null;
  const uploadedAsset = uploadedFile ? await saveUploadedFile(auth.user.id, uploadedFile, auth.user.tenantId) : null;
  const nextImageUrl = uploadedAsset ? fileAssetUrl(uploadedAsset.id) : text(payload.imageUrl) || null;
  const toysEnabled = featureEnabled(auth.user.tenant?.features, "toys");
  const toyIds = toysEnabled ? stringArray(payload.toyIds ?? payload.toys) : [];
  const toys = toyIds.length
    ? await prisma.toy.findMany({
        where: { ...(await ownerScope(auth.user)), id: { in: toyIds } },
        select: { id: true }
      })
    : [];

  const position = await prisma.position.create({
    data: {
      tenantId: auth.user.tenantId || undefined,
      ownerId: auth.user.id,
      categoryId,
      name,
      slug,
      description: text(payload.description) || null,
      imageUrl: nextImageUrl,
      selfBondageCapable: booleanValue(payload.selfBondageCapable),
      ...(toysEnabled ? { tools: { connect: toys.map((toy) => ({ id: toy.id })) } } : {})
    },
    include: {
      category: true,
      owner: { include: { profile: true } },
      favorites: { include: { user: { include: { profile: true } } } },
      tools: true,
      activities: true,
      bondageSystemItems: { include: { product: true } }
    }
  });

  await logAction({
    actorId: auth.user.id,
    action: "position_created_api",
    entityType: "position",
    entityId: position.id,
    title: `Szene per API angelegt: ${position.name}`,
    href: `/positions/${position.slug}`,
    details: { categoryId, toyIds: toys.map((toy) => toy.id), imageFileId: uploadedAsset?.id || null, multipart: Boolean(uploadedAsset) }
  });

  const fileId = fileIdFromUrl(position.imageUrl);
  const imageUrl = fileId ? externalFileUrl(request, fileId) : position.imageUrl ? absoluteUrl(request, position.imageUrl) : null;
  return NextResponse.json({
    ok: true,
    item: {
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
        downloadUrlWithToken: null,
        requiresAuthorization: Boolean(fileId)
      },
      category: position.category ? { id: position.category.id, name: position.category.name, sortOrder: position.category.sortOrder } : { id: null, name: "Allgemein", sortOrder: 0 },
      owner: { id: position.owner.id, username: position.owner.username, displayName: displayName(position.owner) },
      favorites: [],
      isFavorite: false,
      toys: toysEnabled ? position.tools.map((toy) => ({ id: toy.id, title: toy.title, slug: toy.slug, href: `/toys/${toy.slug}` })) : undefined,
      bondageSystemItems: position.bondageSystemItems.map((item) => ({ id: item.id, title: item.product.title, slug: item.product.slug, href: `/bondage-system/${item.product.slug}` })),
      activities: position.activities.map((activity) => ({ id: activity.id, title: activity.title, slug: activity.slug, href: `/activities/${activity.slug}` }))
    }
  }, { status: 201 });
}
