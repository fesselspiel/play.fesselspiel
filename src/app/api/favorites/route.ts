import { NextResponse } from "next/server";
import { contentTenantScope, isAccessibleOwner } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { hasFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";

type FavoriteKind = "toy" | "position";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const body = await request.json().catch(() => null) as { kind?: FavoriteKind; id?: string } | null;
  const kind = body?.kind;
  const id = String(body?.id || "");
  if (!kind || !["toy", "position"].includes(kind) || !id) return NextResponse.json({ error: "Ungültiger Favorit" }, { status: 400 });

  if (kind === "toy") {
    if (!(await hasFeature("toys"))) return NextResponse.json({ error: "Feature deaktiviert" }, { status: 403 });
    const toy = await prisma.toy.findFirst({ where: { id, ...contentTenantScope(user) }, select: { id: true, ownerId: true, title: true, slug: true } });
    if (!toy || !(await isAccessibleOwner(user, toy.ownerId))) return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
    const existing = await prisma.toyFavorite.findUnique({ where: { toyId_userId: { toyId: toy.id, userId: user.id } } });
    if (existing) {
      await prisma.toyFavorite.delete({ where: { id: existing.id } });
      await logAction({ actorId: user.id, action: "toy_unfavorited", entityType: "toy", entityId: toy.id, title: `Spielzeug-Favorit entfernt: ${toy.title}`, href: `/toys/${toy.slug}` });
      return NextResponse.json({ ok: true, isFavorite: false });
    }
    await prisma.toyFavorite.create({ data: { toyId: toy.id, userId: user.id } });
    await logAction({ actorId: user.id, action: "toy_favorited", entityType: "toy", entityId: toy.id, title: `Spielzeug favorisiert: ${toy.title}`, href: `/toys/${toy.slug}` });
    return NextResponse.json({ ok: true, isFavorite: true });
  }

  if (!(await hasFeature("positions"))) return NextResponse.json({ error: "Feature deaktiviert" }, { status: 403 });
  const position = await prisma.position.findFirst({ where: { id, ...contentTenantScope(user) }, select: { id: true, ownerId: true, name: true, slug: true } });
  if (!position || !(await isAccessibleOwner(user, position.ownerId))) return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  const existing = await prisma.positionFavorite.findUnique({ where: { positionId_userId: { positionId: position.id, userId: user.id } } });
  if (existing) {
    await prisma.positionFavorite.delete({ where: { id: existing.id } });
    await logAction({ actorId: user.id, action: "position_unfavorited", entityType: "position", entityId: position.id, title: `Szenen-Favorit entfernt: ${position.name}`, href: `/positions/${position.slug}` });
    return NextResponse.json({ ok: true, isFavorite: false });
  }
  await prisma.positionFavorite.create({ data: { positionId: position.id, userId: user.id } });
  await logAction({ actorId: user.id, action: "position_favorited", entityType: "position", entityId: position.id, title: `Szene favorisiert: ${position.name}`, href: `/positions/${position.slug}` });
  return NextResponse.json({ ok: true, isFavorite: true });
}
