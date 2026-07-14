import { NextRequest, NextResponse } from "next/server";
import { Visibility } from "@prisma/client";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { visibilityScope } from "@/lib/access";
import { ensureDefaultAlbum } from "@/lib/albums";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function visibility(value: unknown) {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "PRIVATE" || raw === "PARTNER" || raw === "SHARED") return raw as Visibility;
  return null;
}

async function payload(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return await request.json().catch(() => ({})) as Record<string, unknown>;
  const form = await request.formData().catch(() => null);
  return form ? Object.fromEntries(form.entries()) : {};
}

function item(album: any) {
  return {
    id: album.id,
    title: album.title,
    description: album.description,
    visibility: album.visibility,
    coverMediaId: album.coverMediaId,
    mediaCount: album._count?.media ?? 0,
    createdAt: album.createdAt?.toISOString?.() || null,
    updatedAt: album.updatedAt?.toISOString?.() || null,
    owner: album.owner ? {
      id: album.owner.id,
      username: album.owner.username,
      displayName: album.owner.profile?.displayName || album.owner.name || album.owner.username || album.owner.email
    } : null
  };
}

async function findAlbum(user: any, id: string) {
  return prisma.album.findFirst({
    where: { id, ...(await visibilityScope(user)) },
    include: { _count: { select: { media: true } }, owner: { include: { profile: true } } }
  });
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "media");
  if (blocked) return blocked;
  const album = await findAlbum(auth.user, params.id);
  if (!album) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, item: item(album), album: item(album) });
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "media");
  if (blocked) return blocked;
  const album = await prisma.album.findFirst({ where: { id: params.id, ownerId: auth.user.id } });
  if (!album) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const body = await payload(request);
  const coverMediaId = body.coverMediaId === undefined ? undefined : text(body.coverMediaId) || null;
  if (coverMediaId) {
    const cover = await prisma.media.findFirst({ where: { id: coverMediaId, ownerId: auth.user.id }, select: { id: true } });
    if (!cover) return NextResponse.json({ ok: false, error: "cover_media_not_found" }, { status: 404 });
  }
  const nextVisibility = body.visibility === undefined ? undefined : visibility(body.visibility);
  if (body.visibility !== undefined && !nextVisibility) return NextResponse.json({ ok: false, error: "invalid_visibility" }, { status: 400 });
  const updated = await prisma.album.update({
    where: { id: album.id },
    data: {
      ...(body.title !== undefined || body.name !== undefined ? { title: text(body.title || body.name) || album.title } : {}),
      ...(body.description !== undefined ? { description: text(body.description) || null } : {}),
      ...(nextVisibility ? { visibility: nextVisibility } : {}),
      ...(coverMediaId !== undefined ? { coverMediaId } : {})
    },
    include: { _count: { select: { media: true } }, owner: { include: { profile: true } } }
  });
  await logAction({ actorId: auth.user.id, action: "album_updated_api", entityType: "album", entityId: updated.id, title: `Album per API geändert: ${updated.title}`, href: `/media?album=${updated.id}` });
  return NextResponse.json({ ok: true, item: item(updated), album: item(updated) });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "media");
  if (blocked) return blocked;
  const album = await prisma.album.findFirst({ where: { id: params.id, ownerId: auth.user.id }, include: { _count: { select: { media: true } } } });
  if (!album) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const fallback = await ensureDefaultAlbum(album.ownerId, auth.user.tenantId);
  if (album.id === fallback.id) return NextResponse.json({ ok: false, error: "default_album_cannot_be_deleted" }, { status: 400 });
  const deleteMedia = request.nextUrl.searchParams.get("deleteMedia") === "1" || request.nextUrl.searchParams.get("deleteMedia") === "true";
  if (deleteMedia) {
    await prisma.media.deleteMany({ where: { albumId: album.id, ownerId: auth.user.id } });
  } else {
    await prisma.media.updateMany({ where: { albumId: album.id, ownerId: auth.user.id }, data: { albumId: fallback.id, visibility: null } });
  }
  await prisma.album.delete({ where: { id: album.id } });
  await logAction({ actorId: auth.user.id, action: "album_deleted_api", entityType: "album", entityId: album.id, title: `Album per API gelöscht: ${album.title}`, href: "/media" });
  return NextResponse.json({ ok: true, movedToAlbumId: deleteMedia ? null : fallback.id, deletedMedia: deleteMedia ? album._count.media : 0 });
}
