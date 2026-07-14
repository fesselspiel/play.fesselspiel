import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import { calendarEventSafetyExclusions, visibleCalendarEventWhere } from "@/lib/calendar-event-safety";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { calendarEventInclude, serializeCalendarEvent } from "@/lib/external-calendar-events";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function text(value: unknown) {
  return String(value || "").trim();
}

function date(value: unknown) {
  const parsed = new Date(text(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 100)));
  const from = date(searchParams.get("from"));
  const to = date(searchParams.get("to"));
  const exclusions = await calendarEventSafetyExclusions(auth.user);
  const items = await prisma.event.findMany({
    where: {
      ...(await visibleCalendarEventWhere(auth.user, exclusions)),
      ...(from || to ? { startsAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {})
    },
    include: calendarEventInclude,
    orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
    take: limit
  });
  return NextResponse.json({ ok: true, count: items.length, items: items.map((item) => serializeCalendarEvent(item, auth.user)) });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  const payload = await request.json().catch(() => ({}));
  const title = text(payload.title);
  const startsAt = date(payload.startsAt);
  if (!title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
  if (!startsAt) return NextResponse.json({ ok: false, error: "startsAt_required" }, { status: 400 });
  const event = await prisma.event.create({
    data: {
      tenantId: auth.user.tenantId || undefined,
      ownerId: auth.user.id,
      title,
      startsAt,
      location: text(payload.location) || null,
      description: text(payload.description) || null
    },
    include: calendarEventInclude
  });
  await logAction({ actorId: auth.user.id, action: "event_created_api", entityType: "event", entityId: event.id, title: `Termin per API angelegt: ${event.title}`, href: `/events/${event.id}/edit` });
  return NextResponse.json({ ok: true, item: serializeCalendarEvent(event, auth.user) }, { status: 201 });
}
