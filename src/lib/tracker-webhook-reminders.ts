import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { quotaSummaryText, trackerQuotaStatusForUser } from "@/lib/tracker-quotas";

const MAX_DELAY_MINUTES = 7 * 24 * 60;

export function webhookReminderDelay(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isInteger(parsed) ? Math.min(MAX_DELAY_MINUTES, Math.max(0, parsed)) : 0;
}

export async function deliverTrackerWebhookReminder(input: {
  userId: string;
  tenantId: string;
  trackerKey: string;
  source: string;
  entityId: string;
}) {
  const status = (await trackerQuotaStatusForUser({ id: input.userId, tenantId: input.tenantId }))
    .find((entry) => entry.tracker.key === input.trackerKey);
  if (!status) return { delivered: false, reason: "tracker_not_found" } as const;
  if (!status.hasQuota || status.complete) {
    return { delivered: false, reason: status.hasQuota ? "quota_complete" : "quota_missing" } as const;
  }

  const recent = await prisma.auditLog.findFirst({
    where: {
      action: "tracker_quota_reminder",
      entityType: "trackerQuota",
      entityId: input.entityId,
      createdAt: { gte: new Date(Date.now() - 15 * 60_000) }
    },
    select: { id: true }
  });
  if (recent) return { delivered: false, reason: "cooldown" } as const;

  await logAction({
    actorId: input.userId,
    action: "tracker_quota_reminder",
    entityType: "trackerQuota",
    entityId: input.entityId,
    title: `Tracker-Kontingent offen: ${status.tracker.title}`,
    details: {
      trackerKey: status.tracker.key,
      trackerTitle: status.tracker.title,
      targetUserId: input.userId,
      targetScreen: "quotas",
      targetId: status.tracker.key,
      reminderReason: "external_webhook",
      reminderSource: input.source,
      summary: quotaSummaryText(status)
    },
    href: "/settings/trackers"
  });
  return { delivered: true, trackerKey: status.tracker.key } as const;
}

export async function runDueTrackerWebhookReminders(now = new Date()) {
  await prisma.trackerReminderJob.updateMany({
    where: {
      status: "PROCESSING",
      createdAt: { lte: new Date(now.getTime() - 15 * 60_000) }
    },
    data: { status: "PENDING", message: "retry_after_interruption" }
  });
  const jobs = await prisma.trackerReminderJob.findMany({
    where: { status: "PENDING", dueAt: { lte: now } },
    orderBy: { dueAt: "asc" },
    take: 100
  });
  let delivered = 0;
  let skipped = 0;
  for (const job of jobs) {
    const claimed = await prisma.trackerReminderJob.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: { status: "PROCESSING" }
    });
    if (!claimed.count) continue;
    const result = await deliverTrackerWebhookReminder({
      userId: job.userId,
      tenantId: job.tenantId,
      trackerKey: job.trackerKey,
      source: job.source,
      entityId: `${job.trackerTypeId}:${job.userId}:webhook:delayed`
    });
    await prisma.trackerReminderJob.update({
      where: { id: job.id },
      data: {
        status: result.delivered ? "SENT" : "SKIPPED",
        processedAt: now,
        message: result.delivered ? "sent" : result.reason
      }
    });
    if (result.delivered) delivered += 1;
    else skipped += 1;
  }
  return { checked: jobs.length, delivered, skipped };
}
