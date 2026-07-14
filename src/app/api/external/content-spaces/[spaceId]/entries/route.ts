import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import {
  contentSpaceAccess,
  createLegacyIdeaEntry,
  createLegacyWikiEntry,
  LEGACY_IDEAS_SPACE_ID,
  LEGACY_WIKI_SPACE_ID,
  serializeContentEntry
} from "@/lib/content-spaces";
import { apiFeatureGate, dateFromValue, requireApiUser } from "@/lib/external-api";
import { saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { createWikiRevision, wikiPageAccessWhere } from "@/lib/wiki";

export const runtime = "nodejs";

async function requestBody(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const values = new Map<string, string>();
    form.forEach((value, key) => {
      if (typeof value === "string") values.set(key, value);
    });
    return { values, files: form.getAll("file").filter((entry): entry is File => entry instanceof File && entry.size > 0) };
  }
  const json = await request.json().catch(() => ({})) as Record<string, unknown>;
  const values = new Map(Object.entries(json).map(([key, value]) => [key, String(value ?? "")]));
  return { values, files: [] as File[] };
}

export async function GET(request: NextRequest, props: { params: Promise<{ spaceId: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;

  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 50)));
  const cursor = searchParams.get("cursor") || undefined;
  const q = String(searchParams.get("q") || "").trim();

  if (params.spaceId === LEGACY_WIKI_SPACE_ID) {
    const where: Prisma.WikiPageWhereInput = {
      AND: [
        await wikiPageAccessWhere(auth.user),
        q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }] } : {}
      ]
    };
    const pages = await prisma.wikiPage.findMany({
      where,
      include: { owner: { include: { profile: true } }, images: { include: { file: true }, orderBy: { createdAt: "asc" } } },
      orderBy: [{ updatedAt: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });
    const pageItems = pages.slice(0, limit);
    return NextResponse.json({ ok: true, count: pageItems.length, nextCursor: pages.length > limit ? pages[limit].id : null, items: pageItems.map((page) => serializeContentEntry(request, { legacyType: "wiki", page })) });
  }

  if (params.spaceId === LEGACY_IDEAS_SPACE_ID) {
    const ideas = await prisma.activityPlan.findMany({
      where: {
        ...(await ownerScope(auth.user)),
        category: "IDEA_COLLECTION",
        ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { note: { contains: q, mode: "insensitive" as const } }] } : {})
      },
      include: { owner: { include: { profile: true } }, images: { include: { file: true }, orderBy: { createdAt: "asc" } } },
      orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });
    const pageItems = ideas.slice(0, limit);
    return NextResponse.json({ ok: true, count: pageItems.length, nextCursor: ideas.length > limit ? ideas[limit].id : null, items: pageItems.map((idea) => serializeContentEntry(request, { legacyType: "idea", idea })) });
  }

  const resolved = await contentSpaceAccess(auth.user, params.spaceId);
  if (!resolved || !("space" in resolved) || !resolved.space) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const { space } = resolved;
  const entries = await prisma.contentEntry.findMany({
    where: {
      spaceId: space.id,
      ...(auth.user.tenantId ? { tenantId: auth.user.tenantId } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }] } : {})
    },
    include: { owner: { include: { profile: true } }, space: true, attachments: { include: { file: true }, orderBy: { createdAt: "asc" } } },
    orderBy: [{ calendarDate: "desc" }, { updatedAt: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  });
  const pageItems = entries.slice(0, limit);
  return NextResponse.json({ ok: true, count: pageItems.length, nextCursor: entries.length > limit ? entries[limit].id : null, items: pageItems.map((entry) => serializeContentEntry(request, entry)) });
}

