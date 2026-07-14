import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import {
  contentSpaceAccess,
  editableContentSpace,
  LEGACY_IDEAS_SPACE_ID,
  LEGACY_WIKI_SPACE_ID,
  legacySpaceCounts,
  normalizeContentVisibility,
  serializeContentSpace
} from "@/lib/content-spaces";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function stringArray(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  return [];
}

export async function GET(request: NextRequest, props: { params: Promise<{ spaceId: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;

  if (params.spaceId === LEGACY_WIKI_SPACE_ID || params.spaceId === LEGACY_IDEAS_SPACE_ID) {
    const counts = await legacySpaceCounts(auth.user);
    return NextResponse.json({
      ok: true,
      item: serializeContentSpace(request, params.spaceId, params.spaceId === LEGACY_WIKI_SPACE_ID ? counts.wikiCount : counts.ideaCount, auth.user)
    });
  }
  const resolved = await contentSpaceAccess(auth.user, params.spaceId);
  if (!resolved || !("space" in resolved) || !resolved.space) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const { space: resolvedSpace } = resolved;
  const space = await prisma.contentSpace.findUnique({
    where: { id: resolvedSpace.id },
    include: { owner: { include: { profile: true } }, _count: { select: { entries: true } } }
  });
  if (!space) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, item: serializeContentSpace(request, space, 0, auth.user) });
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ spaceId: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;

  const editable = await editableContentSpace(auth.user, params.spaceId);
  if (!editable) return NextResponse.json({ ok: false, error: "not_found_or_readonly" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const space = await prisma.contentSpace.update({
    where: { id: editable.id },
    data: {
      ...(body.name !== undefined ? { name: String(body.name || "").trim() || editable.name } : {}),
      ...(body.kind !== undefined ? { kind: String(body.kind || "").trim() || editable.kind } : {}),
      ...(body.templateKey !== undefined ? { templateKey: body.templateKey ? String(body.templateKey).trim() : null } : {}),
      ...(body.icon !== undefined ? { icon: body.icon ? String(body.icon).trim() : null } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : editable.sortOrder } : {}),
      ...(body.visibility !== undefined ? { visibility: normalizeContentVisibility(body.visibility) } : {}),
      ...(body.allowedUserIds !== undefined ? { allowedUserIds: stringArray(body.allowedUserIds) } : {}),
      ...(body.allowedCircleIds !== undefined ? { allowedCircleIds: stringArray(body.allowedCircleIds) } : {})
    },
    include: { owner: { include: { profile: true } }, _count: { select: { entries: true } } }
  });
  await logAction({
    actorId: auth.user.id,
    action: "content_space_updated_api",
    entityType: "contentSpace",
    entityId: space.id,
    title: `Inhaltsbereich geändert: ${space.name}`,
    href: `/content-spaces/${space.id}`
  });
  return NextResponse.json({ ok: true, item: serializeContentSpace(request, space, 0, auth.user) });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ spaceId: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;

  const editable = await editableContentSpace(auth.user, params.spaceId);
  if (!editable) return NextResponse.json({ ok: false, error: "not_found_or_readonly" }, { status: 404 });
  await prisma.contentSpace.update({ where: { id: editable.id }, data: { archivedAt: new Date() } });
  await logAction({
    actorId: auth.user.id,
    action: "content_space_archived_api",
    entityType: "contentSpace",
    entityId: editable.id,
    title: `Inhaltsbereich archiviert: ${editable.name}`
  });
  return NextResponse.json({ ok: true });
}
