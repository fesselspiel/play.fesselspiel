import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { calendarEventInclude, findCalendarEventForUser, serializeCalendarEvent } from "@/lib/external-calendar-events";
import { prisma } from "@/lib/prisma";

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

function canManage(user: { id: string; role?: string | null }, ownerId: string) {
  return user.id === ownerId || user.role === "ADMIN" || user.role === "SUPER_ADMIN";
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  const event = await findCalendarEventForUser(auth.user, params.id);
  if (!event) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, item: serializeCalendarEvent(event, auth.user.id) });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  const existing = await findCalendarEventForUser(auth.user, params.id);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (!canManage(auth.user, existing.ownerId)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const payload = await request.json().catch(() => ({}));
  const event = await prisma.event.update({
    where: { id: existing.id },
    data: {
      ...(payload.title !== undefined ? { title: text(payload.title) || existing.title } : {}),
      ...(payload.startsAt !== undefined ? { startsAt: date(payload.startsAt) || existing.startsAt } : {}),
      ...(payload.location !== undefined ? { location: text(payload.location) || null } : {}),
      ...(payload.description !== undefined ? { description: text(payload.description) || null } : {})
    },
    include: calendarEventInclude
  });
  await logAction({ actorId: auth.user.id, action: "event_updated_api", entityType: "event", entityId: event.id, title: `Termin per API geändert: ${event.title}`, href: `/events/${event.id}/edit` });
  return NextResponse.json({ ok: true, item: serializeCalendarEvent(event, auth.user.id) });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  const existing = await findCalendarEventForUser(auth.user, params.id);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (!canManage(auth.user, existing.ownerId)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  await prisma.event.delete({ where: { id: existing.id } });
  await logAction({ actorId: auth.user.id, action: "event_deleted_api", entityType: "event", entityId: existing.id, title: `Termin per API gelöscht: ${existing.title}`, href: "/events" });
  return NextResponse.json({ ok: true, id: existing.id });
}
