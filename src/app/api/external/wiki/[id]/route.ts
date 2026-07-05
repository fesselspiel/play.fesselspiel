import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requestValues, requireApiUser } from "@/lib/external-api";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { uniqueWikiSlug, wikiExportText, wikiOwnerSlug, wikiPageAccessWhere } from "@/lib/wiki";

function visibility(value?: string | null) {
  return value === "PARTNER" || value === "SHARED" ? value : value === "PRIVATE" ? value : undefined;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "wiki");
  if (blocked) return blocked;
  const page = await prisma.wikiPage.findFirst({
    where: { AND: [await wikiPageAccessWhere(auth.user), { id: params.id }] },
    include: { owner: { include: { profile: true } }, shares: true }
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
  return NextResponse.json({
    ok: true,
    item: {
      id: page.id,
      title: page.title,
      slug: page.slug,
      ownerSlug: wikiOwnerSlug(page.owner),
      path: `/wiki/${wikiOwnerSlug(page.owner)}/${page.slug}`,
      summary: page.summary,
      content: page.content,
      mediaWikiExport: wikiExportText(page),
      visibility: page.visibility,
      createdAt: page.createdAt.toISOString(),
      updatedAt: page.updatedAt.toISOString(),
      canEdit: page.ownerId === auth.user.id || auth.user.role === "ADMIN" || auth.user.role === "SUPER_ADMIN"
    }
  });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
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
  const nextSlug = values.has("slug") || values.has("title")
    ? await uniqueWikiSlug(page.ownerId, auth.user.tenantId, values.get("slug") || page.slug, title, page.id)
    : page.slug;
  const nextVisibility = visibility(values.get("visibility"));
  const updated = await prisma.wikiPage.update({
    where: { id: page.id },
    data: {
      title,
      slug: nextSlug,
      ...(values.has("summary") ? { summary: String(values.get("summary") || "").trim() } : {}),
      ...(values.has("content") ? { content: String(values.get("content") || "").trim() } : {}),
      ...(nextVisibility ? { visibility: nextVisibility } : {})
    },
    include: { owner: { include: { profile: true } } }
  });
  await logAction({
    actorId: auth.user.id,
    action: "wiki_page_updated_api",
    entityType: "wikiPage",
    entityId: updated.id,
    title: `Wiki-Seite per API geändert: ${updated.title}`,
    href: `/wiki/${wikiOwnerSlug(updated.owner)}/${updated.slug}`
  });
  return NextResponse.json({ ok: true, item: updated, path: `/wiki/${wikiOwnerSlug(updated.owner)}/${updated.slug}` });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
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
