import { NextRequest, NextResponse } from "next/server";
import { mediaVisibilityScope, ownerScope } from "@/lib/access";
import { formatDateInput } from "@/lib/dates";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";
import { quotaSummaryText, trackerQuotaStatusForUser } from "@/lib/tracker-quotas";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  const scope = await ownerScope(auth.user);
  const mediaScope = await mediaVisibilityScope(auth.user);
  const [toys, positions, activities, media, openTrackers, recentTrackerEntries, quotas] = await Promise.all([
    prisma.toy.count({ where: scope }),
    prisma.position.count({ where: scope }),
    prisma.activityPlan.count({ where: { ...scope, category: { not: "IDEA_COLLECTION" }, status: { in: ["REQUESTED", "PLANNED"] } } }),
    prisma.media.count({ where: mediaScope }),
    prisma.trackerEntry.findMany({
      where: { ownerId: auth.user.id, tenantId: auth.user.tenantId || undefined, endTime: null, allDay: false },
      include: { trackerType: true },
      orderBy: { startTime: "desc" }
    }),
    prisma.trackerEntry.findMany({
      where: { ...scope, trackerType: { enabled: true } },
      include: { trackerType: true },
      orderBy: { startTime: "desc" },
      take: 20
    }),
    trackerQuotaStatusForUser(auth.user)
  ]);
  return NextResponse.json({
    ok: true,
    user: { id: auth.user.id, name: auth.user.profile?.displayName || auth.user.name || auth.user.username || auth.user.email },
    counts: { toys, positions, plannedActivities: activities, media },
    openTrackers: openTrackers.map((entry) => ({
      id: entry.id,
      key: entry.trackerType.key,
      title: entry.trackerType.title,
      startTime: entry.startTime,
      url: `/trackers/${entry.trackerType.key}/${entry.slug || entry.id}`
    })),
    recentTrackerEntries: recentTrackerEntries.map((entry) => ({
      id: entry.id,
      trackerKey: entry.trackerType.key,
      key: entry.trackerType.key,
      trackerTitle: entry.trackerType.title,
      title: entry.title || entry.trackerType.title,
      notes: entry.notes || "",
      startedAt: entry.startTime.toISOString(),
      startTime: entry.startTime.toISOString(),
      date: formatDateInput(entry.startTime),
      calendarDate: formatDateInput(entry.startTime),
      endedAt: entry.endTime?.toISOString() || null,
      endTime: entry.endTime?.toISOString() || null,
      durationMinutes: entry.durationMinutes,
      minutes: entry.durationMinutes,
      allDay: entry.allDay,
      href: `/trackers/${entry.trackerType.key}/${entry.slug || entry.id}`,
      url: `/trackers/${entry.trackerType.key}/${entry.slug || entry.id}`
    })),
    quotas: quotas.filter((entry) => entry.hasQuota).map((entry) => ({
      tracker: entry.tracker,
      complete: entry.complete,
      summary: quotaSummaryText(entry),
      daily: entry.daily,
      weekly: entry.weekly,
      monthlyMinutes: entry.monthlyMinutes,
      monthlyDays: entry.monthlyDays
    }))
  });
}
