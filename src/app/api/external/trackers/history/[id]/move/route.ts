import { NextRequest, NextResponse } from "next/server";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { formatDateInput } from "@/lib/dates";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";
import { findTrackerTypeForUser, moveTrackerEntryToType, TrackerEntryMoveError } from "@/lib/tracker-core";

export const runtime = "nodejs";

function responseItem(entry: NonNullable<Awaited<ReturnType<typeof moveTrackerEntryToType>>>) {
  const startedAt = entry.startTime.toISOString();
  const endedAt = entry.endTime?.toISOString() || null;
  const calendarDate = formatDateInput(entry.startTime);
  return {
    id: entry.id,
    trackerKey: entry.trackerType.key,
    key: entry.trackerType.key,
    trackerTitle: entry.trackerType.title,
    trackerName: entry.trackerType.title,
    title: entry.title || entry.trackerType.title,
    notes: entry.notes || "",
    note: entry.notes || "",
    startedAt,
    startTime: startedAt,
    endedAt,
    endTime: endedAt,
    date: calendarDate,
    day: calendarDate,
    calendarDate,
    durationMinutes: entry.durationMinutes,
    minutes: entry.durationMinutes,
    allDay: entry.allDay,
    color: entry.trackerType.color,
    colorHex: entry.trackerType.color
  };
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers");
  if (blocked) return blocked;

  const existing = await prisma.trackerEntry.findFirst({
    where: { ...(await ownerScope(auth.user)), OR: [{ id: params.id }, { slug: params.id }], trackerType: { enabled: true } },
    include: { trackerType: true }
  });
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (existing.ownerId !== auth.user.id && auth.user.role !== "ADMIN" && auth.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const trackerKey = String(body.trackerKey || body.targetTrackerKey || "").trim().toLowerCase();
  if (!trackerKey) return NextResponse.json({ ok: false, error: "missing_tracker_key" }, { status: 400 });
  const targetBlocked = apiFeatureGate(auth.user, "externalApi", "trackers", `tracker.${trackerKey}`);
  if (targetBlocked) return targetBlocked;
  const target = await findTrackerTypeForUser(trackerKey, auth.user);
  if (!target) return NextResponse.json({ ok: false, error: "tracker_not_found" }, { status: 404 });

  try {
    const moved = await moveTrackerEntryToType({ entry: existing, target });
    if (!moved) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    if (existing.trackerTypeId !== target.id) {
      await logAction({
        actorId: auth.user.id,
        action: "tracker_entry_moved_api",
        entityType: "trackerEntry",
        entityId: moved.id,
        title: `Tracker-Eintrag verschoben: ${existing.trackerType.title} → ${target.title}`,
        href: `/trackers/${target.key}/${moved.slug || moved.id}`,
        details: { fromTrackerKey: existing.trackerType.key, toTrackerKey: target.key }
      });
    }
    return NextResponse.json({ ok: true, item: responseItem(moved) });
  } catch (error) {
    if (error instanceof TrackerEntryMoveError) {
      return NextResponse.json({ ok: false, error: error.code }, { status: 409 });
    }
    throw error;
  }
}
