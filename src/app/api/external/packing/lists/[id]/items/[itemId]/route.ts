import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { packingListInclude, packingVisibilityScope, serializePackingList } from "@/lib/packing";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function bool(value: unknown) {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "on", "packed"].includes(text);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "packingLists");
  if (blocked) return blocked;
  const payload = await request.json().catch(() => ({}));
  const list = await prisma.packingList.findFirst({ where: { id: params.id, ...packingVisibilityScope(auth.user) }, include: { items: true } });
  if (!list) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const item = list.items.find((entry) => entry.id === params.itemId);
  if (!item) return NextResponse.json({ ok: false, error: "item_not_found" }, { status: 404 });
  const packed = bool(payload.packed);
  await prisma.packingListItem.update({ where: { id: item.id }, data: { packed, packedAt: packed ? new Date() : null, packedById: packed ? auth.user.id : null } });
  const updated = await prisma.packingList.findUniqueOrThrow({ where: { id: list.id }, include: packingListInclude });
  await logAction({ actorId: auth.user.id, action: packed ? "packing_item_packed_api" : "packing_item_unpacked_api", entityType: "packingListItem", entityId: item.id, title: `${packed ? "Eingepackt" : "Ausgepackt"} per API: ${list.title}`, href: `/packing/${list.slug}`, details: { listId: list.id, toyId: item.toyId } });
  return NextResponse.json({ ok: true, item: serializePackingList(updated, auth.user) });
}
