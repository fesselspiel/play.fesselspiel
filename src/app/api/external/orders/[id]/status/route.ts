import { NextRequest, NextResponse } from "next/server";
import type { ActivityStatus } from "@prisma/client";
import { ownerScope } from "@/lib/access";
import { createSessionHistoryForCompletedOrder, selfBondageCategory } from "@/lib/activity-orders";
import { activityStatusDisplay } from "@/lib/activity-status";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { activityInclude, serializeActivity } from "@/lib/external-mobile-serializers";
import { prisma } from "@/lib/prisma";
import { consentMutation, effectiveConsentStatus, parsedConsentAction, type ActivityConsentAction } from "@/lib/activity-consent";

export const runtime = "nodejs";

function consentActionFromBody(value: unknown): ActivityConsentAction | null {
  const parsed = parsedConsentAction(value);
  if (parsed) return parsed;
  const action = String(value || "").trim().toLowerCase();
  if (action === "accept" || action === "accepted" || action === "planned") return "ACCEPT";
  if (action === "complete" || action === "done") return "COMPLETE";
  if (action === "decline" || action === "rejected") return "DECLINE";
  if (action === "revoke" || action === "revoked") return "REVOKE";
  if (action === "cancel" || action === "discard" || action === "discarded") return "CANCEL";
  return null;
}

function actionForStatus(status: ActivityStatus) {
  if (status === "PLANNED") return "self_bondage_order_accepted";
  if (status === "DONE") return "self_bondage_order_completed";
  if (status === "DISCARDED") return "self_bondage_order_discarded";
  return "self_bondage_order_updated";
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "orders");
  if (blocked) return blocked;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  let consentAction = consentActionFromBody(body.consentAction || body.action || body.status);
  if (!consentAction) return NextResponse.json({ ok: false, error: "invalid_consent_action" }, { status: 400 });
  const existing = await prisma.activityPlan.findFirst({ where: { id: params.id, ...(await ownerScope(auth.user)), category: selfBondageCategory }, include: activityInclude });
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (consentAction === "CANCEL" && existing.ownerId !== auth.user.id) consentAction = effectiveConsentStatus(existing) === "ACCEPTED" ? "REVOKE" : "DECLINE";
  const transition = consentMutation(existing, auth.user, consentAction);
  if (!transition) return NextResponse.json({ ok: false, error: "consent_transition_forbidden" }, { status: 409 });
  const order = await prisma.activityPlan.update({ where: { id: existing.id }, data: transition.data, include: activityInclude });
  const session = consentAction === "COMPLETE" ? await createSessionHistoryForCompletedOrder(order, auth.user.id) : null;
  await logAction({
    actorId: auth.user.id,
    action: actionForStatus(transition.activityStatus),
    entityType: "activity",
    entityId: order.id,
    title: `Auftrag ${activityStatusDisplay(transition.activityStatus, true)}: ${order.title}`,
    href: `/orders#order-${order.id}`,
    details: { status: transition.resultingStatus, consentVersion: order.consentVersion, acceptedVersion: order.acceptedVersion, orderUrl: `/activities/${order.slug}`, sessionUrl: session?.slug ? `/sessions/${session.slug}` : null, excludeActorFromTargets: true }
  });
  return NextResponse.json({ ok: true, item: serializeActivity(request, order, auth.user), sessionId: session?.id || null });
}
