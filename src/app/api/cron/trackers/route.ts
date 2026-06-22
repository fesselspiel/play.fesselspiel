import { NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { quotaSummaryText, trackerQuotaStatusForUser } from "@/lib/tracker-quotas";

export const runtime = "nodejs";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!env.cronSecret || token !== env.cronSecret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const activeTrackers = await prisma.trackerType.findMany({
    where: {
      enabled: true,
      quotaReminderEnabled: true,
      tenantId: { not: null },
      OR: [
        { quotaDailyMinutes: { not: null } },
        { quotaWeeklyMinutes: { not: null } },
        { quotaMonthlyDays: { not: null } },
        { quotaMonthlyMinutes: { not: null } }
      ]
    },
    select: { tenantId: true, key: true }
  });
  const tenants = Array.from(new Set(activeTrackers.map((entry) => entry.tenantId).filter(Boolean))) as string[];
  let reminders = 0;
  const dateKey = todayKey();
  for (const tenantId of tenants) {
    const users = await prisma.tenantMembership.findMany({
      where: { tenantId, active: true, user: { active: true } },
      include: { user: { include: { profile: true } } }
    });
    for (const membership of users) {
      const statuses = await trackerQuotaStatusForUser(membership.user);
      for (const status of statuses.filter((entry) => entry.hasQuota && !entry.complete)) {
        const entityId = `${status.tracker.id}:${membership.userId}:${dateKey}`;
        const existing = await prisma.auditLog.findFirst({
          where: { action: "tracker_quota_reminder", entityType: "trackerQuota", entityId }
        });
        if (existing) continue;
        await logAction({
          actorId: membership.userId,
          action: "tracker_quota_reminder",
          entityType: "trackerQuota",
          entityId,
          title: `Tracker-Kontingent offen: ${status.tracker.title}`,
          details: {
            trackerKey: status.tracker.key,
            trackerTitle: status.tracker.title,
            summary: quotaSummaryText(status),
            daily: status.daily,
            weekly: status.weekly,
            monthlyMinutes: status.monthlyMinutes,
            monthlyDays: status.monthlyDays
          },
          href: "/sessions"
        });
        reminders += 1;
      }
    }
  }
  return NextResponse.json({ ok: true, reminders });
}