export async function POST(request: NextRequest, props: { params: Promise<{ spaceId: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;

  const { values, files } = await requestBody(request);
  const title = String(values.get("title") || "").trim();
  if (!title) return NextResponse.json({ ok: false, error: "title_required", message: "Titel fehlt" }, { status: 400 });
  const content = String(values.get("content") || values.get("text") || "").trim();
  const calendarDate = dateFromValue(values.get("calendarDate") || values.get("date"));
  const visibility = String(values.get("visibility") || "").trim();

  if (params.spaceId === LEGACY_WIKI_SPACE_ID) {
    const page = await createLegacyWikiEntry(auth.user, title, content, visibility);
    for (const file of files) {
      const asset = await saveUploadedFile(auth.user.id, file, auth.user.tenantId);
      if (asset) await prisma.wikiPageImage.create({ data: { pageId: page.id, fileId: asset.id, title: file.name || asset.originalName } });
    }
    await createWikiRevision(page.id, auth.user.id, "created_content_space_api");
    const refreshed = await prisma.wikiPage.findUnique({ where: { id: page.id }, include: { owner: { include: { profile: true } }, images: { include: { file: true }, orderBy: { createdAt: "asc" } } } });
    await logAction({ actorId: auth.user.id, action: "content_entry_created_api", entityType: "wikiPage", entityId: page.id, title: `Tagebucheintrag angelegt: ${page.title}`, href: refreshed ? serializeContentEntry(request, { legacyType: "wiki", page: refreshed }).href : null });
    return NextResponse.json({ ok: true, item: refreshed ? serializeContentEntry(request, { legacyType: "wiki", page: refreshed }) : null }, { status: 201 });
  }

  if (params.spaceId === LEGACY_IDEAS_SPACE_ID) {
    const idea = await createLegacyIdeaEntry(auth.user, title, content, calendarDate);
    for (const file of files) {
      const asset = await saveUploadedFile(auth.user.id, file, auth.user.tenantId);
      if (asset) await prisma.activityImage.create({ data: { activityId: idea.id, fileId: asset.id, title: file.name || asset.originalName } });
    }
    const refreshed = await prisma.activityPlan.findUnique({ where: { id: idea.id }, include: { owner: { include: { profile: true } }, images: { include: { file: true }, orderBy: { createdAt: "asc" } } } });
    await logAction({ actorId: auth.user.id, action: "content_entry_created_api", entityType: "activity", entityId: idea.id, title: `Idee angelegt: ${idea.title}`, href: `/ideas/${idea.slug}` });
    return NextResponse.json({ ok: true, item: refreshed ? serializeContentEntry(request, { legacyType: "idea", idea: refreshed }) : null }, { status: 201 });
  }

  const resolved = await contentSpaceAccess(auth.user, params.spaceId);
  if (!resolved || !("space" in resolved) || !resolved.space) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const { space } = resolved;
  const entry = await prisma.contentEntry.create({
    data: {
      tenantId: auth.user.tenantId || undefined,
      ownerId: auth.user.id,
      spaceId: space.id,
      title,
      content,
      calendarDate: calendarDate || undefined,
      visibility: visibility ? visibility : null
    },
    include: { owner: { include: { profile: true } }, space: true, attachments: { include: { file: true }, orderBy: { createdAt: "asc" } } }
  });
  for (const file of files) {
    const asset = await saveUploadedFile(auth.user.id, file, auth.user.tenantId);
    if (asset) await prisma.contentEntryAttachment.create({ data: { tenantId: auth.user.tenantId || undefined, ownerId: auth.user.id, entryId: entry.id, fileId: asset.id, title: file.name || asset.originalName } });
  }
  const refreshed = await prisma.contentEntry.findUnique({ where: { id: entry.id }, include: { owner: { include: { profile: true } }, space: true, attachments: { include: { file: true }, orderBy: { createdAt: "asc" } } } });
  await logAction({ actorId: auth.user.id, action: "content_entry_created_api", entityType: "contentEntry", entityId: entry.id, title: `Inhalt angelegt: ${entry.title}`, href: `/content-spaces/${entry.spaceId}/entries/${entry.id}` });
  return NextResponse.json({ ok: true, item: refreshed ? serializeContentEntry(request, refreshed) : null }, { status: 201 });
}
