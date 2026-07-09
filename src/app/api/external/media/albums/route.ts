import { NextRequest, NextResponse } from "next/server";
import { Visibility } from "@prisma/client";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { visibilityScope } from "@/lib/access";
import { ensureDefaultAlbum } from "@/lib/albums";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function visibility(value: unknown) {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "PRIVATE" || raw === "PARTNER" || raw === "SHARED") return raw as Visibility;
  return "PRIVATE";
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

async function payload(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return await request.json().catch(() => ({})) as Record<string, unknown>;
  const form = await request.formData().catch(() => null);
  return form ? Object.fromEntries(form.entries()) : {};
}

function albumItem(album: Awaited<ReturnType<typeof prisma.album.findFirst>> & { _count?: { media: number }; owner?: any } | any) {
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

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "media");
  if (blocked) return blocked;
  await ensureDefaultAlbum(auth.user.id, auth.user.tenantId);
  const albums = await prisma.album.findMany({
    where: await visibilityScope(auth.user),
    include: { _count: { select: { media: true } }, owner: { include: { profile: true } } },
    orderBy: [{ title: "asc" }]
  });
  return NextResponse.json({ ok: true, count: albums.length, items: albums.map(albumItem), albums: albums.map(albumItem) });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "media");
  if (blocked) return blocked;
  const body = await payload(request);
  const title = text(body.title || body.name);
  if (!title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
  const coverMediaId = text(body.coverMediaId);
  if (coverMediaId) {
    const cover = await prisma.media.findFirst({ where: { id: coverMediaId, ownerId: auth.user.id }, select: { id: true } });
    if (!cover) return NextResponse.json({ ok: false, error: "cover_media_not_found" }, { status: 404 });
  }
  const album = await prisma.album.create({
    data: {
      tenantId: auth.user.tenantId || undefined,
      ownerId: auth.user.id,
      title,
      description: text(body.description) || null,
      visibility: visibility(body.visibility),
      coverMediaId: coverMediaId || null
    },
    include: { _count: { select: { media: true } }, owner: { include: { profile: true } } }
  });
  await logAction({ actorId: auth.user.id, action: "album_created_api", entityType: "album", entityId: album.id, title: `Album per API angelegt: ${album.title}`, href: `/media?album=${album.id}` });
  return NextResponse.json({ ok: true, item: albumItem(album), album: albumItem(album) }, { status: 201 });
}
