import { NextRequest, NextResponse } from "next/server";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { selfBondageCategory } from "@/lib/activity-orders";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { activityInclude, parseActivityStatus, parseDateValue, serializeActivity } from "@/lib/external-mobile-serializers";
import { prisma } from "@/lib/prisma";
import { blockedUserIds, hiddenEntityIds } from "@/lib/compliance/ugc";
import { resetConsentForMaterialChange } from "@/lib/activity-consent";

export const runtime = "nodejs";

async function findOrder(user: { id: string; tenantId?: string | null; circleId?: string | null; role?: string | null }, id: string) {
  const [blockedOwnerIds, hiddenActivityIds] = user.tenantId
    ? await Promise.all([blockedUserIds(user.id, user.tenantId), hiddenEntityIds(user.tenantId, "activity")])
    : [[], []];
  return prisma.activityPlan.findFirst({
    where: {
      id,
      category: selfBondageCategory,
      AND: [
        await ownerScope(user),
        ...(blockedOwnerIds.length ? [{ ownerId: { notIn: blockedOwnerIds } }] : []),
        ...(hiddenActivityIds.length ? [{ id: { notIn: hiddenActivityIds } }] : [])
      ]
    },
    include: activityInclude
  });
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "orders");
  if (blocked) return blocked;
  const order = await findOrder(auth.user, params.id);
  if (!order) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, item: serializeActivity(request, order, auth.user) });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "orders");
  if (blocked) return blocked;
  const existing = await findOrder(auth.user, params.id);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (existing.ownerId !== auth.user.id && auth.user.role !== "ADMIN" && auth.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ ok: false, error: "owner_required" }, { status: 403 });
  }
  const status = parseActivityStatus(String(body.status || ""));
  const hasMaterialChange = ["title", "note", "instruction", "plannedAt", "scheduledAt"].some((key) => body[key] !== undefined);
  const consentReset = hasMaterialChange ? resetConsentForMaterialChange(existing) : null;
  const order = await prisma.activityPlan.update({
    where: { id: existing.id },
    data: {
      ...(body.title !== undefined ? { title: String(body.title || "").trim() || existing.title } : {}),
      ...(body.note !== undefined || body.instruction !== undefined ? { note: String(body.note || body.instruction || "").trim() } : {}),
      ...(body.plannedAt !== undefined || body.scheduledAt !== undefined ? { plannedAt: parseDateValue(body.plannedAt || body.scheduledAt) } : {}),
      ...(consentReset || (status ? { status } : {}))
    },
    include: activityInclude
  });
  await logAction({ actorId: auth.user.id, action: "self_bondage_order_updated", entityType: "activity", entityId: order.id, title: `Auftrag geändert: ${order.title}`, href: `/orders#order-${order.id}`, details: { excludeActorFromTargets: true } });
  return NextResponse.json({ ok: true, item: serializeActivity(request, order, auth.user) });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "orders");
  if (blocked) return blocked;
  const existing = await findOrder(auth.user, params.id);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (existing.ownerId !== auth.user.id && auth.user.role !== "ADMIN" && auth.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  await prisma.activityPlan.delete({ where: { id: existing.id } });
  await logAction({ actorId: auth.user.id, action: "self_bondage_order_deleted_api", entityType: "activity", entityId: existing.id, title: `Auftrag gelöscht: ${existing.title}`, href: "/orders" });
  return NextResponse.json({ ok: true, id: existing.id });
}
