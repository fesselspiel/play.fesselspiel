import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { logAction } from "@/lib/audit";
import {
  contentSpaceAccessWhere,
  contentSpaceInclude,
  editableContentSpace,
  ensureDefaultContentSpaces,
  parseContentSpaceVisibility,
  replaceContentSpaceShares,
  serializeContentSpace,
  stringIds
} from "@/lib/content-spaces";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "wiki");
  if (blocked) return blocked;
  const space = await prisma.contentSpace.findFirst({
    where: { AND: [{ id: params.id }, await contentSpaceAccessWhere(auth.user)] },
    include: contentSpaceInclude
  });
  if (!space) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, item: serializeContentSpace(space, auth.user) });
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "wiki");
  if (blocked) return blocked;
  const existing = await editableContentSpace(auth.user, params.id);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  const name = body.name === undefined ? existing.name : String(body.name || "").trim();
  if (!name) return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
  const visibility = body.visibility === undefined ? existing.visibility : parseContentSpaceVisibility(body.visibility);
  try {
    await prisma.contentSpace.update({
      where: { id: existing.id },
      data: {
        name,
        icon: body.icon === undefined ? existing.icon : String(body.icon || "").trim() || null,
        sortOrder: body.sortOrder === undefined || !Number.isFinite(Number(body.sortOrder)) ? existing.sortOrder : Number(body.sortOrder),
        visibility
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ ok: false, error: "name_exists" }, { status: 409 });
    }
    throw error;
  }
  await replaceContentSpaceShares(
    existing.id,
    auth.user,
    visibility === "USERS" ? (body.allowedUserIds === undefined ? existing.userShares.map((entry) => entry.userId) : stringIds(body.allowedUserIds)) : [],
    visibility === "CIRCLES" ? (body.allowedCircleIds === undefined ? existing.circleShares.map((entry) => entry.circleId) : stringIds(body.allowedCircleIds)) : []
  );
  const updated = await prisma.contentSpace.findUniqueOrThrow({ where: { id: existing.id }, include: contentSpaceInclude });
  await logAction({ actorId: auth.user.id, action: "content_space_updated", entityType: "contentSpace", entityId: updated.id, title: `Inhaltsbereich geändert: ${updated.name}`, href: "/wiki" });
  return NextResponse.json({ ok: true, item: serializeContentSpace(updated, auth.user) });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "wiki");
  if (blocked) return blocked;
  const existing = await editableContentSpace(auth.user, params.id);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (existing.kind !== "CUSTOM") return NextResponse.json({ ok: false, error: "default_space_cannot_be_deleted" }, { status: 409 });
  const owner = await prisma.user.findUnique({ where: { id: existing.ownerId }, select: { circleId: true } });
  const defaults = await ensureDefaultContentSpaces({ id: existing.ownerId, tenantId: existing.tenantId, circleId: owner?.circleId, role: "USER" });
  await prisma.$transaction([
    prisma.contentSpaceEntry.updateMany({ where: { spaceId: existing.id, sourceType: "WIKI_PAGE" }, data: { spaceId: defaults.diary.id } }),
    prisma.contentSpaceEntry.updateMany({ where: { spaceId: existing.id, sourceType: "IDEA" }, data: { spaceId: defaults.ideas.id } }),
    prisma.contentSpace.update({ where: { id: existing.id }, data: { archivedAt: new Date() } })
  ]);
  await logAction({ actorId: auth.user.id, action: "content_space_archived", entityType: "contentSpace", entityId: existing.id, title: `Inhaltsbereich archiviert: ${existing.name}`, href: "/wiki" });
  return NextResponse.json({ ok: true, archived: true, preservedEntryCount: existing._count.entries });
}
