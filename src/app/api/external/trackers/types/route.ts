import { NextRequest, NextResponse } from "next/server";
import { logAction, userDisplayName } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import {
  canManageTrackerTypes,
  normalizeTrackerKey,
  serializeTrackerType,
  trackerTypeData
} from "@/lib/external-tracker-types";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers");
  if (blocked) return blocked;

  const canManage = canManageTrackerTypes(auth.user);
  const tenantId = auth.user.tenantId || "";
  const trackers = await prisma.trackerType.findMany({
    where: {
      OR: [
        { tenantId: null, enabled: true },
        { tenantId, ...(canManage ? {} : { enabled: true }) }
      ]
    },
    include: { _count: { select: { entries: true } } },
    orderBy: [{ title: "asc" }, { key: "asc" }]
  });
  const features = tenantId
    ? await prisma.tenantFeature.findMany({
        where: { tenantId, key: { in: trackers.map((tracker) => `tracker.${tracker.key}`) } },
        select: { key: true, enabled: true }
      })
    : [];
  const featureMap = new Map(features.map((feature) => [feature.key, feature.enabled]));
  const items = trackers.map((tracker) => serializeTrackerType(tracker, {
    canEdit: canManage && tracker.tenantId === tenantId,
    featureEnabled: featureMap.get(`tracker.${tracker.key}`) ?? tracker.enabled
  }));
  return NextResponse.json({ ok: true, count: items.length, items, trackers: items, permissions: { canCreate: canManage } });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers");
  if (blocked) return blocked;
  if (!canManageTrackerTypes(auth.user) || !auth.user.tenantId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const data = trackerTypeData(body);
  const key = normalizeTrackerKey(body.key ?? data.title);
  if (!data.title || !key) return NextResponse.json({ ok: false, error: "title_and_key_required" }, { status: 400 });
  const existing = await prisma.trackerType.findUnique({ where: { tenantId_key: { tenantId: auth.user.tenantId, key } } });
  if (existing) return NextResponse.json({ ok: false, error: "tracker_key_exists" }, { status: 409 });

  const [tracker] = await prisma.$transaction([
    prisma.trackerType.create({
      data: { tenantId: auth.user.tenantId, key, ...data },
      include: { _count: { select: { entries: true } } }
    }),
    prisma.tenantFeature.upsert({
      where: { tenantId_key: { tenantId: auth.user.tenantId, key: `tracker.${key}` } },
      update: { enabled: data.enabled },
      create: { tenantId: auth.user.tenantId, key: `tracker.${key}`, enabled: data.enabled }
    })
  ]);
  await logAction({
    actorId: auth.user.id,
    action: "tracker_type_created_api",
    entityType: "trackerType",
    entityId: tracker.id,
    title: `${userDisplayName(auth.user)} hat den Tracker ${tracker.title} angelegt`,
    href: "/settings/trackers"
  });
  const item = serializeTrackerType(tracker, { canEdit: true, featureEnabled: data.enabled });
  return NextResponse.json({ ok: true, item, tracker: item }, { status: 201 });
}
