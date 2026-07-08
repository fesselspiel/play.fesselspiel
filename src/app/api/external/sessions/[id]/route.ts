import { NextRequest, NextResponse } from "next/server";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { activityInclude, parseActivityStatus, parseDateValue, serializeActivity } from "@/lib/external-mobile-serializers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function findSession(user: { id: string; tenantId?: string | null; circleId?: string | null; role?: string | null }, id: string) {
  return prisma.activityPlan.findFirst({
    where: { id, ...(await ownerScope(user)), category: { notIn: ["IDEA_COLLECTION", "SELF_BONDAGE_ORDER"] } },
    include: activityInclude
  });
}

function stringArray(value: unknown) {
  if (Array.isArray(value)) return Array.from(new Set(value.map(String).map((entry) => entry.trim()).filter(Boolean)));
  if (typeof value === "string") return Array.from(new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean)));
  return [];
}

async function relationIds(user: { id: string; tenantId?: string | null; circleId?: string | null; role?: string | null }, values: { toyIds?: unknown; positionIds?: unknown; bondageSystemItemIds?: unknown }) {
  const scope = await ownerScope(user);
  const toyIds = stringArray(values.toyIds);
  const positionIds = stringArray(values.positionIds);
  const bondageSystemItemIds = stringArray(values.bondageSystemItemIds);
  const [toys, positions, bondageItems] = await Promise.all([
    toyIds.length ? prisma.toy.findMany({ where: { ...scope, id: { in: toyIds } }, select: { id: true } }) : [],
    positionIds.length ? prisma.position.findMany({ where: { ...scope, id: { in: positionIds } }, select: { id: true } }) : [],
    bondageSystemItemIds.length ? prisma.bondageSystemItem.findMany({ where: { tenantId: user.tenantId || undefined, id: { in: bondageSystemItemIds }, visible: true }, select: { id: true } }) : []
  ]);
  return { toys, positions, bondageItems };
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "activities");
  if (blocked) return blocked;
  const session = await findSession(auth.user, params.id);
  if (!session) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, item: serializeActivity(request, session) });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "activities");
  if (blocked) return blocked;
  const existing = await findSession(auth.user, params.id);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const status = parseActivityStatus(String(body.status || ""));
  const relations = await relationIds(auth.user, body);
  const updated = await prisma.activityPlan.update({
    where: { id: existing.id },
    data: {
      ...(body.title !== undefined ? { title: String(body.title || "").trim() || existing.title } : {}),
      ...(body.note !== undefined ? { note: String(body.note || "").trim() } : {}),
      ...(body.plannedAt !== undefined || body.scheduledAt !== undefined || body.startTime !== undefined ? { plannedAt: parseDateValue(body.plannedAt || body.scheduledAt || body.startTime) } : {}),
      ...(status ? { status } : {}),
      ...(body.toyIds !== undefined ? { tools: { set: relations.toys.map((entry) => ({ id: entry.id })) } } : {}),
      ...(body.positionIds !== undefined ? { positions: { set: relations.positions.map((entry) => ({ id: entry.id })) } } : {}),
      ...(body.bondageSystemItemIds !== undefined ? { bondageSystemItems: { set: relations.bondageItems.map((entry) => ({ id: entry.id })) } } : {})
    },
    include: activityInclude
  });
  await logAction({ actorId: auth.user.id, action: "activity_created", entityType: "activity", entityId: updated.id, title: `Spielplan geändert: ${updated.title}`, href: `/activities/${updated.slug}` });
  return NextResponse.json({ ok: true, item: serializeActivity(request, updated) });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "activities");
  if (blocked) return blocked;
  const existing = await findSession(auth.user, params.id);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const updated = await prisma.activityPlan.update({ where: { id: existing.id }, data: { status: "DISCARDED" }, include: activityInclude });
  await logAction({ actorId: auth.user.id, action: "activity_created", entityType: "activity", entityId: updated.id, title: `Spielplan verworfen: ${updated.title}`, href: `/activities/${updated.slug}` });
  return NextResponse.json({ ok: true, item: serializeActivity(request, updated) });
}
