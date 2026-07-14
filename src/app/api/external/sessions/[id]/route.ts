import { NextRequest, NextResponse } from "next/server";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { parseActivityStatus, parseDateValue } from "@/lib/external-mobile-serializers";
import { prisma } from "@/lib/prisma";
import { blockedUserIds, hiddenEntityIds } from "@/lib/compliance/ugc";
import { calendarMediaForSession, externalSessionInclude, serializeExternalSession } from "../_helpers";
import { consentMutation, effectiveConsentStatus, parsedConsentAction, resetConsentForMaterialChange } from "@/lib/activity-consent";

export const runtime = "nodejs";

async function findSession(user: { id: string; tenantId?: string | null; circleId?: string | null; role?: string | null }, id: string) {
  const [blockedOwnerIds, hiddenActivityIds] = user.tenantId
    ? await Promise.all([blockedUserIds(user.id, user.tenantId), hiddenEntityIds(user.tenantId, "activity")])
    : [[], []];
  return prisma.activityPlan.findFirst({
    where: {
      AND: [
        await ownerScope(user),
        { OR: [{ category: null }, { category: { notIn: ["IDEA_COLLECTION", "SELF_BONDAGE_ORDER"] } }] },
        ...(blockedOwnerIds.length ? [{ ownerId: { notIn: blockedOwnerIds } }] : []),
        ...(hiddenActivityIds.length ? [{ id: { notIn: hiddenActivityIds } }] : [])
      ],
      OR: [{ id }, { slug: id }],
    },
    include: externalSessionInclude
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

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "activities");
  if (blocked) return blocked;
  const session = await findSession(auth.user, params.id);
  if (!session) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, item: serializeExternalSession(request, session, auth.user.id, await calendarMediaForSession(auth.user, session)) });
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "activities");
  if (blocked) return blocked;
  const existing = await findSession(auth.user, params.id);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const status = parseActivityStatus(String(body.status || ""));
  let consentAction = parsedConsentAction(body.consentAction);
  if (body.consentAction !== undefined && !consentAction) return NextResponse.json({ ok: false, error: "invalid_consent_action" }, { status: 400 });
  if (!consentAction && status) {
    if (status === "PLANNED") consentAction = "ACCEPT";
    if (status === "DONE") consentAction = "COMPLETE";
    if (status === "DISCARDED") consentAction = effectiveConsentStatus(existing) === "ACCEPTED" ? "REVOKE" : existing.ownerId === auth.user.id ? "CANCEL" : "DECLINE";
  }
  const consentChange = consentAction ? consentMutation(existing, auth.user, consentAction) : null;
  if (consentAction && !consentChange) return NextResponse.json({ ok: false, error: "consent_transition_forbidden" }, { status: 409 });
  const relations = await relationIds(auth.user, body);
  const hasMaterialChange = ["title", "note", "plannedAt", "scheduledAt", "startTime", "toyIds", "positionIds", "bondageSystemItemIds"].some((key) => body[key] !== undefined);
  const isAdmin = auth.user.role === "ADMIN" || auth.user.role === "SUPER_ADMIN";
  if (!consentAction && hasMaterialChange && existing.ownerId !== auth.user.id && !isAdmin) {
    return NextResponse.json({ ok: false, error: "owner_required" }, { status: 403 });
  }
  if (consentAction && consentAction !== "REQUEST_CHANGES" && hasMaterialChange) {
    return NextResponse.json({ ok: false, error: "consent_action_must_not_change_content" }, { status: 400 });
  }
  if (consentAction === "REQUEST_CHANGES" && ["title", "toyIds", "positionIds", "bondageSystemItemIds"].some((key) => body[key] !== undefined)) {
    return NextResponse.json({ ok: false, error: "invalid_change_proposal" }, { status: 400 });
  }
  const materialConsentReset = !consentAction && hasMaterialChange ? resetConsentForMaterialChange(existing) : null;
  const updated = await prisma.activityPlan.update({
    where: { id: existing.id },
    data: {
      ...(body.title !== undefined ? { title: String(body.title || "").trim() || existing.title } : {}),
      ...(body.note !== undefined ? { note: String(body.note || "").trim() } : {}),
      ...(body.plannedAt !== undefined || body.scheduledAt !== undefined || body.startTime !== undefined ? { plannedAt: parseDateValue(body.plannedAt || body.scheduledAt || body.startTime) } : {}),
      ...(consentChange?.data || materialConsentReset || (status ? { status } : {})),
      ...(body.toyIds !== undefined ? { tools: { set: relations.toys.map((entry) => ({ id: entry.id })) } } : {}),
      ...(body.positionIds !== undefined ? { positions: { set: relations.positions.map((entry) => ({ id: entry.id })) } } : {}),
      ...(body.bondageSystemItemIds !== undefined ? { bondageSystemItems: { set: relations.bondageItems.map((entry) => ({ id: entry.id })) } } : {})
    },
    include: externalSessionInclude
  });
  await logAction({
    actorId: auth.user.id,
    action: consentAction ? `activity_consent_${consentAction.toLowerCase()}` : "activity_updated",
    entityType: "activity",
    entityId: updated.id,
    title: consentAction ? "Zustimmung zur Planung aktualisiert" : `Spielplan geändert: ${updated.title}`,
    details: consentAction || materialConsentReset ? {
      consentStatus: updated.consentStatus,
      consentVersion: updated.consentVersion,
      acceptedVersion: updated.acceptedVersion
    } : undefined,
    href: `/activities/${updated.slug}`
  });
  return NextResponse.json({ ok: true, item: serializeExternalSession(request, updated, auth.user.id, await calendarMediaForSession(auth.user, updated)) });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "activities");
  if (blocked) return blocked;
  const existing = await findSession(auth.user, params.id);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const consentChange = consentMutation(existing, auth.user, effectiveConsentStatus(existing) === "ACCEPTED" ? "REVOKE" : existing.ownerId === auth.user.id ? "CANCEL" : "DECLINE");
  if (!consentChange) return NextResponse.json({ ok: false, error: "consent_transition_forbidden" }, { status: 409 });
  const updated = await prisma.activityPlan.update({ where: { id: existing.id }, data: consentChange.data, include: externalSessionInclude });
  await logAction({ actorId: auth.user.id, action: "activity_consent_cancel", entityType: "activity", entityId: updated.id, title: "Planung beendet", details: { consentStatus: updated.consentStatus, consentVersion: updated.consentVersion }, href: `/activities/${updated.slug}` });
  return NextResponse.json({ ok: true, item: serializeExternalSession(request, updated, auth.user.id, await calendarMediaForSession(auth.user, updated)) });
}
