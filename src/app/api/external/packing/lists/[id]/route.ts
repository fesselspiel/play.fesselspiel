import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { canManagePacking, packingListInclude, packingVisibilityScope, serializePackingList } from "@/lib/packing";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { uniqueSlugForUpdate } from "@/lib/slug";

export const runtime = "nodejs";

function text(value: unknown) {
  return String(value || "").trim();
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "packingLists");
  if (blocked) return blocked;
  const item = await prisma.packingList.findFirst({ where: { id: params.id, ...packingVisibilityScope(auth.user) }, include: packingListInclude });
  if (!item) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, item: serializePackingList(item, auth.user) });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "packingLists");
  if (blocked) return blocked;
  const existing = await prisma.packingList.findFirst({ where: { id: params.id, ...packingVisibilityScope(auth.user) } });
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (!canManagePacking(auth.user, existing.ownerId)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const payload = await request.json().catch(() => ({}));
  const title = text(payload.title) || existing.title;
  const item = await prisma.packingList.update({
    where: { id: existing.id },
    data: {
      title,
      slug: await uniqueSlugForUpdate("packingList", text(payload.slug) || title, existing.id, auth.user.tenantId),
      note: "note" in payload ? text(payload.note) || null : undefined,
      packingEventId: "packingEventId" in payload ? text(payload.packingEventId) || null : undefined,
      eventId: "eventId" in payload ? text(payload.eventId) || null : undefined,
      visibility: "visibility" in payload ? (text(payload.visibility) || "PARTNER") as "PRIVATE" | "PARTNER" | "SHARED" : undefined
    },
    include: packingListInclude
  });
  await logAction({ actorId: auth.user.id, action: "packing_list_updated_api", entityType: "packingList", entityId: item.id, title: `Packliste per API geändert: ${item.title}`, href: `/packing/${item.slug}` });
  return NextResponse.json({ ok: true, item: serializePackingList(item, auth.user) });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "packingLists");
  if (blocked) return blocked;
  const existing = await prisma.packingList.findFirst({ where: { id: params.id, ...packingVisibilityScope(auth.user) } });
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (!canManagePacking(auth.user, existing.ownerId)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  await prisma.packingList.delete({ where: { id: existing.id } });
  await logAction({ actorId: auth.user.id, action: "packing_list_deleted_api", entityType: "packingList", entityId: existing.id, title: `Packliste per API gelöscht: ${existing.title}`, href: "/packing" });
  return NextResponse.json({ ok: true, id: existing.id });
}
