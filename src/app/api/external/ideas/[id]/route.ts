import { NextRequest, NextResponse } from "next/server";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { activityInclude, parseActivityStatus, serializeActivity } from "@/lib/external-mobile-serializers";
import { prisma } from "@/lib/prisma";
import { blockedUserIds, hiddenEntityIds } from "@/lib/compliance/ugc";

export const runtime = "nodejs";

async function findIdea(user: { id: string; tenantId?: string | null; circleId?: string | null; role?: string | null }, id: string) {
  const [blockedOwnerIds, hiddenActivityIds] = user.tenantId
    ? await Promise.all([blockedUserIds(user.id, user.tenantId), hiddenEntityIds(user.tenantId, "activity")])
    : [[], []];
  return prisma.activityPlan.findFirst({
    where: {
      id,
      category: "IDEA_COLLECTION",
      AND: [
        await ownerScope(user),
        ...(blockedOwnerIds.length ? [{ ownerId: { notIn: blockedOwnerIds } }] : []),
        ...(hiddenActivityIds.length ? [{ id: { notIn: hiddenActivityIds } }] : [])
      ]
    },
    include: activityInclude
  });
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "ideas");
  if (blocked) return blocked;
  const idea = await findIdea(auth.user, params.id);
  if (!idea) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, item: serializeActivity(request, idea) });
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "ideas");
  if (blocked) return blocked;
  const existing = await findIdea(auth.user, params.id);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const status = parseActivityStatus(String(body.status || ""));
  const idea = await prisma.activityPlan.update({
    where: { id: existing.id },
    data: {
      ...(body.title !== undefined ? { title: String(body.title || "").trim() || existing.title } : {}),
      ...(body.note !== undefined || body.text !== undefined ? { note: String(body.note || body.text || "").trim() } : {}),
      ...(status ? { status } : {})
    },
    include: activityInclude
  });
  await logAction({ actorId: auth.user.id, action: "idea_updated", entityType: "activity", entityId: idea.id, title: `Idee geändert: ${idea.title}`, href: `/ideas/${idea.slug}` });
  return NextResponse.json({ ok: true, item: serializeActivity(request, idea) });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "ideas");
  if (blocked) return blocked;
  const existing = await findIdea(auth.user, params.id);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const idea = await prisma.activityPlan.update({ where: { id: existing.id }, data: { status: "DISCARDED" }, include: activityInclude });
  await logAction({ actorId: auth.user.id, action: "idea_deleted", entityType: "activity", entityId: idea.id, title: `Idee verworfen: ${idea.title}`, href: `/ideas/${idea.slug}` });
  return NextResponse.json({ ok: true, item: serializeActivity(request, idea) });
}
