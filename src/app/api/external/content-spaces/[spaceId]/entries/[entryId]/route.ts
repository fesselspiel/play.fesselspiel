import { NextRequest, NextResponse } from "next/server";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import {
  canEditContentEntry,
  contentEntryAccess,
  LEGACY_IDEAS_SPACE_ID,
  LEGACY_WIKI_SPACE_ID,
  parseEntryId,
  serializeContentEntry
} from "@/lib/content-spaces";
import { apiFeatureGate, dateFromValue, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";
import { createWikiRevision, uniqueWikiSlug, wikiEditablePage, wikiPageAccessWhere } from "@/lib/wiki";

export const runtime = "nodejs";

async function legacyWikiPage(user: Parameters<typeof wikiPageAccessWhere>[0], id: string) {
  return prisma.wikiPage.findFirst({
    where: { id, ...(await wikiPageAccessWhere(user)) },
    include: { owner: { include: { profile: true } }, images: { include: { file: true }, orderBy: { createdAt: "asc" } } }
  });
}

async function legacyIdea(user: Parameters<typeof ownerScope>[0], id: string) {
  return prisma.activityPlan.findFirst({
    where: { id, ...(await ownerScope(user)), category: "IDEA_COLLECTION" },
    include: { owner: { include: { profile: true } }, images: { include: { file: true }, orderBy: { createdAt: "asc" } } }
  });
}

export async function GET(request: NextRequest, props: { params: Promise<{ spaceId: string; entryId: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;

  const parsed = parseEntryId(params.entryId);
  if (params.spaceId === LEGACY_WIKI_SPACE_ID || parsed.type === "wiki") {
    const page = await legacyWikiPage(auth.user, parsed.id);
    if (!page) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, item: serializeContentEntry(request, { legacyType: "wiki", page }) });
  }
  if (params.spaceId === LEGACY_IDEAS_SPACE_ID || parsed.type === "idea") {
    const idea = await legacyIdea(auth.user, parsed.id);
    if (!idea) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, item: serializeContentEntry(request, { legacyType: "idea", idea }) });
  }
  const resolved = await contentEntryAccess(auth.user, params.spaceId, parsed.id);
  if (!resolved) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, item: serializeContentEntry(request, resolved.entry) });
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ spaceId: string; entryId: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const parsed = parseEntryId(params.entryId);

  if (params.spaceId === LEGACY_WIKI_SPACE_ID || parsed.type === "wiki") {
    const existing = await wikiEditablePage(auth.user, parsed.id);
    if (!existing) return NextResponse.json({ ok: false, error: "not_found_or_readonly" }, { status: 404 });
    const title = body.title !== undefined ? String(body.title || "").trim() || existing.title : existing.title;
    const slug = title !== existing.title ? await uniqueWikiSlug(existing.ownerId, auth.user.tenantId, title, title, existing.id) : existing.slug;
    const page = await prisma.wikiPage.update({
      where: { id: existing.id },
      data: {
        title,
        slug,
        ...(body.content !== undefined || body.text !== undefined ? { content: String(body.content || body.text || "").trim() } : {}),
        ...(body.visibility !== undefined ? { visibility: String(body.visibility) === "SHARED" ? "SHARED" : String(body.visibility) === "CIRCLES" ? "PARTNER" : "PRIVATE" } : {})
      },
      include: { owner: { include: { profile: true } }, images: { include: { file: true }, orderBy: { createdAt: "asc" } } }
    });
    await createWikiRevision(page.id, auth.user.id, "updated_content_space_api");
    await logAction({ actorId: auth.user.id, action: "content_entry_updated_api", entityType: "wikiPage", entityId: page.id, title: `Tagebucheintrag geändert: ${page.title}`, href: serializeContentEntry(request, { legacyType: "wiki", page }).href });
    return NextResponse.json({ ok: true, item: serializeContentEntry(request, { legacyType: "wiki", page }) });
  }

  if (params.spaceId === LEGACY_IDEAS_SPACE_ID || parsed.type === "idea") {
    const existing = await prisma.activityPlan.findFirst({ where: { id: parsed.id, category: "IDEA_COLLECTION", ...(auth.user.tenantId ? { tenantId: auth.user.tenantId } : {}), ...(auth.user.role === "ADMIN" || auth.user.role === "SUPER_ADMIN" ? {} : { ownerId: auth.user.id }) } });
    if (!existing) return NextResponse.json({ ok: false, error: "not_found_or_readonly" }, { status: 404 });
    const idea = await prisma.activityPlan.update({
      where: { id: existing.id },
      data: {
        ...(body.title !== undefined ? { title: String(body.title || "").trim() || existing.title } : {}),
        ...(body.content !== undefined || body.text !== undefined || body.note !== undefined ? { note: String(body.content || body.text || body.note || "").trim() } : {}),
        ...(body.calendarDate !== undefined || body.date !== undefined ? { plannedAt: dateFromValue(String(body.calendarDate || body.date || "")) } : {})
      },
      include: { owner: { include: { profile: true } }, images: { include: { file: true }, orderBy: { createdAt: "asc" } } }
    });
    await logAction({ actorId: auth.user.id, action: "content_entry_updated_api", entityType: "activity", entityId: idea.id, title: `Idee geändert: ${idea.title}`, href: `/ideas/${idea.slug}` });
    return NextResponse.json({ ok: true, item: serializeContentEntry(request, { legacyType: "idea", idea }) });
  }

  const resolved = await contentEntryAccess(auth.user, params.spaceId, parsed.id);
  if (!resolved || !canEditContentEntry(auth.user, resolved.entry, resolved.space)) return NextResponse.json({ ok: false, error: "not_found_or_readonly" }, { status: 404 });
  const entry = await prisma.contentEntry.update({
    where: { id: resolved.entry.id },
    data: {
      ...(body.title !== undefined ? { title: String(body.title || "").trim() || resolved.entry.title } : {}),
      ...(body.content !== undefined || body.text !== undefined ? { content: String(body.content || body.text || "").trim() } : {}),
      ...(body.calendarDate !== undefined || body.date !== undefined ? { calendarDate: dateFromValue(String(body.calendarDate || body.date || "")) } : {}),
      ...(body.visibility !== undefined ? { visibility: String(body.visibility || "").trim() || null } : {})
    },
    include: { owner: { include: { profile: true } }, space: true, attachments: { include: { file: true }, orderBy: { createdAt: "asc" } } }
  });
  await logAction({ actorId: auth.user.id, action: "content_entry_updated_api", entityType: "contentEntry", entityId: entry.id, title: `Inhalt geändert: ${entry.title}`, href: `/content-spaces/${entry.spaceId}/entries/${entry.id}` });
  return NextResponse.json({ ok: true, item: serializeContentEntry(request, entry) });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ spaceId: string; entryId: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  const parsed = parseEntryId(params.entryId);

  if (params.spaceId === LEGACY_WIKI_SPACE_ID || parsed.type === "wiki") {
    const existing = await wikiEditablePage(auth.user, parsed.id);
    if (!existing) return NextResponse.json({ ok: false, error: "not_found_or_readonly" }, { status: 404 });
    await prisma.wikiPage.delete({ where: { id: existing.id } });
    await logAction({ actorId: auth.user.id, action: "content_entry_deleted_api", entityType: "wikiPage", entityId: existing.id, title: `Tagebucheintrag gelöscht: ${existing.title}` });
    return NextResponse.json({ ok: true });
  }
  if (params.spaceId === LEGACY_IDEAS_SPACE_ID || parsed.type === "idea") {
    const existing = await prisma.activityPlan.findFirst({ where: { id: parsed.id, category: "IDEA_COLLECTION", ...(auth.user.tenantId ? { tenantId: auth.user.tenantId } : {}), ...(auth.user.role === "ADMIN" || auth.user.role === "SUPER_ADMIN" ? {} : { ownerId: auth.user.id }) } });
    if (!existing) return NextResponse.json({ ok: false, error: "not_found_or_readonly" }, { status: 404 });
    await prisma.activityPlan.update({ where: { id: existing.id }, data: { status: "DISCARDED" } });
    await logAction({ actorId: auth.user.id, action: "content_entry_deleted_api", entityType: "activity", entityId: existing.id, title: `Idee verworfen: ${existing.title}`, href: `/ideas/${existing.slug}` });
    return NextResponse.json({ ok: true });
  }
  const resolved = await contentEntryAccess(auth.user, params.spaceId, parsed.id);
  if (!resolved || !canEditContentEntry(auth.user, resolved.entry, resolved.space)) return NextResponse.json({ ok: false, error: "not_found_or_readonly" }, { status: 404 });
  await prisma.contentEntry.delete({ where: { id: resolved.entry.id } });
  await logAction({ actorId: auth.user.id, action: "content_entry_deleted_api", entityType: "contentEntry", entityId: resolved.entry.id, title: `Inhalt gelöscht: ${resolved.entry.title}` });
  return NextResponse.json({ ok: true });
}
