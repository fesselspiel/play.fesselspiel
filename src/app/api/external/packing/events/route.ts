import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { packingEventInclude, packingVisibilityScope, serializePackingEvent } from "@/lib/packing";
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

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "packingLists");
  if (blocked) return blocked;
  const items = await prisma.packingEvent.findMany({ where: packingVisibilityScope(auth.user), include: packingEventInclude, orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }] });
  return NextResponse.json({ ok: true, count: items.length, items: items.map((item) => serializePackingEvent(item, auth.user)) });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "packingLists");
  if (blocked) return blocked;
  const payload = await request.json().catch(() => ({}));
  const title = text(payload.title);
  if (!title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
  const item = await prisma.packingEvent.create({
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
    },
    include: packingEventInclude
  });
  await logAction({ actorId: auth.user.id, action: "packing_event_created_api", entityType: "packingEvent", entityId: item.id, title: `Pack-Event per API angelegt: ${item.title}`, href: "/packing", details: { eventId: item.eventId } });
  return NextResponse.json({ ok: true, item: serializePackingEvent(item, auth.user) });
}
