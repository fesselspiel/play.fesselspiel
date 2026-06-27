import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { ownerScope } from "@/lib/access";
import { tokenFromRequest } from "@/lib/api-tokens";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { fileIdFromUrl } from "@/lib/files";
import { prisma } from "@/lib/prisma";

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
  const token = searchParams.get("token") || "";
  const tokenForDownloadUrl = token && token === tokenFromRequest(request) ? token : "";

  const where: Prisma.ToyWhereInput = {
    ...(await ownerScope(auth.user)),
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
          downloadUrlWithToken: fileId && tokenForDownloadUrl ? externalFileUrl(request, fileId, tokenForDownloadUrl) : null,
          requiresAuthorization: Boolean(fileId && !tokenForDownloadUrl)
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
