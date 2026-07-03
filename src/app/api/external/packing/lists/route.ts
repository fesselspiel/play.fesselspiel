import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { packingListInclude, packingVisibilityScope, serializePackingList } from "@/lib/packing";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { uniqueSlug } from "@/lib/slug";

export const runtime = "nodejs";

function text(value: unknown) {
  return String(value || "").trim();
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "packingLists");
  if (blocked) return blocked;
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 50)));
  const lists = await prisma.packingList.findMany({
    where: packingVisibilityScope(auth.user),
    include: packingListInclude,
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    take: limit
  });
  return NextResponse.json({ ok: true, count: lists.length, items: lists.map((list) => serializePackingList(list, auth.user)) });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "packingLists");
  if (blocked) return blocked;
  const payload = await request.json().catch(() => ({}));
  const title = text(payload.title);
  if (!title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
  const toyIds: string[] = Array.isArray(payload.toyIds) ? Array.from(new Set(payload.toyIds.map(String).filter(Boolean))) : [];
  const list = await prisma.packingList.create({
    data: {
      tenantId: auth.user.tenantId,
      ownerId: auth.user.id,
      title,
      slug: await uniqueSlug("packingList", title, auth.user.tenantId),
      packingEventId: text(payload.packingEventId) || null,
      eventId: text(payload.eventId) || null,
      note: text(payload.note) || null,
      visibility: (text(payload.visibility) || "PARTNER") as "PRIVATE" | "PARTNER" | "SHARED",
      items: { create: toyIds.map((toyId, index) => ({ toyId, sortOrder: index })) }
    },
    include: packingListInclude
  });
  await logAction({ actorId: auth.user.id, action: "packing_list_created_api", entityType: "packingList", entityId: list.id, title: `Packliste per API angelegt: ${list.title}`, href: `/packing/${list.slug}`, details: { itemCount: toyIds.length } });
  return NextResponse.json({ ok: true, item: serializePackingList(list, auth.user) });
}
