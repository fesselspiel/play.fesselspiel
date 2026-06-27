import { NextRequest, NextResponse } from "next/server";
import { MediaKind } from "@prisma/client";
import { accessibleOwnerIds, bondageSystemVisibilityScope, mediaVisibilityScope, ownerScope } from "@/lib/access";
import { tokenFromRequest } from "@/lib/api-tokens";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { featureEnabled } from "@/lib/features";
import { fileAssetUrl, fileIdFromUrl } from "@/lib/files";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type ImageItem = {
  id: string;
  source: string;
  entityType: string;
  entityId: string;
  title: string;
  subtitle?: string | null;
  href?: string;
  createdAt?: string;
  updatedAt?: string;
  fileId: string | null;
  url: string;
  downloadUrl: string;
  downloadPath: string;
  downloadUrlWithToken: string | null;
  requiresAuthorization: boolean;
  mimeHint?: string | null;
  owner?: { id: string; username?: string | null; displayName?: string | null } | null;
  meta?: Record<string, unknown>;
};

function absoluteUrl(request: NextRequest, path: string) {
  return new URL(path, request.url).toString();
}

function externalFileUrl(request: NextRequest, fileId: string, token?: string) {
  const url = new URL(`/api/external/files/${fileId}`, request.url);
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

function displayName(user?: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null } | null) {
  return user?.profile?.displayName || user?.name || user?.username || user?.email || null;
}

function imageItem(
  request: NextRequest,
  input: {
    id: string;
    source: string;
    entityType: string;
    entityId: string;
    title: string;
    imageUrl?: string | null;
    href?: string;
    subtitle?: string | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
    token?: string;
    owner?: ImageItem["owner"];
    meta?: Record<string, unknown>;
  }
): ImageItem | null {
  if (!input.imageUrl) return null;
  const fileId = fileIdFromUrl(input.imageUrl);
  const downloadPath = fileId ? `/api/external/files/${fileId}` : input.imageUrl;
  const downloadUrl = fileId ? externalFileUrl(request, fileId) : absoluteUrl(request, input.imageUrl);
  return {
    id: input.id,
    source: input.source,
    entityType: input.entityType,
    entityId: input.entityId,
    title: input.title,
    subtitle: input.subtitle || null,
    href: input.href,
    createdAt: input.createdAt?.toISOString(),
    updatedAt: input.updatedAt?.toISOString(),
    fileId,
    url: downloadUrl,
    downloadUrl,
    downloadPath,
    downloadUrlWithToken: fileId && input.token ? externalFileUrl(request, fileId, input.token) : null,
    requiresAuthorization: Boolean(fileId && !input.token),
    mimeHint: fileId ? null : null,
    owner: input.owner || null,
    meta: input.meta
  };
}

