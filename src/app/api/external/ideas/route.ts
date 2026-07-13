import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { activityInclude, parseActivityStatus, serializeActivity } from "@/lib/external-mobile-serializers";
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
  const blocked = apiFeatureGate(auth.user, "externalApi", "ideas");
  if (blocked) return blocked;
  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 50)));
  const cursor = searchParams.get("cursor") || undefined;
  const q = String(searchParams.get("q") || "").trim();
  const status = parseActivityStatus(searchParams.get("status"));
  const [blockedOwnerIds, hiddenActivityIds] = auth.user.tenantId
    ? await Promise.all([blockedUserIds(auth.user.id, auth.user.tenantId), hiddenEntityIds(auth.user.tenantId, "activity")])
    : [[], []];
  const where: Prisma.ActivityPlanWhereInput = {
    AND: [
      await ownerScope(auth.user),
      ...(blockedOwnerIds.length ? [{ ownerId: { notIn: blockedOwnerIds } }] : []),
      ...(hiddenActivityIds.length ? [{ id: { notIn: hiddenActivityIds } }] : [])
    ],
    category: "IDEA_COLLECTION",
    ...(status ? { status } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { note: { contains: q, mode: "insensitive" as const } }] } : {})
  };
  const ideas = await prisma.activityPlan.findMany({
    where,
    include: activityInclude,
    orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  });
  const pageItems = ideas.slice(0, limit);
  return NextResponse.json({ ok: true, nextCursor: ideas.length > limit ? ideas[limit].id : null, count: pageItems.length, items: pageItems.map((idea) => serializeActivity(request, idea)) });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "ideas");
  if (blocked) return blocked;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
  const scope = await ownerScope(auth.user);
  const [toys, positions] = await Promise.all([
    stringArray(body.toyIds).length ? prisma.toy.findMany({ where: { ...scope, id: { in: stringArray(body.toyIds) } }, select: { id: true } }) : [],
    stringArray(body.positionIds).length ? prisma.position.findMany({ where: { ...scope, id: { in: stringArray(body.positionIds) } }, select: { id: true } }) : []
  ]);
  const slug = await uniqueSlug("activityPlan", normalizeSlug(String(body.slug || ""), title), auth.user.tenantId);
  const idea = await prisma.activityPlan.create({
    data: {
      tenantId: auth.user.tenantId || undefined,
      ownerId: auth.user.id,
      title,
      slug,
      category: "IDEA_COLLECTION",
      note: String(body.note || body.text || "").trim(),
      status: parseActivityStatus(String(body.status || "")) || "PLANNED",
      tools: { connect: toys.map((entry) => ({ id: entry.id })) },
      positions: { connect: positions.map((entry) => ({ id: entry.id })) }
    },
    include: activityInclude
  });
  await logAction({ actorId: auth.user.id, action: "idea_created", entityType: "activity", entityId: idea.id, title: `Idee festgehalten: ${idea.title}`, href: `/ideas/${idea.slug}` });
  return NextResponse.json({ ok: true, item: serializeActivity(request, idea) }, { status: 201 });
}
