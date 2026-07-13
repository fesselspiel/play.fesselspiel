import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requestValues, requireApiUser } from "@/lib/external-api";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { createWikiRevision, uniqueWikiSlug, wikiOwnerSlug, wikiPageAccessWhere } from "@/lib/wiki";
import { blockedUserIds, hiddenEntityIds } from "@/lib/compliance/ugc";

function visibility(value?: string | null) {
  return value === "PARTNER" || value === "SHARED" ? value : "PRIVATE";
}

function serializeWikiPage(page: Awaited<ReturnType<typeof prisma.wikiPage.findMany>>[number] & { owner: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null; id: string } }) {
  const ownerSlug = wikiOwnerSlug(page.owner);
  return {
    id: page.id,
    title: page.title,
    slug: page.slug,
    ownerSlug,
    namespacePath: `/wiki/${ownerSlug}`,
    path: `/wiki/${ownerSlug}/${page.slug}`,
    visibility: page.visibility,
    calendarDate: page.createdAt.toISOString(),
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
    owner: {
      id: page.owner.id,
      username: page.owner.username,
      displayName: page.owner.profile?.displayName || page.owner.name || page.owner.username || page.owner.email
    }
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "wiki");
  if (blocked) return blocked;
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 50)));
  const q = String(request.nextUrl.searchParams.get("q") || "").trim();
  const [blockedOwnerIds, hiddenWikiPageIds] = auth.user.tenantId
    ? await Promise.all([blockedUserIds(auth.user.id, auth.user.tenantId), hiddenEntityIds(auth.user.tenantId, "wikiPage")])
    : [[], []];
  const pages = await prisma.wikiPage.findMany({
    where: {
      AND: [
        await wikiPageAccessWhere(auth.user),
        ...(blockedOwnerIds.length ? [{ ownerId: { notIn: blockedOwnerIds } }] : []),
        ...(hiddenWikiPageIds.length ? [{ id: { notIn: hiddenWikiPageIds } }] : []),
        q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }] } : {}
      ]
    },
    include: { owner: { include: { profile: true } } },
    orderBy: [{ updatedAt: "desc" }],
    take: limit
  });
  return NextResponse.json({
    ok: true,
    items: pages.map((page) => ({ ...serializeWikiPage(page), own: page.ownerId === auth.user.id, canEdit: page.ownerId === auth.user.id || auth.user.role === "ADMIN" || auth.user.role === "SUPER_ADMIN" }))
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "wiki");
  if (blocked) return blocked;
  const values = await requestValues(request);
  const title = String(values.get("title") || "").trim();
  if (!title) return NextResponse.json({ ok: false, error: "title_required" }, { status: 400 });
  const slug = await uniqueWikiSlug(auth.user.id, auth.user.tenantId, title, title);
  const page = await prisma.wikiPage.create({
    data: {
      tenantId: auth.user.tenantId || undefined,
      ownerId: auth.user.id,
      title,
      slug,
      summary: "",
      content: String(values.get("content") || "").trim(),
      visibility: visibility(values.get("visibility"))
    },
    include: { owner: { include: { profile: true } } }
  });
  await createWikiRevision(page.id, auth.user.id, "created_api");
  await logAction({
    actorId: auth.user.id,
    action: "wiki_page_created_api",
    entityType: "wikiPage",
    entityId: page.id,
    title: `Wiki-Seite per API angelegt: ${page.title}`,
    href: `/wiki/${wikiOwnerSlug(page.owner)}/${page.slug}`
  });
  return NextResponse.json({ ok: true, item: serializeWikiPage(page), path: `/wiki/${wikiOwnerSlug(page.owner)}/${page.slug}` }, { status: 201 });
}
