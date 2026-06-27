import { NextRequest, NextResponse } from "next/server";
import type { ActivityStatus } from "@prisma/client";
import { ownerScope } from "@/lib/access";
import { createSessionHistoryForCompletedOrder, selfBondageCategory } from "@/lib/activity-orders";
import { activityStatusDisplay } from "@/lib/activity-status";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { activityInclude, serializeActivity } from "@/lib/external-mobile-serializers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function statusFromAction(action: string): ActivityStatus | null {
  if (action === "accept" || action === "accepted") return "PLANNED";
  if (action === "complete" || action === "done") return "DONE";
  if (action === "cancel" || action === "discard") return "DISCARDED";
  return null;
}

function actionForStatus(status: ActivityStatus) {
  if (status === "PLANNED") return "self_bondage_order_accepted";
  if (status === "DONE") return "self_bondage_order_completed";
  if (status === "DISCARDED") return "self_bondage_order_discarded";
  return "self_bondage_order_updated";
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "orders");
  if (blocked) return blocked;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const status = statusFromAction(String(body.action || body.status || "").trim().toLowerCase());
  if (!status) return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
  const existing = await prisma.activityPlan.findFirst({ where: { id: params.id, ...(await ownerScope(auth.user)), category: selfBondageCategory }, include: activityInclude });
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (status === "PLANNED" && existing.ownerId === auth.user.id) return NextResponse.json({ ok: false, error: "owner_cannot_accept" }, { status: 403 });
  const order = await prisma.activityPlan.update({ where: { id: existing.id }, data: { status }, include: activityInclude });
  const session = status === "DONE" ? await createSessionHistoryForCompletedOrder(order, auth.user.id) : null;
  await logAction({
    actorId: auth.user.id,
    action: actionForStatus(status),
    entityType: "activity",
    entityId: order.id,
    title: `Self-Bondage-Auftrag ${activityStatusDisplay(status, true)}: ${order.title}`,
    href: `/orders#order-${order.id}`,
    details: { status: activityStatusDisplay(status, true), orderUrl: `/activities/${order.slug}`, sessionUrl: session?.slug ? `/sessions/${session.slug}` : null, excludeActorFromTargets: true }
  });
  return NextResponse.json({ ok: true, item: serializeActivity(request, order), sessionId: session?.id || null });
}
