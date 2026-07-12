import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import { findLikeableEntity, findOrCreateEntityLikeAnchor, entityLikeState } from "@/lib/entity-likes";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Params = { params: { entityType: string; entityId: string } };
type ResolvedAnchor =
  | { response: NextResponse }
  | {
      user: any;
      entity: NonNullable<Awaited<ReturnType<typeof findLikeableEntity>>>;
      anchor: Awaited<ReturnType<typeof findOrCreateEntityLikeAnchor>>;
    };

function actionPrefix(entityType: string) {
  return entityType === "trackerEntry" ? "tracker_entry" : entityType;
}

function responsePayload(
  resolved: Extract<ResolvedAnchor, { anchor: Awaited<ReturnType<typeof findOrCreateEntityLikeAnchor>> }>,
  state: Awaited<ReturnType<typeof entityLikeState>>
) {
  return {
    ok: true,
    entity: resolved.entity,
    ...state,
    eventId: resolved.anchor.id,
    item: { id: resolved.entity.entityId, ...state, eventId: resolved.anchor.id }
  };
}

async function resolveAnchor(request: NextRequest, params: Params["params"]): Promise<ResolvedAnchor> {
  const auth = await requireApiUser(request);
  const user = auth.user;
  if (!user) return { response: auth.response || NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  const blocked = apiFeatureGate(user, "externalApi", "auditLog");
  if (blocked) return { response: blocked };
  const rawType = params.entityType.trim().toLowerCase();
  const entityFeature = ["media", "image", "gallery", "bild"].includes(rawType) ? "media" : "trackers";
  const featureBlocked = apiFeatureGate(user, entityFeature);
  if (featureBlocked) return { response: featureBlocked };
  const entity = await findLikeableEntity(user, params.entityType, params.entityId);
  if (!entity) return { response: NextResponse.json({ ok: false, error: "entity_not_found" }, { status: 404 }) };
  const anchor = await findOrCreateEntityLikeAnchor(entity);
  return { user, entity, anchor };
}

export async function POST(request: NextRequest, { params }: Params) {
  const resolved = await resolveAnchor(request, params);
  if ("response" in resolved) return resolved.response;
  const existing = await prisma.feedLike.findUnique({
    where: { auditLogId_userId: { auditLogId: resolved.anchor.id, userId: resolved.user.id } }
  });
  if (!existing) {
    await prisma.feedLike.create({ data: { auditLogId: resolved.anchor.id, userId: resolved.user.id } });
    await logAction({
      actorId: resolved.user.id,
      action: `${actionPrefix(resolved.entity.entityType)}_liked`,
      entityType: resolved.entity.entityType,
      entityId: resolved.entity.entityId,
      title: `Geliked: ${resolved.entity.title}`,
      href: resolved.entity.href,
      details: { likeAnchorId: resolved.anchor.id }
    });
  }
  const state = await entityLikeState(resolved.entity.entityType, resolved.entity.entityId, resolved.user.id);
  return NextResponse.json(responsePayload(resolved, state));
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const resolved = await resolveAnchor(request, params);
  if ("response" in resolved) return resolved.response;
  const existing = await prisma.feedLike.findUnique({
    where: { auditLogId_userId: { auditLogId: resolved.anchor.id, userId: resolved.user.id } }
  });
  if (existing) {
    await prisma.feedLike.delete({ where: { id: existing.id } });
    await logAction({
      actorId: resolved.user.id,
      action: `${actionPrefix(resolved.entity.entityType)}_unliked`,
      entityType: resolved.entity.entityType,
      entityId: resolved.entity.entityId,
      title: `Like entfernt: ${resolved.entity.title}`,
      href: resolved.entity.href,
      details: { likeAnchorId: resolved.anchor.id }
    });
  }
  const state = await entityLikeState(resolved.entity.entityType, resolved.entity.entityId, resolved.user.id);
  return NextResponse.json(responsePayload(resolved, state));
}
