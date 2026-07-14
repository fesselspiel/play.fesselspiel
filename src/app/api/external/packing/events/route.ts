import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { packingEventInclude, serializePackingEvent } from "@/lib/packing";
import { packingSafetyExclusions, visiblePackingWhere } from "@/lib/packing-safety";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { uniqueSlug } from "@/lib/slug";

export const runtime = "nodejs";

function text(value: unknown) {
  return String(value || "").trim();
}

function date(value: unknown) {
  const input = text(value);
  if (!input) return null;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function stringArray(value: unknown) {
  if (Array.isArray(value)) return Array.from(new Set(value.map(String).map((entry) => entry.trim()).filter(Boolean)));
  if (typeof value === "string") return Array.from(new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean)));
  return [];
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "packingLists");
  if (blocked) return blocked;
  const exclusions = await packingSafetyExclusions(auth.user);
  const items = await prisma.packingEvent.findMany({ where: visiblePackingWhere(auth.user, "event", exclusions), include: packingEventInclude, orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }] });
  return NextResponse.json({ ok: true, count: items.length, items: items.map((item) => serializePackingEvent(item, auth.user, exclusions)) });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "packingLists");
  if (blocked) return blocked;
  const payload = await request.json().catch(() => ({}));
  const title = text(payload.title);
  if (!title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
  const exclusions = await packingSafetyExclusions(auth.user);
  const listIds = stringArray(payload.listIds);
  const item = await prisma.$transaction(async (tx) => {
    const packingEvent = await tx.packingEvent.create({
      data: {
        tenantId: auth.user.tenantId,
        ownerId: auth.user.id,
        title,
        slug: await uniqueSlug("packingEvent", title, auth.user.tenantId),
        description: text(payload.description) || null,
        location: text(payload.location) || null,
        startsAt: date(payload.startsAt),
        eventId: text(payload.eventId) || null,
        visibility: (text(payload.visibility) || "PARTNER") as "PRIVATE" | "PARTNER" | "SHARED"
      }
    });
    if (listIds.length) {
      const lists = await tx.packingList.findMany({ where: { id: { in: listIds }, ...visiblePackingWhere(auth.user, "list", exclusions) }, select: { id: true, ownerId: true } });
      const allowedIds = lists.filter((list) => list.ownerId === auth.user.id || auth.user.role === "ADMIN" || auth.user.role === "SUPER_ADMIN").map((list) => list.id);
      if (allowedIds.length) await tx.packingList.updateMany({ where: { id: { in: allowedIds } }, data: { packingEventId: packingEvent.id, eventId: packingEvent.eventId || null } });
    }
    return tx.packingEvent.findUniqueOrThrow({ where: { id: packingEvent.id }, include: packingEventInclude });
  });
  await logAction({ actorId: auth.user.id, action: "packing_event_created_api", entityType: "packingEvent", entityId: item.id, title: `Pack-Event per API angelegt: ${item.title}`, href: "/packing", details: { eventId: item.eventId } });
  return NextResponse.json({ ok: true, item: serializePackingEvent(item, auth.user, exclusions) });
}
