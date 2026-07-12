import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { mediaVisibilityScope, visibilityScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { entityLikeStateForEntity } from "@/lib/entity-likes";
import { deleteOwnedFile, fileIdFromUrl } from "@/lib/files";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type MediaRouteParams = { params: { id: string } };

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

function parseVisibility(value: unknown) {
  const raw = String(value || "");
  if (raw === "PRIVATE" || raw === "PARTNER" || raw === "SHARED") return raw;
  if (raw === "" || raw === "ALBUM") return null;
  return undefined;
}

function parseBoolean(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  const raw = String(value || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function parseDate(value: unknown) {
  if (value === undefined) return undefined;
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function serializeMedia(request: NextRequest, entry: Prisma.MediaGetPayload<{ include: typeof mediaInclude }>) {
  const fileId = fileIdFromUrl(entry.url);
  const downloadPath = fileId ? `/api/external/files/${fileId}` : entry.url;
  const downloadUrl = fileId ? externalFileUrl(request, fileId) : absoluteUrl(request, entry.url);
  return {
    id: entry.id,
    title: entry.title,
    kind: entry.kind,
    visibility: entry.visibility,
    effectiveVisibility: entry.visibility || entry.album?.visibility || "PRIVATE",
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
    commentsCount: entry._count.comments
  };
}

function serializeComment(comment: Prisma.MediaCommentGetPayload<{ include: typeof commentInclude }>) {
  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    owner: {
      id: comment.owner.id,
      username: comment.owner.username,
      displayName: comment.owner.profile?.displayName || comment.owner.name || comment.owner.username || comment.owner.email
    }
  };
}

const mediaInclude = {
  album: true,
  owner: { include: { profile: true } },
  _count: { select: { comments: true } }
} satisfies Prisma.MediaInclude;

const commentInclude = {
  owner: { include: { profile: true } }
} satisfies Prisma.MediaCommentInclude;

async function detailPayload(request: NextRequest, user: { id: string; tenantId?: string | null; circleId?: string | null; role?: string | null }, id: string) {
  const media = await prisma.media.findFirst({
    where: { id, ...(await mediaVisibilityScope(user)) },
    include: mediaInclude
  });
  if (!media) return null;
  const [comments, albums] = await Promise.all([
    prisma.mediaComment.findMany({ where: { mediaId: media.id }, include: commentInclude, orderBy: { createdAt: "asc" } }),
    prisma.album.findMany({
      where: { ...(await visibilityScope(user)) },
      include: { _count: { select: { media: true } }, owner: { include: { profile: true } } },
      orderBy: [{ title: "asc" }]
    })
  ]);
  return {
    ok: true,
    item: {
      ...serializeMedia(request, media),
      ...(await entityLikeStateForEntity({
        entityType: "media",
        entityId: media.id,
        ownerId: media.ownerId,
        tenantId: media.tenantId,
        title: media.title,
        href: `/media?item=${media.id}`
      }, user.id))
    },
    comments: comments.map(serializeComment),
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
  };
}

export async function GET(request: NextRequest, { params }: MediaRouteParams) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "media");
  if (blocked) return blocked;
  const payload = await detailPayload(request, auth.user, params.id);
  if (!payload) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json(payload);
}

export async function PATCH(request: NextRequest, { params }: MediaRouteParams) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "media");
  if (blocked) return blocked;
  const existing = await prisma.media.findFirst({ where: { id: params.id, ownerId: auth.user.id }, include: mediaInclude });
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const title = body.title === undefined ? undefined : String(body.title || "").trim();
  const visibility = parseVisibility(body.visibility);
  const showInCalendar = parseBoolean(body.showInCalendar);
  const calendarDate = parseDate(body.calendarDate);
  if (visibility === undefined && body.visibility !== undefined) return NextResponse.json({ ok: false, error: "invalid_visibility" }, { status: 400 });
  let albumId: string | null | undefined;
  if (body.albumId !== undefined) {
    const requestedAlbumId = String(body.albumId || "").trim();
    albumId = requestedAlbumId || null;
    if (albumId) {
      const album = await prisma.album.findFirst({ where: { id: albumId, ownerId: auth.user.id }, select: { id: true } });
      if (!album) return NextResponse.json({ ok: false, error: "album_not_found" }, { status: 404 });
    }
  }
  await prisma.media.update({
    where: { id: existing.id },
    data: {
      ...(title !== undefined ? { title: title || existing.title } : {}),
      ...(visibility !== undefined ? { visibility } : {}),
      ...(showInCalendar !== undefined ? { showInCalendar } : {}),
      ...(calendarDate !== undefined ? { calendarDate } : {}),
      ...(albumId !== undefined ? { albumId } : {})
    }
  });
  if (body.albumCover === true || body.albumCover === "true") {
    const media = await prisma.media.findUnique({ where: { id: existing.id }, select: { albumId: true } });
    if (media?.albumId) await prisma.album.updateMany({ where: { id: media.albumId, ownerId: auth.user.id }, data: { coverMediaId: existing.id } });
  }
  await logAction({ actorId: auth.user.id, action: "media_updated", entityType: "media", entityId: existing.id, title: `Medium geändert: ${title || existing.title}`, href: "/settings/media" });
  const payload = await detailPayload(request, auth.user, existing.id);
  return NextResponse.json(payload);
}

export async function DELETE(request: NextRequest, { params }: MediaRouteParams) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "media");
  if (blocked) return blocked;
  const existing = await prisma.media.findFirst({ where: { id: params.id, ownerId: auth.user.id }, include: { album: true } });
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const fileId = fileIdFromUrl(existing.url);
  await prisma.media.delete({ where: { id: existing.id } });
  if (existing.album?.coverMediaId === existing.id) await prisma.album.update({ where: { id: existing.album.id }, data: { coverMediaId: null } });
  if (fileId) await deleteOwnedFile(auth.user.id, fileId).catch(() => false);
  await logAction({ actorId: auth.user.id, action: "media_deleted", entityType: "media", entityId: existing.id, title: `Medium gelöscht: ${existing.title}`, href: "/settings/media" });
  return NextResponse.json({ ok: true });
}
