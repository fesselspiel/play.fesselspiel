import { notFound, redirect } from "next/navigation";
import type { ActivityStatus } from "@prisma/client";
import { ownerScope } from "@/lib/access";
import { activityStatusDisplay } from "@/lib/activity-status";
import { logAction } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { minutesBetween } from "@/lib/dates";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";
import { uniqueTrackerSlug } from "@/lib/tracker-core";

export const selfBondageCategory = "SELF_BONDAGE_ORDER";

export function isSelfBondageOrder(activity: { category?: string | null }) {
  return activity.category === selfBondageCategory || activity.category === "Self-Bondage";
}

function orderActionForStatus(status: ActivityStatus) {
  if (status === "PLANNED") return "self_bondage_order_accepted";
  if (status === "DONE") return "self_bondage_order_completed";
  if (status === "DISCARDED") return "self_bondage_order_discarded";
  return "self_bondage_order_updated";
}

function orderTitleForStatus(title: string, status: ActivityStatus) {
  if (status === "PLANNED") return `Auftrag angenommen: ${title}`;
  if (status === "DONE") return `Auftrag umgesetzt: ${title}`;
  if (status === "DISCARDED") return `Auftrag verworfen: ${title}`;
  return `Auftrag aktualisiert: ${title}`;
}

export async function createSessionHistoryForCompletedOrder(activity: {
  id: string;
  tenantId: string | null;
  title: string;
  slug: string;
  note: string | null;
  plannedAt: Date | null;
}, userId: string) {
  const trackerType = await prisma.trackerType.findFirst({
    where: {
      key: "segufix",
      enabled: true,
      ...(activity.tenantId ? { OR: [{ tenantId: activity.tenantId }, { tenantId: null }] } : {})
    }
  });
  if (!trackerType) return null;
  const existing = await prisma.trackerEntry.findFirst({
    where: {
      trackerTypeId: trackerType.id,
      ownerId: userId,
      notes: { contains: `Auftrag-ID: ${activity.id}` }
    },
    select: { id: true }
  });
  if (existing) return null;

  const endTime = new Date();
  const startTime = activity.plannedAt && activity.plannedAt < endTime ? activity.plannedAt : endTime;
  return prisma.trackerEntry.create({
    data: {
      tenantId: activity.tenantId || undefined,
      ownerId: userId,
      trackerTypeId: trackerType.id,
      slug: await uniqueTrackerSlug(trackerType.id, trackerType.key, startTime),
      title: activity.title,
      startTime,
      endTime,
      durationMinutes: minutesBetween(startTime, endTime),
      notes: [
        `Kategorie: Auftrag`,
        `Auftrag: ${activity.title}`,
        `Auftrag-ID: ${activity.id}`,
        `Auftrag-Link: /activities/${activity.slug}`,
        activity.note ? `Anweisung:\n${activity.note}` : ""
      ].filter(Boolean).join("\n\n"),
      fieldValues: {
        moodBefore: "NEUTRAL",
        moodAfter: "RELAXED",
        source: "self_bondage_order"
      }
    }
  });
}

export async function updateSelfBondageOrderStatus(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("orders");
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "") as ActivityStatus;
  if (!["REQUESTED", "PLANNED", "DONE", "DISCARDED"].includes(status)) redirect("/orders");

  const activity = await prisma.activityPlan.findFirst({
    where: { id, ...(await ownerScope(user)), category: selfBondageCategory },
    include: { owner: { include: { profile: true } } }
  });
  if (!activity) notFound();

  if (status === "PLANNED" && activity.ownerId === user.id) {
    redirect(`/orders#order-${activity.id}`);
  }

  const updated = await prisma.activityPlan.update({
    where: { id: activity.id },
    data: { status }
  });
  const session = status === "DONE"
    ? await createSessionHistoryForCompletedOrder(updated, user.id)
    : null;

  await logAction({
    actorId: user.id,
    action: orderActionForStatus(status),
    entityType: "activity",
    entityId: updated.id,
    title: orderTitleForStatus(updated.title, status),
    href: `/orders#order-${updated.id}`,
    details: {
      status: activityStatusDisplay(status, true),
      orderUrl: `/activities/${updated.slug}`,
      sessionUrl: session?.slug ? `/sessions/${session.slug}` : null,
      excludeActorFromTargets: true
    }
  });
  redirect(`/orders#order-${updated.id}`);
}
