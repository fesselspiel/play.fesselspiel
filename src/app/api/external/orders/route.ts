import { NextRequest, NextResponse } from "next/server";
import type { ActivityStatus, Prisma } from "@prisma/client";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { selfBondageCategory } from "@/lib/activity-orders";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { activityInclude, parseActivityStatus, parseDateValue, serializeActivity } from "@/lib/external-mobile-serializers";
import { prisma } from "@/lib/prisma";
import { blockedUserIds, hiddenEntityIds } from "@/lib/compliance/ugc";
import { normalizeSlug, uniqueSlug } from "@/lib/slug";

export const runtime = "nodejs";

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "orders");
  if (blocked) return blocked;
  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 50)));
  const cursor = searchParams.get("cursor") || undefined;
  const status = parseActivityStatus(searchParams.get("status"));
  const [blockedOwnerIds, hiddenActivityIds] = auth.user.tenantId
    ? await Promise.all([blockedUserIds(auth.user.id, auth.user.tenantId), hiddenEntityIds(auth.user.tenantId, "activity")])
    : [[], []];
  const where: Prisma.ActivityPlanWhereInput = {
    category: selfBondageCategory,
    AND: [
      await ownerScope(auth.user),
      ...(blockedOwnerIds.length ? [{ ownerId: { notIn: blockedOwnerIds } }] : []),
      ...(hiddenActivityIds.length ? [{ id: { notIn: hiddenActivityIds } }] : [])
    ],
    ...(status ? { status } : {})
  };
  const orders = await prisma.activityPlan.findMany({
    where,
    include: activityInclude,
    orderBy: [{ status: "asc" }, { plannedAt: "asc" }, { createdAt: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  });
  const pageItems = orders.slice(0, limit);
  return NextResponse.json({ ok: true, nextCursor: orders.length > limit ? orders[limit].id : null, count: pageItems.length, items: pageItems.map((order) => serializeActivity(request, order, auth.user)) });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "orders", "selfBondage");
  if (blocked) return blocked;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const title = String(body.title || "Auftrag").trim();
  const scope = await ownerScope(auth.user);
  const positionIds = stringArray(body.positionIds);
  const positions = positionIds.length ? await prisma.position.findMany({ where: { ...scope, id: { in: positionIds }, selfBondageCapable: true }, select: { id: true } }) : [];
  const status = (parseActivityStatus(String(body.status || "")) || "REQUESTED") as ActivityStatus;
  const slug = await uniqueSlug("activityPlan", normalizeSlug(String(body.slug || ""), title), auth.user.tenantId);
  const order = await prisma.activityPlan.create({
    data: {
      tenantId: auth.user.tenantId || undefined,
      ownerId: auth.user.id,
      title,
      slug,
      category: selfBondageCategory,
      note: String(body.note || body.instruction || "").trim(),
      plannedAt: parseDateValue(body.plannedAt || body.scheduledAt),
      status,
      consentStatus: status === "REQUESTED" ? "PROPOSED" : "DRAFT",
      consentVersion: 1,
      acceptedVersion: null,
      consentUpdatedAt: status === "REQUESTED" ? new Date() : null,
      positions: { connect: positions.map((entry) => ({ id: entry.id })) }
    },
    include: activityInclude
  });
  await logAction({ actorId: auth.user.id, action: "self_bondage_order_created", entityType: "activity", entityId: order.id, title: `Auftrag erteilt: ${order.title}`, href: `/orders#order-${order.id}`, details: { excludeActorFromTargets: true } });
  return NextResponse.json({ ok: true, item: serializeActivity(request, order, auth.user) }, { status: 201 });
}
