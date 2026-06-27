import { NextRequest, NextResponse } from "next/server";
import { ownerScope } from "@/lib/access";
import { tokenFromRequest } from "@/lib/api-tokens";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { absoluteUrl } from "@/lib/external-mobile-serializers";
import { fileIdFromUrl } from "@/lib/files";
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

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "toys");
  if (blocked) return blocked;

  const token = request.nextUrl.searchParams.get("token") || "";
  const tokenForDownloadUrl = token && token === tokenFromRequest(request) ? token : "";
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
      positions: toy.positions.map((position) => ({
        id: position.id,
        name: position.name,
        slug: position.slug,
        href: `/positions/${position.slug}`,
        category: position.category ? { id: position.category.id, name: position.category.name } : null
      })),
      activities: toy.activities.map((activity) => ({ id: activity.id, title: activity.title, slug: activity.slug, href: `/activities/${activity.slug}` }))
    }
  });
}
