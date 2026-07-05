import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requestValues, requireApiUser } from "@/lib/external-api";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { uniqueWikiSlug, wikiOwnerSlug, wikiPageAccessWhere } from "@/lib/wiki";

function visibility(value?: string | null) {
  return value === "PARTNER" || value === "SHARED" ? value : "PRIVATE";
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "wiki");
  if (blocked) return blocked;
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 50)));
  const q = String(request.nextUrl.searchParams.get("q") || "").trim();
  const pages = await prisma.wikiPage.findMany({
    where: {
      AND: [
        await wikiPageAccessWhere(auth.user),
        q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }] } : {}
      ]
    },
    include: { owner: { include: { profile: true } } },
    orderBy: [{ updatedAt: "desc" }],
    take: limit
  });
  return NextResponse.json({
    ok: true,
    items: pages.map((page) => ({
      id: page.id,
      title: page.title,
      slug: page.slug,
      ownerSlug: wikiOwnerSlug(page.owner),
      namespacePath: `/wiki/${wikiOwnerSlug(page.owner)}`,
      path: `/wiki/${wikiOwnerSlug(page.owner)}/${page.slug}`,
      summary: page.summary,
      visibility: page.visibility,
      updatedAt: page.updatedAt.toISOString(),
      owner: {
        id: page.owner.id,
        username: page.owner.username,
        displayName: page.owner.profile?.displayName || page.owner.name || page.owner.username || page.owner.email
      }
    }))
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
  const slug = await uniqueWikiSlug(auth.user.id, auth.user.tenantId, values.get("slug") || "", title);
  const page = await prisma.wikiPage.create({
    data: {
      tenantId: auth.user.tenantId || undefined,
      ownerId: auth.user.id,
      title,
      slug,
      summary: String(values.get("summary") || "").trim(),
      content: String(values.get("content") || "").trim(),
      visibility: visibility(values.get("visibility"))
    },
    include: { owner: { include: { profile: true } } }
  });
  await logAction({
    actorId: auth.user.id,
    action: "wiki_page_created_api",
    entityType: "wikiPage",
    entityId: page.id,
    title: `Wiki-Seite per API angelegt: ${page.title}`,
    href: `/wiki/${wikiOwnerSlug(page.owner)}/${page.slug}`
  });
  return NextResponse.json({ ok: true, item: page, path: `/wiki/${wikiOwnerSlug(page.owner)}/${page.slug}` }, { status: 201 });
}
