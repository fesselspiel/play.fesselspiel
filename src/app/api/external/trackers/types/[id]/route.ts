import { NextRequest, NextResponse } from "next/server";
import { logAction, userDisplayName } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { canManageTrackerTypes, serializeTrackerType, trackerTypeData } from "@/lib/external-tracker-types";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function editableTracker(id: string, tenantId: string) {
  return prisma.trackerType.findFirst({
    where: { id, tenantId },
    include: { _count: { select: { entries: true } } }
  });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers");
  if (blocked) return blocked;
  if (!canManageTrackerTypes(auth.user) || !auth.user.tenantId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const { id } = await context.params;
  const current = await editableTracker(id, auth.user.tenantId);
  if (!current) return NextResponse.json({ ok: false, error: "tracker_not_found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const data = trackerTypeData(body, current);
  if (!data.title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });

  const [tracker] = await prisma.$transaction([
    prisma.trackerType.update({
      where: { id: current.id },
      data,
      include: { _count: { select: { entries: true } } }
    }),
    prisma.tenantFeature.upsert({
      where: { tenantId_key: { tenantId: auth.user.tenantId, key: `tracker.${current.key}` } },
      update: { enabled: data.enabled },
      create: { tenantId: auth.user.tenantId, key: `tracker.${current.key}`, enabled: data.enabled }
    })
  ]);
  await logAction({
    actorId: auth.user.id,
    action: "tracker_type_updated_api",
    entityType: "trackerType",
    entityId: tracker.id,
    title: `${userDisplayName(auth.user)} hat den Tracker ${tracker.title} bearbeitet`,
    href: "/settings/trackers"
  });
  const item = serializeTrackerType(tracker, { canEdit: true, featureEnabled: data.enabled });
  return NextResponse.json({ ok: true, item, tracker: item });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers");
  if (blocked) return blocked;
  if (!canManageTrackerTypes(auth.user) || !auth.user.tenantId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const { id } = await context.params;
  const tracker = await editableTracker(id, auth.user.tenantId);
  if (!tracker) return NextResponse.json({ ok: false, error: "tracker_not_found" }, { status: 404 });
  if (tracker._count.entries > 0) {
    return NextResponse.json({ ok: false, error: "tracker_has_entries", entryCount: tracker._count.entries }, { status: 409 });
  }
  await prisma.$transaction([
    prisma.tenantFeature.deleteMany({ where: { tenantId: auth.user.tenantId, key: `tracker.${tracker.key}` } }),
    prisma.trackerType.delete({ where: { id: tracker.id } })
  ]);
  await logAction({
    actorId: auth.user.id,
    action: "tracker_type_deleted_api",
    entityType: "trackerType",
    entityId: tracker.id,
    title: `${userDisplayName(auth.user)} hat den Tracker ${tracker.title} gelöscht`,
    href: "/settings/trackers"
  });
  return NextResponse.json({ ok: true, deletedId: tracker.id });
}
