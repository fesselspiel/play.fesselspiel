import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requestValues, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";
import { trackerQuotaStatusForUser } from "@/lib/tracker-quotas";
import { deliverTrackerWebhookReminder, webhookReminderDelay } from "@/lib/tracker-webhook-reminders";

export const runtime = "nodejs";

async function triggerReminder(request: NextRequest, trackerKey: string) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers", `tracker.${trackerKey}`);
  if (blocked) return blocked;

  const status = (await trackerQuotaStatusForUser(auth.user)).find((entry) => entry.tracker.key === trackerKey);
  if (!status) return NextResponse.json({ ok: false, error: "tracker_not_found" }, { status: 404 });
  if (!status.hasQuota || status.complete) {
    return NextResponse.json({ ok: true, reminded: false, reason: status.hasQuota ? "quota_complete" : "quota_missing" });
  }

  const values = await requestValues(request);
  const source = String(values.get("source") || "webhook").trim().slice(0, 60) || "webhook";
  const delayMinutes = webhookReminderDelay(values.get("delayMinutes"));
  const entityId = `${status.tracker.id}:${auth.user.id}:webhook:${status.quotaEntityId}`;
  if (delayMinutes > 0) {
    const pending = await prisma.trackerReminderJob.findFirst({
      where: {
        userId: auth.user.id,
        trackerTypeId: status.tracker.id,
        source,
        status: "PENDING",
        dueAt: { gte: new Date(Date.now() - 15 * 60_000) }
      },
      orderBy: { createdAt: "desc" }
    });
    if (pending) {
      return NextResponse.json({ ok: true, reminded: false, scheduled: true, reason: "already_scheduled", scheduledFor: pending.dueAt });
    }
    const dueAt = new Date(Date.now() + delayMinutes * 60_000);
    const job = await prisma.trackerReminderJob.create({
      data: {
        tenantId: auth.user.tenantId!,
        userId: auth.user.id,
        trackerTypeId: status.tracker.id,
        trackerKey: status.tracker.key,
        source,
        dueAt
      }
    });
    return NextResponse.json({
      ok: true,
      reminded: false,
      scheduled: true,
      trackerKey: status.tracker.key,
      source,
      delayMinutes,
      scheduledFor: job.dueAt
    });
  }
  const result = await deliverTrackerWebhookReminder({
    userId: auth.user.id,
    tenantId: auth.user.tenantId!,
    trackerKey: status.tracker.key,
    source,
    entityId
  });
  return NextResponse.json({ ok: true, reminded: result.delivered, trackerKey: status.tracker.key, source, reason: result.delivered ? undefined : result.reason });
}

export async function GET(request: NextRequest, context: { params: Promise<{ trackerKey: string }> }) {
  const { trackerKey } = await context.params;
  return triggerReminder(request, trackerKey);
}

export async function POST(request: NextRequest, context: { params: Promise<{ trackerKey: string }> }) {
  const { trackerKey } = await context.params;
  return triggerReminder(request, trackerKey);
}
