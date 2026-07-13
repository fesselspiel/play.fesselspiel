import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { parseActivityStatus, parseDateValue } from "@/lib/external-mobile-serializers";
import { prisma } from "@/lib/prisma";
import { blockedUserIds, hiddenEntityIds } from "@/lib/compliance/ugc";
import { normalizeSlug, uniqueSlug } from "@/lib/slug";
import { calendarMediaForSessionDates, externalSessionInclude, serializeExternalSession } from "./_helpers";
import { parsedConsentAction } from "@/lib/activity-consent";

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
  if (Array.isArray(value)) return value.map(String).map((entry) => entry.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  return [];
}

const sessionCategoryWhere = {
  OR: [
    { category: null },
    { category: { notIn: ["IDEA_COLLECTION", "SELF_BONDAGE_ORDER"] } }
  ]
} satisfies Prisma.ActivityPlanWhereInput;

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
  const [blockedOwnerIds, hiddenActivityIds] = auth.user.tenantId
    ? await Promise.all([blockedUserIds(auth.user.id, auth.user.tenantId), hiddenEntityIds(auth.user.tenantId, "activity")])
    : [[], []];
  const where: Prisma.ActivityPlanWhereInput = {
    AND: [
      await ownerScope(auth.user),
      sessionCategoryWhere,
      ...(blockedOwnerIds.length ? [{ ownerId: { notIn: blockedOwnerIds } }] : []),
      ...(hiddenActivityIds.length ? [{ id: { notIn: hiddenActivityIds } }] : [])
    ],
    ...(status ? { status } : {}),
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {})
  };
  const items = await prisma.activityPlan.findMany({
    where,
    include: externalSessionInclude,
    orderBy: [{ plannedAt: "asc" }, { updatedAt: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  });
  const pageItems = items.slice(0, limit);
  const mediaBySession = await calendarMediaForSessionDates(auth.user, pageItems);
  return NextResponse.json({
    ok: true,
    nextCursor: items.length > limit ? items[limit].id : null,
    count: pageItems.length,
    items: pageItems.map((item) => serializeExternalSession(request, item, auth.user.id, mediaBySession.get(item.id) || []))
  });
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
  const requestedConsentAction = parsedConsentAction(body.consentAction) || "PROPOSE";
  if (requestedConsentAction !== "PROPOSE") return NextResponse.json({ ok: false, error: "invalid_consent_action" }, { status: 400 });
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
      consentStatus: status === "REQUESTED" ? "PROPOSED" : "DRAFT",
      consentVersion: 1,
      acceptedVersion: null,
      consentUpdatedAt: status === "REQUESTED" ? new Date() : null,
      tools: { connect: toys.map((entry) => ({ id: entry.id })) },
      positions: { connect: positions.map((entry) => ({ id: entry.id })) },
      bondageSystemItems: { connect: bondageItems.map((entry) => ({ id: entry.id })) }
    },
    include: externalSessionInclude
  });
  await logAction({ actorId: auth.user.id, action: status === "REQUESTED" ? "activity_requested" : "activity_created", entityType: "activity", entityId: activity.id, title: `${status === "REQUESTED" ? "Spielplan angefragt" : "Spielplan angelegt"}: ${activity.title}`, href: `/activities/${activity.slug}` });
  if (status === "REQUESTED") {
    await logAction({ actorId: auth.user.id, action: "activity_consent_proposed", entityType: "activity", entityId: activity.id, title: "Planung vorgeschlagen", details: { consentStatus: "PROPOSED", consentVersion: 1 }, href: `/activities/${activity.slug}` });
  }
  const mediaBySession = await calendarMediaForSessionDates(auth.user, [activity]);
  return NextResponse.json({ ok: true, item: serializeExternalSession(request, activity, auth.user.id, mediaBySession.get(activity.id) || []) }, { status: 201 });
}
