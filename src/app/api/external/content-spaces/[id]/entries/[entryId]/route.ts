import { NextRequest, NextResponse } from "next/server";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { hiddenEntityIds } from "@/lib/compliance/ugc";
import { contentSpaceAccessWhere, editableContentSpace } from "@/lib/content-spaces";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";
import { createWikiRevision, uniqueWikiSlug, wikiOwnerSlug, wikiPageAccessWhere } from "@/lib/wiki";

export const runtime = "nodejs";

async function editableMapping(user: Parameters<typeof editableContentSpace>[0], spaceId: string, entryId: string) {
  const space = await editableContentSpace(user, spaceId);
  if (!space) return null;
  const mapping = await prisma.contentSpaceEntry.findFirst({ where: { id: entryId, spaceId } });
  return mapping ? { space, mapping } : null;
}

async function readableMapping(user: Parameters<typeof editableContentSpace>[0], spaceId: string, entryId: string) {
  const space = await prisma.contentSpace.findFirst({ where: { AND: [{ id: spaceId }, await contentSpaceAccessWhere(user)] } });
  if (!space) return null;
  const mapping = await prisma.contentSpaceEntry.findFirst({ where: { id: entryId, spaceId } });
  if (!mapping) return null;
  const hiddenIds = user.tenantId ? await hiddenEntityIds(user.tenantId, mapping.sourceType === "IDEA" ? "activity" : "wikiPage") : [];
  if (hiddenIds.includes(mapping.sourceId)) return null;
  const source = mapping.sourceType === "IDEA"
    ? await prisma.activityPlan.findFirst({ where: { ...(await ownerScope(user)), id: mapping.sourceId, category: "IDEA_COLLECTION" }, select: { id: true } })
    : await prisma.wikiPage.findFirst({ where: { AND: [{ id: mapping.sourceId }, await wikiPageAccessWhere(user)] }, select: { id: true } });
  return source ? { space, mapping } : null;
}

