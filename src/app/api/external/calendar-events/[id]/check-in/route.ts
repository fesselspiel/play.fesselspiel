import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { calendarEventInclude, findCalendarEventForUser, serializeCalendarEvent } from "@/lib/external-calendar-events";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function text(value: unknown) {
  return String(value || "").trim();
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  const event = await findCalendarEventForUser(auth.user, params.id);
  if (!event) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const payload = await request.json().catch(() => ({}));
  await prisma.checkIn.upsert({
    where: { eventId_userId: { eventId: event.id, userId: auth.user.id } },
    update: { note: text(payload.note) || null },
    create: { eventId: event.id, userId: auth.user.id, note: text(payload.note) || null }
  });
  const updated = await prisma.event.findUniqueOrThrow({ where: { id: event.id }, include: calendarEventInclude });
  await logAction({ actorId: auth.user.id, action: "event_check_in_api", entityType: "event", entityId: event.id, title: `Bei Termin eingecheckt: ${event.title}`, href: `/events/${event.id}/edit` });
  return NextResponse.json({ ok: true, item: serializeCalendarEvent(updated, auth.user.id) });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  const event = await findCalendarEventForUser(auth.user, params.id);
  if (!event) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  await prisma.checkIn.deleteMany({ where: { eventId: event.id, userId: auth.user.id } });
  const updated = await prisma.event.findUniqueOrThrow({ where: { id: event.id }, include: calendarEventInclude });
  await logAction({ actorId: auth.user.id, action: "event_check_out_api", entityType: "event", entityId: event.id, title: `Check-in entfernt: ${event.title}`, href: `/events/${event.id}/edit` });
  return NextResponse.json({ ok: true, item: serializeCalendarEvent(updated, auth.user.id) });
}
