import { NextRequest, NextResponse } from "next/server";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { contentSpaceAccessWhere, contentSpaceInclude, legacyVisibility } from "@/lib/content-spaces";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";
import { createWikiRevision, uniqueWikiSlug, wikiOwnerSlug, wikiPageAccessWhere } from "@/lib/wiki";
import { hiddenEntityIds } from "@/lib/compliance/ugc";

export const runtime = "nodejs";

const wikiInclude = { owner: { include: { profile: true } }, images: { include: { file: true }, orderBy: { createdAt: "asc" as const } } };

function serializeWikiEntry(entry: { id: string; spaceId: string; calendarDate: Date | null; createdAt: Date; updatedAt: Date }, page: Awaited<ReturnType<typeof prisma.wikiPage.findFirst>>) {
  if (!page) return null;
  const typed = page as typeof page & { owner: { id: string; username: string | null; name: string | null; email: string; profile: { displayName: string | null } | null }; images: { id: string; title: string | null; fileId: string; file: { mimeType: string } }[] };
  return {
    id: entry.id,
    spaceId: entry.spaceId,
    sourceType: "WIKI_PAGE",
    sourceId: typed.id,
    title: typed.title,
    content: typed.content,
    calendarDate: (entry.calendarDate || typed.createdAt).toISOString(),
    visibility: typed.visibility,
    attachments: typed.images.map((image) => ({ id: image.id, title: image.title, fileId: image.fileId, mimeType: image.file.mimeType, downloadPath: `/api/external/files/${image.fileId}` })),
    path: `/wiki/${wikiOwnerSlug(typed.owner)}/${typed.slug}`,
    createdAt: typed.createdAt.toISOString(),
    updatedAt: typed.updatedAt.toISOString(),
    owner: { id: typed.owner.id, username: typed.owner.username, displayName: typed.owner.profile?.displayName || typed.owner.name || typed.owner.username || typed.owner.email }
  };
}

function serializeIdeaEntry(entry: { id: string; spaceId: string; calendarDate: Date | null }, idea: Awaited<ReturnType<typeof prisma.activityPlan.findFirst>>) {
  if (!idea) return null;
  const typed = idea as typeof idea & { images: { id: string; title: string | null; fileId: string; file: { mimeType: string } }[]; owner: { id: string; username: string | null; name: string | null; email: string; profile: { displayName: string | null } | null } };
  return {
    id: entry.id,
    spaceId: entry.spaceId,
    sourceType: "IDEA",
    sourceId: typed.id,
    title: typed.title,
    content: typed.note || "",
    calendarDate: (entry.calendarDate || typed.createdAt).toISOString(),
    visibility: "LEGACY",
    attachments: typed.images.map((image) => ({ id: image.id, title: image.title, fileId: image.fileId, mimeType: image.file.mimeType, downloadPath: `/api/external/files/${image.fileId}` })),
    path: `/ideas/${typed.slug}`,
    createdAt: typed.createdAt.toISOString(),
    updatedAt: typed.updatedAt.toISOString(),
    owner: { id: typed.owner.id, username: typed.owner.username, displayName: typed.owner.profile?.displayName || typed.owner.name || typed.owner.username || typed.owner.email }
  };
}

async function visibleSpace(user: Parameters<typeof contentSpaceAccessWhere>[0], id: string) {
  return prisma.contentSpace.findFirst({ where: { AND: [{ id }, await contentSpaceAccessWhere(user)] }, include: contentSpaceInclude });
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "wiki");
  if (blocked) return blocked;
  const space = await visibleSpace(auth.user, params.id);
  if (!space) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const mappings = await prisma.contentSpaceEntry.findMany({ where: { spaceId: space.id }, orderBy: [{ calendarDate: "desc" }, { createdAt: "desc" }] });
  const wikiIds = mappings.filter((entry) => entry.sourceType === "WIKI_PAGE").map((entry) => entry.sourceId);
  const ideaIds = mappings.filter((entry) => entry.sourceType === "IDEA").map((entry) => entry.sourceId);
  const [hiddenWikiIds, hiddenIdeaIds] = auth.user.tenantId
    ? await Promise.all([hiddenEntityIds(auth.user.tenantId, "wikiPage"), hiddenEntityIds(auth.user.tenantId, "activity")])
    : [[], []];
  const [pages, ideas] = await Promise.all([
    wikiIds.length ? prisma.wikiPage.findMany({ where: { AND: [{ id: { in: wikiIds, ...(hiddenWikiIds.length ? { notIn: hiddenWikiIds } : {}) } }, await wikiPageAccessWhere(auth.user)] }, include: wikiInclude }) : [],
    ideaIds.length ? prisma.activityPlan.findMany({ where: { ...(await ownerScope(auth.user)), id: { in: ideaIds, ...(hiddenIdeaIds.length ? { notIn: hiddenIdeaIds } : {}) }, category: "IDEA_COLLECTION" }, include: { owner: { include: { profile: true } }, images: { include: { file: true }, orderBy: { createdAt: "asc" } } } }) : []
  ]);
  const pageById = new Map(pages.map((page) => [page.id, page]));
  const ideaById = new Map(ideas.map((idea) => [idea.id, idea]));
  const items = mappings.map((entry) => entry.sourceType === "WIKI_PAGE" ? serializeWikiEntry(entry, pageById.get(entry.sourceId) || null) : serializeIdeaEntry(entry, ideaById.get(entry.sourceId) || null)).filter(Boolean);
  return NextResponse.json({ ok: true, count: items.length, items });
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "wiki");
  if (blocked) return blocked;
  const space = await prisma.contentSpace.findFirst({ where: { id: params.id, archivedAt: null, ...(auth.user.tenantId ? { tenantId: auth.user.tenantId } : {}), ...(auth.user.role === "ADMIN" || auth.user.role === "SUPER_ADMIN" ? {} : { ownerId: auth.user.id }) }, include: contentSpaceInclude });
  if (!space) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
  const calendarDate = body.calendarDate ? new Date(String(body.calendarDate)) : new Date();
  if (Number.isNaN(calendarDate.getTime())) return NextResponse.json({ ok: false, error: "invalid_calendar_date" }, { status: 400 });
  const slug = await uniqueWikiSlug(auth.user.id, auth.user.tenantId, title, title);
  const page = await prisma.wikiPage.create({
    data: {
      tenantId: auth.user.tenantId || undefined,
      ownerId: auth.user.id,
      title,
      slug,
      summary: "",
      content: String(body.content || body.text || "").trim(),
      visibility: legacyVisibility(space.visibility),
      shares: {
        create: [
          ...(space.visibility === "USERS" ? space.userShares.map((share) => ({ targetUserId: share.userId })) : []),
          ...(space.visibility === "CIRCLES" ? space.circleShares.map((share) => ({ targetCircleId: share.circleId })) : [])
        ]
      }
    },
    include: wikiInclude
  });
  const mapping = await prisma.contentSpaceEntry.create({ data: { spaceId: space.id, sourceType: "WIKI_PAGE", sourceId: page.id, calendarDate } });
  await createWikiRevision(page.id, auth.user.id, "created_content_space_api");
  await logAction({ actorId: auth.user.id, action: "content_space_entry_created", entityType: "wikiPage", entityId: page.id, title: `Eintrag angelegt: ${page.title}`, href: `/wiki/${wikiOwnerSlug(page.owner)}/${page.slug}`, details: { contentSpaceId: space.id } });
  return NextResponse.json({ ok: true, item: serializeWikiEntry(mapping, page) }, { status: 201 });
}
