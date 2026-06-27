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

  const fileId = fileIdFromUrl(position.imageUrl);
  const imageUrl = fileId ? externalFileUrl(request, fileId) : position.imageUrl ? absoluteUrl(request, position.imageUrl) : null;
  return NextResponse.json({
    ok: true,
    item: {
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
      toys: position.tools.map((toy) => ({
        id: toy.id,
        title: toy.title,
        slug: toy.slug,
        href: `/toys/${toy.slug}`,
        category: toy.category ? { id: toy.category.id, name: toy.category.name } : null
      })),
      bondageSystemItems: position.bondageSystemItems.map((item) => ({ id: item.id, title: item.product.title, slug: item.product.slug, href: `/bondage-system/${item.product.slug}` })),
      activities: position.activities.map((activity) => ({ id: activity.id, title: activity.title, slug: activity.slug, href: `/activities/${activity.slug}` }))
    }
  });
}