async function serialized(mapping: { id: string; spaceId: string; sourceType: string; sourceId: string; calendarDate: Date | null }) {
  if (mapping.sourceType === "IDEA") {
    const idea = await prisma.activityPlan.findUnique({ where: { id: mapping.sourceId }, include: { owner: { include: { profile: true } }, images: { include: { file: true }, orderBy: { createdAt: "asc" } } } });
    if (!idea) return null;
    return {
      id: mapping.id, spaceId: mapping.spaceId, sourceType: "IDEA", sourceId: idea.id,
      title: idea.title, content: idea.note || "", calendarDate: (mapping.calendarDate || idea.createdAt).toISOString(), visibility: "LEGACY",
      attachments: idea.images.map((image) => ({ id: image.id, title: image.title, fileId: image.fileId, mimeType: image.file.mimeType, downloadPath: `/api/external/files/${image.fileId}` })),
      path: `/ideas/${idea.slug}`, createdAt: idea.createdAt.toISOString(), updatedAt: idea.updatedAt.toISOString()
    };
  }
  const page = await prisma.wikiPage.findUnique({ where: { id: mapping.sourceId }, include: { owner: { include: { profile: true } }, images: { include: { file: true }, orderBy: { createdAt: "asc" } } } });
  if (!page) return null;
  return {
    id: mapping.id, spaceId: mapping.spaceId, sourceType: "WIKI_PAGE", sourceId: page.id,
    title: page.title, content: page.content, calendarDate: (mapping.calendarDate || page.createdAt).toISOString(), visibility: page.visibility,
    attachments: page.images.map((image) => ({ id: image.id, title: image.title, fileId: image.fileId, mimeType: image.file.mimeType, downloadPath: `/api/external/files/${image.fileId}` })),
    path: `/wiki/${wikiOwnerSlug(page.owner)}/${page.slug}`, createdAt: page.createdAt.toISOString(), updatedAt: page.updatedAt.toISOString()
  };
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string; entryId: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "wiki");
  if (blocked) return blocked;
  const found = await readableMapping(auth.user, params.id, params.entryId);
  if (!found) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const item = await serialized(found.mapping);
  return item ? NextResponse.json({ ok: true, item }) : NextResponse.json({ ok: false, error: "source_not_found" }, { status: 404 });
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string; entryId: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "wiki");
  if (blocked) return blocked;
  const found = await editableMapping(auth.user, params.id, params.entryId);
  if (!found) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  let calendarDate = found.mapping.calendarDate;
  if (body.calendarDate !== undefined) {
    const parsed = new Date(String(body.calendarDate));
    if (Number.isNaN(parsed.getTime())) return NextResponse.json({ ok: false, error: "invalid_calendar_date" }, { status: 400 });
    calendarDate = parsed;
    await prisma.contentSpaceEntry.update({ where: { id: found.mapping.id }, data: { calendarDate } });
  }
  if (found.mapping.sourceType === "IDEA") {
    const idea = await prisma.activityPlan.findFirst({ where: { id: found.mapping.sourceId, ...(auth.user.role === "ADMIN" || auth.user.role === "SUPER_ADMIN" ? {} : { ownerId: auth.user.id }) } });
    if (!idea) return NextResponse.json({ ok: false, error: "source_not_found" }, { status: 404 });
    await prisma.activityPlan.update({ where: { id: idea.id }, data: { ...(body.title !== undefined ? { title: String(body.title || "").trim() || idea.title } : {}), ...(body.content !== undefined || body.text !== undefined ? { note: String(body.content || body.text || "").trim() } : {}) } });
  } else {
    const page = await prisma.wikiPage.findFirst({ where: { id: found.mapping.sourceId, ...(auth.user.role === "ADMIN" || auth.user.role === "SUPER_ADMIN" ? {} : { ownerId: auth.user.id }) } });
    if (!page) return NextResponse.json({ ok: false, error: "source_not_found" }, { status: 404 });
    const title = body.title === undefined ? page.title : String(body.title || "").trim() || page.title;
    const slug = title === page.title ? page.slug : await uniqueWikiSlug(page.ownerId, page.tenantId, title, title, page.id);
    await prisma.wikiPage.update({ where: { id: page.id }, data: { title, slug, ...(body.content !== undefined || body.text !== undefined ? { content: String(body.content || body.text || "").trim() } : {}) } });
    await createWikiRevision(page.id, auth.user.id, "updated_content_space_api");
  }
  const refreshed = await prisma.contentSpaceEntry.findUniqueOrThrow({ where: { id: found.mapping.id } });
  const item = await serialized(refreshed);
  await logAction({ actorId: auth.user.id, action: "content_space_entry_updated", entityType: found.mapping.sourceType === "IDEA" ? "activity" : "wikiPage", entityId: found.mapping.sourceId, title: `Eintrag geändert: ${String(item?.title || "Eintrag")}`, href: String(item?.path || "/wiki"), details: { contentSpaceId: found.space.id } });
  return NextResponse.json({ ok: true, item });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string; entryId: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "wiki");
  if (blocked) return blocked;
  const found = await editableMapping(auth.user, params.id, params.entryId);
  if (!found) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (found.mapping.sourceType === "IDEA") {
    await prisma.activityPlan.updateMany({ where: { id: found.mapping.sourceId, ...(auth.user.role === "ADMIN" || auth.user.role === "SUPER_ADMIN" ? {} : { ownerId: auth.user.id }) }, data: { status: "DISCARDED" } });
  } else {
    await prisma.wikiPage.deleteMany({ where: { id: found.mapping.sourceId, ...(auth.user.role === "ADMIN" || auth.user.role === "SUPER_ADMIN" ? {} : { ownerId: auth.user.id }) } });
  }
  await prisma.contentSpaceEntry.delete({ where: { id: found.mapping.id } });
  await logAction({ actorId: auth.user.id, action: "content_space_entry_deleted", entityType: found.mapping.sourceType === "IDEA" ? "activity" : "wikiPage", entityId: found.mapping.sourceId, title: "Eintrag gelöscht", href: "/wiki", details: { contentSpaceId: found.space.id } });
  return NextResponse.json({ ok: true });
}
