import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requestValues, requireApiUser } from "@/lib/external-api";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { createWikiRevision, uniqueWikiSlug, wikiExportText, wikiOwnerSlug, wikiPageAccessWhere } from "@/lib/wiki";
import { blockedUserIds, hiddenEntityIds } from "@/lib/compliance/ugc";

function visibility(value?: string | null) {
  return value === "PARTNER" || value === "SHARED" ? value : value === "PRIVATE" ? value : undefined;
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "wiki");
  if (blocked) return blocked;
  const [blockedOwnerIds, hiddenWikiPageIds] = auth.user.tenantId
    ? await Promise.all([blockedUserIds(auth.user.id, auth.user.tenantId), hiddenEntityIds(auth.user.tenantId, "wikiPage")])
    : [[], []];
  const page = await prisma.wikiPage.findFirst({
    where: {
      AND: [
        await wikiPageAccessWhere(auth.user),
        { id: params.id },
        ...(blockedOwnerIds.length ? [{ ownerId: { notIn: blockedOwnerIds } }] : []),
        ...(hiddenWikiPageIds.length ? [{ id: { notIn: hiddenWikiPageIds } }] : [])
      ]
    },
    include: {
      owner: { include: { profile: true } },
      shares: true,
      revisions: { include: { actor: { include: { profile: true } } }, orderBy: { createdAt: "desc" }, take: 20 },
      images: { include: { file: true }, orderBy: { createdAt: "asc" } }
    }
  });
  if (!page) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  await logAction({
    actorId: auth.user.id,
    action: "wiki_page_viewed_api",
    entityType: "wikiPage",
    entityId: page.id,
    title: `Wiki-Seite per API gelesen: ${page.title}`,
    href: `/wiki/${wikiOwnerSlug(page.owner)}/${page.slug}`
  });
  const revisions = page.revisions.length
    ? page.revisions
    : [{
        id: "created-fallback",
        action: "created",
        createdAt: page.createdAt,
        actor: page.owner
      }];
  return NextResponse.json({
    ok: true,
    item: {
      id: page.id,
      title: page.title,
      slug: page.slug,
      ownerSlug: wikiOwnerSlug(page.owner),
      path: `/wiki/${wikiOwnerSlug(page.owner)}/${page.slug}`,
      content: page.content,
      mediaWikiExport: wikiExportText(page),
      visibility: page.visibility,
      calendarDate: page.createdAt.toISOString(),
      images: page.images.map((image) => ({
        id: image.id,
        fileId: image.fileId,
        title: image.title,
        url: `/api/external/files/${image.fileId}`,
        protectedUrl: `/api/files/${image.fileId}`,
        mimeType: image.file.mimeType,
        createdAt: image.createdAt.toISOString()
      })),
      createdAt: page.createdAt.toISOString(),
      updatedAt: page.updatedAt.toISOString(),
      owner: {
        id: page.owner.id,
        username: page.owner.username,
        displayName: page.owner.profile?.displayName || page.owner.name || page.owner.username || page.owner.email
      },
      own: page.ownerId === auth.user.id,
      revisions: revisions.map((revision) => ({
        id: revision.id,
        action: revision.action,
        createdAt: revision.createdAt.toISOString(),
        actor: revision.actor ? {
          id: revision.actor.id,
          username: revision.actor.username,
          displayName: revision.actor.profile?.displayName || revision.actor.name || revision.actor.username || revision.actor.email
        } : null
      })),
      canEdit: page.ownerId === auth.user.id || auth.user.role === "ADMIN" || auth.user.role === "SUPER_ADMIN"
    }
  });
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "wiki");
  if (blocked) return blocked;
  const page = await prisma.wikiPage.findFirst({
    where: {
      id: params.id,
      ...(auth.user.tenantId ? { tenantId: auth.user.tenantId } : {}),
      ...(auth.user.role === "ADMIN" || auth.user.role === "SUPER_ADMIN" ? {} : { ownerId: auth.user.id })
    },
    include: { owner: { include: { profile: true } } }
  });
  if (!page) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const values = await requestValues(request);
  const title = values.has("title") ? String(values.get("title") || "").trim() || page.title : page.title;
  const nextSlug = values.has("title")
    ? await uniqueWikiSlug(page.ownerId, auth.user.tenantId, title, title, page.id)
    : page.slug;
  const nextVisibility = visibility(values.get("visibility"));
  const updated = await prisma.wikiPage.update({
    where: { id: page.id },
    data: {
      title,
      slug: nextSlug,
      ...(values.has("summary") ? { summary: "" } : {}),
      ...(values.has("content") ? { content: String(values.get("content") || "").trim() } : {}),
      ...(nextVisibility ? { visibility: nextVisibility } : {})
    },
    include: { owner: { include: { profile: true } } }
  });
  await createWikiRevision(updated.id, auth.user.id, "updated_api");
  await logAction({
    actorId: auth.user.id,
    action: "wiki_page_updated_api",
    entityType: "wikiPage",
    entityId: updated.id,
    title: `Wiki-Seite per API geändert: ${updated.title}`,
    href: `/wiki/${wikiOwnerSlug(updated.owner)}/${updated.slug}`
  });
  return NextResponse.json({
    ok: true,
    item: {
      id: updated.id,
      title: updated.title,
      slug: updated.slug,
      ownerSlug: wikiOwnerSlug(updated.owner),
      path: `/wiki/${wikiOwnerSlug(updated.owner)}/${updated.slug}`,
      content: updated.content,
      visibility: updated.visibility,
      calendarDate: updated.createdAt.toISOString(),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString()
    },
    path: `/wiki/${wikiOwnerSlug(updated.owner)}/${updated.slug}`
  });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "wiki");
  if (blocked) return blocked;
  const page = await prisma.wikiPage.findFirst({
    where: {
      id: params.id,
      ...(auth.user.tenantId ? { tenantId: auth.user.tenantId } : {}),
      ...(auth.user.role === "ADMIN" || auth.user.role === "SUPER_ADMIN" ? {} : { ownerId: auth.user.id })
    }
  });
  if (!page) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  await prisma.wikiPage.delete({ where: { id: page.id } });
  await logAction({
    actorId: auth.user.id,
    action: "wiki_page_deleted_api",
    entityType: "wikiPage",
    entityId: page.id,
    title: `Wiki-Seite per API gelöscht: ${page.title}`,
    href: "/wiki"
  });
  return NextResponse.json({ ok: true });
}
