import { NextRequest, NextResponse } from "next/server";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function findPosition(user: { id: string; tenantId?: string | null; circleId?: string | null; role?: string | null }, id: string) {
  return prisma.position.findFirst({ where: { ...(await ownerScope(user)), OR: [{ id }, { slug: id }] }, select: { id: true, name: true, slug: true } });
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "positions");
  if (blocked) return blocked;
  const position = await findPosition(auth.user, params.id);
  if (!position) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const favorite = await prisma.positionFavorite.upsert({
    where: { positionId_userId: { positionId: position.id, userId: auth.user.id } },
    update: {},
    create: { positionId: position.id, userId: auth.user.id }
  });
  await logAction({ actorId: auth.user.id, action: "position_favorited_api", entityType: "position", entityId: position.id, title: `Szene favorisiert: ${position.name}`, href: `/positions/${position.slug}` });
  return NextResponse.json({ ok: true, favorite: true, item: { id: favorite.id, positionId: position.id, userId: auth.user.id, createdAt: favorite.createdAt.toISOString() } });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "positions");
  if (blocked) return blocked;
  const position = await findPosition(auth.user, params.id);
  if (!position) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  await prisma.positionFavorite.deleteMany({ where: { positionId: position.id, userId: auth.user.id } });
  await logAction({ actorId: auth.user.id, action: "position_unfavorited_api", entityType: "position", entityId: position.id, title: `Szenen-Favorit entfernt: ${position.name}`, href: `/positions/${position.slug}` });
  return NextResponse.json({ ok: true, favorite: false, positionId: position.id });
}
