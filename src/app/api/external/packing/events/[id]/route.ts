import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { canManagePacking, packingEventInclude, packingVisibilityScope, serializePackingEvent } from "@/lib/packing";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { uniqueSlugForUpdate } from "@/lib/slug";

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

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "packingLists");
  if (blocked) return blocked;
  const item = await prisma.packingEvent.findFirst({ where: { id: params.id, ...packingVisibilityScope(auth.user) }, include: packingEventInclude });
  if (!item) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, item: serializePackingEvent(item, auth.user) });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "packingLists");
  if (blocked) return blocked;
  const existing = await prisma.packingEvent.findFirst({ where: { id: params.id, ...packingVisibilityScope(auth.user) } });
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (!canManagePacking(auth.user, existing.ownerId)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const payload = await request.json().catch(() => ({}));
  const title = text(payload.title) || existing.title;
  const item = await prisma.packingEvent.update({
    where: { id: existing.id },
    data: {
      title,
      slug: await uniqueSlugForUpdate("packingEvent", text(payload.slug) || title, existing.id, auth.user.tenantId),
      description: "description" in payload ? text(payload.description) || null : undefined,
      location: "location" in payload ? text(payload.location) || null : undefined,
      startsAt: "startsAt" in payload ? date(payload.startsAt) : undefined,
      eventId: "eventId" in payload ? text(payload.eventId) || null : undefined,
      visibility: "visibility" in payload ? (text(payload.visibility) || "PARTNER") as "PRIVATE" | "PARTNER" | "SHARED" : undefined
    },
    include: packingEventInclude
  });
  await logAction({ actorId: auth.user.id, action: "packing_event_updated_api", entityType: "packingEvent", entityId: item.id, title: `Pack-Event per API geändert: ${item.title}`, href: "/packing" });
  return NextResponse.json({ ok: true, item: serializePackingEvent(item, auth.user) });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "packingLists");
  if (blocked) return blocked;
  const existing = await prisma.packingEvent.findFirst({ where: { id: params.id, ...packingVisibilityScope(auth.user) } });
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (!canManagePacking(auth.user, existing.ownerId)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  await prisma.packingEvent.delete({ where: { id: existing.id } });
  await logAction({ actorId: auth.user.id, action: "packing_event_deleted_api", entityType: "packingEvent", entityId: existing.id, title: `Pack-Event per API gelöscht: ${existing.title}`, href: "/packing" });
  return NextResponse.json({ ok: true, id: existing.id });
}
