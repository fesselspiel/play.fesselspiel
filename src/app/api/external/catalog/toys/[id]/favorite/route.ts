import { NextRequest, NextResponse } from "next/server";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function findToy(user: { id: string; tenantId?: string | null; circleId?: string | null; role?: string | null }, id: string) {
  return prisma.toy.findFirst({ where: { ...(await ownerScope(user)), OR: [{ id }, { slug: id }] }, select: { id: true, title: true, slug: true } });
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "toys");
  if (blocked) return blocked;
  const toy = await findToy(auth.user, params.id);
  if (!toy) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const favorite = await prisma.toyFavorite.upsert({
    where: { toyId_userId: { toyId: toy.id, userId: auth.user.id } },
    update: {},
    create: { toyId: toy.id, userId: auth.user.id }
  });
  await logAction({ actorId: auth.user.id, action: "toy_favorited_api", entityType: "toy", entityId: toy.id, title: `Spielzeug favorisiert: ${toy.title}`, href: `/toys/${toy.slug}` });
  return NextResponse.json({ ok: true, favorite: true, item: { id: favorite.id, toyId: toy.id, userId: auth.user.id, createdAt: favorite.createdAt.toISOString() } });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "toys");
  if (blocked) return blocked;
  const toy = await findToy(auth.user, params.id);
  if (!toy) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  await prisma.toyFavorite.deleteMany({ where: { toyId: toy.id, userId: auth.user.id } });
  await logAction({ actorId: auth.user.id, action: "toy_unfavorited_api", entityType: "toy", entityId: toy.id, title: `Spielzeug-Favorit entfernt: ${toy.title}`, href: `/toys/${toy.slug}` });
  return NextResponse.json({ ok: true, favorite: false, toyId: toy.id });
}
