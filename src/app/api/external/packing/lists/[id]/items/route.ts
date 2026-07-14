import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { packingListInclude, packingVisibilityScope, serializePackingList } from "@/lib/packing";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "packingLists");
  if (blocked) return blocked;
  const payload = await request.json().catch(() => ({}));
  const toyId = String(payload.toyId || "").trim();
  if (!toyId) return NextResponse.json({ ok: false, error: "toyId_required" }, { status: 400 });
  const list = await prisma.packingList.findFirst({ where: { id: params.id, ...packingVisibilityScope(auth.user) }, include: { items: true } });
  if (!list) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  await prisma.packingListItem.upsert({
    where: { listId_toyId: { listId: list.id, toyId } },
    update: { quantity: Math.max(1, Number(payload.quantity || 1)), note: String(payload.note || "").trim() || null },
    create: { listId: list.id, toyId, quantity: Math.max(1, Number(payload.quantity || 1)), note: String(payload.note || "").trim() || null, sortOrder: list.items.length }
  });
  const updated = await prisma.packingList.findUniqueOrThrow({ where: { id: list.id }, include: packingListInclude });
  await logAction({ actorId: auth.user.id, action: "packing_item_added_api", entityType: "packingList", entityId: list.id, title: `Spielzeug per API zur Packliste hinzugefügt: ${list.title}`, href: `/packing/${list.slug}`, details: { toyId } });
  return NextResponse.json({ ok: true, item: serializePackingList(updated, auth.user) });
}