function wants(source: string, allowed: string[]) {
  return source === "all" || allowed.includes(source);
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;

  const searchParams = request.nextUrl.searchParams;
  const source = String(searchParams.get("source") || "all").trim() || "all";
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 100)));
  const q = String(searchParams.get("q") || "").trim();
  const urlToken = searchParams.get("token") || "";
  const token = urlToken && urlToken === tokenFromRequest(request) ? urlToken : "";
  const items: ImageItem[] = [];
  const features = auth.user.tenant?.features;
  const add = (entry: ImageItem | null) => {
    if (entry) items.push(entry);
  };

  if (wants(source, ["media", "gallery", "bilder"]) && featureEnabled(features, "media")) {
    const media = await prisma.media.findMany({
      where: {
        ...(await mediaVisibilityScope(auth.user)),
        kind: MediaKind.IMAGE,
        ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {})
      },
      include: { album: true, owner: { include: { profile: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit
    });
    for (const entry of media) {
      add(imageItem(request, {
        id: `media:${entry.id}`,
        source: "media",
        entityType: "media",
        entityId: entry.id,
        title: entry.title,
        subtitle: entry.album?.title,
        imageUrl: entry.url,
        href: "/media",
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        token,
        owner: { id: entry.owner.id, username: entry.owner.username, displayName: displayName(entry.owner) },
        meta: { albumId: entry.albumId, visibility: entry.visibility, effectiveVisibility: entry.visibility || entry.album?.visibility || "PRIVATE" }
      }));
    }
  }

  if (wants(source, ["toys", "toy", "spielsachen"]) && featureEnabled(features, "toys")) {
    const toys = await prisma.toy.findMany({
      where: { ...(await ownerScope(auth.user)), imageUrl: { not: null }, ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}) },
      include: { category: true, owner: { include: { profile: true } } },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      take: limit
    });
    for (const toy of toys) {
      add(imageItem(request, {
        id: `toy:${toy.id}`,
        source: "toys",
        entityType: "toy",
        entityId: toy.id,
        title: toy.title,
        subtitle: toy.description,
        imageUrl: toy.imageUrl,
        href: `/toys/${toy.slug}`,
        createdAt: toy.createdAt,
        updatedAt: toy.updatedAt,
        token,
        owner: { id: toy.owner.id, username: toy.owner.username, displayName: displayName(toy.owner) },
        meta: { slug: toy.slug, categoryId: toy.categoryId, categoryName: toy.category?.name || "Allgemein", selfBondageCapable: toy.selfBondageCapable }
      }));
    }
  }

  if (wants(source, ["positions", "position", "scenes", "szenen", "situationen"]) && featureEnabled(features, "positions")) {
    const positions = await prisma.position.findMany({
      where: { ...(await ownerScope(auth.user)), imageUrl: { not: null }, ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}) },
      include: { category: true, owner: { include: { profile: true } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: limit
    });
    for (const position of positions) {
      add(imageItem(request, {
        id: `position:${position.id}`,
        source: "positions",
        entityType: "position",
        entityId: position.id,
        title: position.name,
        subtitle: position.description,
        imageUrl: position.imageUrl,
        href: `/positions/${position.slug}`,
        createdAt: position.createdAt,
        updatedAt: position.updatedAt,
        token,
        owner: { id: position.owner.id, username: position.owner.username, displayName: displayName(position.owner) },
        meta: { slug: position.slug, categoryId: position.categoryId, categoryName: position.category?.name || "Allgemein", selfBondageCapable: position.selfBondageCapable }
      }));
    }
  }

  if (wants(source, ["ideas", "idea", "ideen"]) && featureEnabled(features, "ideas")) {
    const ideas = await prisma.activityPlan.findMany({
      where: { ...(await ownerScope(auth.user)), category: "IDEA_COLLECTION", ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}) },
      include: { owner: { include: { profile: true } }, images: { include: { file: true }, orderBy: { createdAt: "asc" } } },
      orderBy: [{ updatedAt: "desc" }],
      take: limit
    });
    for (const idea of ideas) {
      for (const image of idea.images) {
        add(imageItem(request, {
          id: `idea:${idea.id}:${image.id}`,
          source: "ideas",
          entityType: "idea",
          entityId: idea.id,
          title: image.title || idea.title,
          subtitle: idea.title,
          imageUrl: fileAssetUrl(image.fileId),
          href: `/ideas/${idea.slug}`,
          createdAt: image.createdAt,
          updatedAt: idea.updatedAt,
          token,
          owner: { id: idea.owner.id, username: idea.owner.username, displayName: displayName(idea.owner) },
          meta: { slug: idea.slug, imageId: image.id, fileName: image.file.originalName, mimeType: image.file.mimeType, sizeBytes: image.file.sizeBytes }
        }));
      }
    }
  }

  if (wants(source, ["bondageSystem", "bondage-system", "products", "produkte"]) && featureEnabled(features, "shopifyBondageSystem")) {
    const products = await prisma.bondageSystemItem.findMany({
      where: {
        tenantId: auth.user.tenantId || "",
        visible: true,
        ...bondageSystemVisibilityScope(auth.user),
        product: { imageUrl: { not: null }, ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}) }
      },
      include: { product: true },
      orderBy: [{ sortOrder: "asc" }, { product: { title: "asc" } }],
      take: limit
    });
    for (const item of products) {
      add(imageItem(request, {
        id: `bondageSystem:${item.id}`,
        source: "bondageSystem",
        entityType: "bondageSystemItem",
        entityId: item.id,
        title: item.product.title,
        subtitle: item.product.vendor,
        imageUrl: item.product.imageUrl,
        href: `/bondage-system/${item.product.slug}`,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        token,
        meta: { slug: item.product.slug, visibility: item.visibility, productUrl: item.showExternalLink ? item.product.productUrl : null }
      }));
    }
  }

  if (wants(source, ["profiles", "users", "user", "profile"])) {
    const ownerIds = await accessibleOwnerIds(auth.user);
    const users = await prisma.user.findMany({
      where: { id: { in: ownerIds }, active: true, profile: { is: { imageUrl: { not: null } } } },
      include: { profile: true },
      orderBy: [{ username: "asc" }],
      take: limit
    });
    for (const user of users) {
      add(imageItem(request, {
        id: `profile:${user.id}`,
        source: "profiles",
        entityType: "user",
        entityId: user.id,
        title: displayName(user) || user.username || user.email || "Benutzer",
        imageUrl: user.profile?.imageUrl,
        href: user.id === auth.user.id ? "/profile" : undefined,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        token,
        owner: { id: user.id, username: user.username, displayName: displayName(user) }
      }));
    }
  }

  items.sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
  return NextResponse.json({
    ok: true,
    source,
    count: Math.min(items.length, limit),
    items: items.slice(0, limit)
  });
}
