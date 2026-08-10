import { NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { runDueScheduledRules } from "@/lib/scheduled-rules";
import { runDueAutomationActions } from "@/lib/session-automation";
import { trackerReminderSchedule } from "@/lib/external-tracker-types";
import { trackerQuotaReminderDecisions } from "@/lib/tracker-quota-reminders";
import { quotaSummaryText, trackerQuotaStatusForUser } from "@/lib/tracker-quotas";
import { runDueTrackerWebhookReminders } from "@/lib/tracker-webhook-reminders";

export const runtime = "nodejs";

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
    select: {
      id: true,
      tenantId: true,
      key: true,
      quotaReminderIntervalMinutes: true,
      quotaReminderSchedule: true,
      quotaDailyMinutes: true,
      quotaWeeklyMinutes: true,
      quotaWeekStartsOn: true,
      quotaMonthlyDays: true,
      quotaMonthlyMinutes: true
    }
  });
  const tenants = Array.from(new Set(activeTrackers.map((entry) => entry.tenantId).filter(Boolean))) as string[];
  const schedules = new Map(activeTrackers.map((entry) => [entry.id, trackerReminderSchedule(entry.quotaReminderSchedule, {
    enabled: true,
    interval: entry.quotaReminderIntervalMinutes,
    weekStartsOn: entry.quotaWeekStartsOn,
    dailyQuota: entry.quotaDailyMinutes,
    weeklyQuota: entry.quotaWeeklyMinutes,
    monthlyDaysQuota: entry.quotaMonthlyDays,
    monthlyMinutesQuota: entry.quotaMonthlyMinutes
  })]));
  let reminders = 0;
  const now = new Date();
  for (const tenantId of tenants) {
    const users = await prisma.tenantMembership.findMany({
      where: { tenantId, active: true, user: { active: true } },
      include: { user: { include: { profile: true } } }
    });
    for (const membership of users) {
      const statuses = await trackerQuotaStatusForUser(membership.user);
      for (const status of statuses.filter((entry) => entry.hasQuota && !entry.complete)) {
        const schedule = schedules.get(status.tracker.id);
        if (!schedule) continue;
        for (const decision of trackerQuotaReminderDecisions(status, schedule, now)) {
          const entityId = `${status.tracker.id}:${membership.userId}:${decision.period}:${decision.periodKey}`;
          const existing = await prisma.auditLog.findFirst({
            where: {
              action: "tracker_quota_reminder",
              entityType: "trackerQuota",
              entityId,
              createdAt: { gte: new Date(now.getTime() - decision.repeatMinutes * 60_000) }
            },
            orderBy: { createdAt: "desc" }
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
              targetUserId: membership.userId,
              targetScreen: "quotas",
              targetId: status.tracker.key,
              reminderIntervalMinutes: decision.repeatMinutes,
              reminderReason: decision.period,
              summary: quotaSummaryText(status),
              daily: status.daily,
              weekly: status.weekly,
              monthlyMinutes: status.monthlyMinutes,
              monthlyDays: status.monthlyDays
            },
            href: "/settings/trackers"
          });
          reminders += 1;
        }
      }
    }
  }
  const scheduledRules = await runDueScheduledRules(new Date());
  const webhookReminders = await runDueTrackerWebhookReminders(new Date());
  const automationActions = await runDueAutomationActions(new Date());
  return NextResponse.json({ ok: true, reminders, scheduledRules, webhookReminders, automationActions });
}
