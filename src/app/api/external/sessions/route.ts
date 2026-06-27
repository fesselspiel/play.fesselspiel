import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { ownerScope } from "@/lib/access";
import { tokenFromRequest } from "@/lib/api-tokens";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { activityInclude, parseActivityStatus, parseDateValue, serializeActivity } from "@/lib/external-mobile-serializers";
import { prisma } from "@/lib/prisma";
import { normalizeSlug, uniqueSlug } from "@/lib/slug";

export const runtime = "nodejs";

async function relationIds(user: { id: string; tenantId?: string | null; circleId?: string | null; role?: string | null }, values: { toyIds: string[]; positionIds: string[]; bondageSystemItemIds: string[] }) {
  const scope = await ownerScope(user);
  const [toys, positions, bondageItems] = await Promise.all([
    values.toyIds.length ? prisma.toy.findMany({ where: { ...scope, id: { in: values.toyIds } }, select: { id: true } }) : [],
    values.positionIds.length ? prisma.position.findMany({ where: { ...scope, id: { in: values.positionIds } }, select: { id: true } }) : [],
    values.bondageSystemItemIds.length ? prisma.bondageSystemItem.findMany({ where: { tenantId: user.tenantId || undefined, id: { in: values.bondageSystemItemIds }, visible: true }, select: { id: true } }) : []
  ]);
  return { toys, positions, bondageItems };
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "activities");
  if (blocked) return blocked;
  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 50)));
  const cursor = searchParams.get("cursor") || undefined;
  const q = String(searchParams.get("q") || "").trim();
  const status = parseActivityStatus(searchParams.get("status"));
  const where: Prisma.ActivityPlanWhereInput = {
    ...(await ownerScope(auth.user)),
    category: { notIn: ["IDEA_COLLECTION", "SELF_BONDAGE_ORDER"] },
    ...(status ? { status } : {}),
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {})
  };
  const items = await prisma.activityPlan.findMany({
    where,
    include: activityInclude,
    orderBy: [{ plannedAt: "asc" }, { updatedAt: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  });
  const token = searchParams.get("token") === tokenFromRequest(request) ? searchParams.get("token") || "" : "";
  const pageItems = items.slice(0, limit);
  return NextResponse.json({ ok: true, nextCursor: items.length > limit ? items[limit].id : null, count: pageItems.length, items: pageItems.map((item) => serializeActivity(request, item, token)) });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "activities");
  if (blocked) return blocked;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
  const status = parseActivityStatus(String(body.status || "")) || "REQUESTED";
  const { toys, positions, bondageItems } = await relationIds(auth.user, {
    toyIds: stringArray(body.toyIds),
    positionIds: stringArray(body.positionIds),
    bondageSystemItemIds: stringArray(body.bondageSystemItemIds)
  });
  const slug = await uniqueSlug("activityPlan", normalizeSlug(String(body.slug || ""), title), auth.user.tenantId);
  const activity = await prisma.activityPlan.create({
    data: {
      tenantId: auth.user.tenantId || undefined,
      ownerId: auth.user.id,
      title,
      slug,
      category: null,
      note: String(body.note || "").trim(),
      plannedAt: parseDateValue(body.scheduledAt || body.plannedAt || body.startTime),
      status,
      tools: { connect: toys.map((entry) => ({ id: entry.id })) },
      positions: { connect: positions.map((entry) => ({ id: entry.id })) },
      bondageSystemItems: { connect: bondageItems.map((entry) => ({ id: entry.id })) }
    },
    include: activityInclude
  });
  await logAction({ actorId: auth.user.id, action: status === "REQUESTED" ? "activity_requested" : "activity_created", entityType: "activity", entityId: activity.id, title: `${status === "REQUESTED" ? "Spielplan angefragt" : "Spielplan angelegt"}: ${activity.title}`, href: `/activities/${activity.slug}` });
  return NextResponse.json({ ok: true, item: serializeActivity(request, activity) }, { status: 201 });
}
