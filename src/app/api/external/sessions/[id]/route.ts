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
  const updated = await prisma.activityPlan.update({
    where: { id: existing.id },
    data: {
      ...(body.title !== undefined ? { title: String(body.title || "").trim() || existing.title } : {}),
      ...(body.note !== undefined ? { note: String(body.note || "").trim() } : {}),
      ...(body.plannedAt !== undefined || body.scheduledAt !== undefined || body.startTime !== undefined ? { plannedAt: parseDateValue(body.plannedAt || body.scheduledAt || body.startTime) } : {}),
      ...(status ? { status } : {})
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
