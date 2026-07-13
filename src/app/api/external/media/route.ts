import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { MediaKind } from "@prisma/client";
import { ensureDefaultAlbum } from "@/lib/albums";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { mediaVisibilityScope, visibilityScope } from "@/lib/access";
import { entityLikeStateMap } from "@/lib/entity-likes";
import { fileAssetUrl, fileIdFromUrl, saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { blockedUserIds, hiddenEntityIds } from "@/lib/compliance/ugc";

export const runtime = "nodejs";

function parsedVisibility(value: FormDataEntryValue | null) {
  const raw = String(value || "");
  if (raw === "PRIVATE" || raw === "PARTNER" || raw === "SHARED") return raw;
  return null;
}

function parsedContentClassification(value: FormDataEntryValue | null) {
  const raw = String(value || "UNKNOWN").trim().toUpperCase();
  if (raw === "SAFE" || raw === "MATURE_SUGGESTIVE" || raw === "EXPLICIT" || raw === "UNKNOWN") return raw;
  return "UNKNOWN";
}

function boolValue(value: FormDataEntryValue | null) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function dateValue(value: FormDataEntryValue | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function publicOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  if (host && !host.startsWith("0.0.0.0")) return `${forwardedProto}://${host}`;
  return process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_URL || new URL(request.url).origin;
}

function absoluteUrl(request: NextRequest, path: string) {
  return new URL(path, publicOrigin(request)).toString();
}

function externalFileUrl(request: NextRequest, fileId: string) {
  return new URL(`/api/external/files/${fileId}`, publicOrigin(request)).toString();
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "media");
  if (blocked) return blocked;

  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 50)));
  const cursor = searchParams.get("cursor") || undefined;
  const q = String(searchParams.get("q") || "").trim();
  const albumId = String(searchParams.get("albumId") || "").trim();
  const requestedKind = String(searchParams.get("kind") || "IMAGE").toUpperCase();
  const kind = requestedKind === "VIDEO" ? MediaKind.VIDEO : requestedKind === "ALL" ? null : MediaKind.IMAGE;
  const includeAlbums = searchParams.get("includeAlbums") !== "0";

  const [blockedIds, hiddenIds] = await Promise.all([
    blockedUserIds(auth.user.id, auth.user.tenantId || ""),
    hiddenEntityIds(auth.user.tenantId || "", "media")
  ]);
  const where: Prisma.MediaWhereInput = {
    ...(await mediaVisibilityScope(auth.user)),
    AND: [
      { id: { notIn: hiddenIds } },
      { ownerId: { notIn: blockedIds } },
      { contentClassification: { not: "QUARANTINED" } }
    ],
    ...(kind ? { kind } : {}),
    ...(albumId ? { albumId } : {}),
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {})
  };
  const media = await prisma.media.findMany({
    where,
    include: {
      album: true,
      owner: { include: { profile: true } },
      _count: { select: { comments: true } }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  });
  const pageItems = media.slice(0, limit);
  const nextCursor = media.length > limit ? media[limit].id : null;
  const likeStates = await entityLikeStateMap("media", pageItems.map((entry) => entry.id), auth.user.id, pageItems.map((entry) => ({
    entityType: "media",
    entityId: entry.id,
    ownerId: entry.ownerId,
    tenantId: entry.tenantId,
    title: entry.title,
    href: `/media?item=${entry.id}`
  })));

  const albums = includeAlbums
    ? await prisma.album.findMany({
        where: await visibilityScope(auth.user),
        include: { _count: { select: { media: true } }, owner: { include: { profile: true } } },
        orderBy: [{ title: "asc" }]
      })
    : [];

  return NextResponse.json({
    ok: true,
    nextCursor,
    items: pageItems.map((entry) => {
      const fileId = fileIdFromUrl(entry.url);
      const downloadPath = fileId ? `/api/external/files/${fileId}` : entry.url;
      const downloadUrl = fileId ? externalFileUrl(request, fileId) : absoluteUrl(request, entry.url);
      return {
        id: entry.id,
        title: entry.title,
        kind: entry.kind,
        visibility: entry.visibility,
        effectiveVisibility: entry.visibility || entry.album?.visibility || "PRIVATE",
        contentClassification: entry.contentClassification,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
        showInCalendar: entry.showInCalendar,
        calendarDate: entry.calendarDate?.toISOString() || null,
        fileId,
        url: downloadUrl,
        downloadUrl,
        downloadPath,
        downloadUrlWithToken: null,
        requiresAuthorization: Boolean(fileId),
        album: entry.album ? { id: entry.album.id, title: entry.album.title, visibility: entry.album.visibility } : null,
        owner: {
          id: entry.owner.id,
          username: entry.owner.username,
          displayName: entry.owner.profile?.displayName || entry.owner.name || entry.owner.username || entry.owner.email
        },
        own: entry.ownerId === auth.user.id,
        canDelete: entry.ownerId === auth.user.id || auth.user.role === "ADMIN" || auth.user.role === "SUPER_ADMIN",
        ...(likeStates.get(entry.id) || {}),
        commentsCount: entry._count.comments
      };
    }),
    albums: albums.map((album) => ({
      id: album.id,
      title: album.title,
      description: album.description,
      visibility: album.visibility,
      coverMediaId: album.coverMediaId,
      mediaCount: album._count.media,
      owner: {
        id: album.owner.id,
        username: album.owner.username,
        displayName: album.owner.profile?.displayName || album.owner.name || album.owner.username || album.owner.email
      }
    }))
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "media");
  if (blocked) return blocked;
  const formData = await request.formData();
  let asset;
  try {
    asset = await saveUploadedFile(auth.user.id, formData.get("file") as File | null);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Die Datei konnte nicht sicher verarbeitet werden";
    return NextResponse.json({ ok: false, error: "invalid_upload", message }, { status: 400 });
  }
  if (!asset) return NextResponse.json({ ok: false, error: "Keine Datei erhalten" }, { status: 400 });
  const url = fileAssetUrl(asset.id);
  const album = await ensureDefaultAlbum(auth.user.id);
  const contentClassification = parsedContentClassification(formData.get("contentClassification"));
  const showInCalendar = boolValue(formData.get("showInCalendar"));
  const calendarDate = dateValue(formData.get("calendarDate"));
  const media = await prisma.media.create({
    data: {
      tenantId: auth.user.tenantId || undefined,
      ownerId: auth.user.id,
      albumId: album.id,
      showInCalendar,
      calendarDate: showInCalendar ? calendarDate : null,
      title: String(formData.get("title") || asset.originalName || "API Upload").trim(),
      kind: asset.mimeType.startsWith("video/") ? "VIDEO" : "IMAGE",
      url,
      visibility: parsedVisibility(formData.get("visibility")),
      contentClassification
    }
  });
  await prisma.fileAsset.update({
    where: { id: asset.id },
    data: { contentClassification }
  });
  return NextResponse.json({
    ok: true,
    media,
    file: {
      id: asset.id,
      url,
      originalName: asset.originalName,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      contentClassification,
      scanStatus: asset.scanStatus
    }
  });
}
