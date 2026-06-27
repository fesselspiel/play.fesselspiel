import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { bondageSystemVisibilityScope } from "@/lib/access";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { absoluteUrl } from "@/lib/external-mobile-serializers";
import { stripHtml } from "@/lib/html";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const include = { product: true, positions: { include: { category: true } }, activities: true } satisfies Prisma.BondageSystemItemInclude;

type BondageItem = Prisma.BondageSystemItemGetPayload<{ include: typeof include }>;

function serialize(request: Request, item: BondageItem) {
  return {
    id: item.id,
    visible: item.visible,
    visibility: item.visibility,
    sortOrder: item.sortOrder,
    showExternalLink: item.showExternalLink,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    title: item.product.title,
    slug: item.product.slug,
    handle: item.product.handle,
    vendor: item.product.vendor,
    description: stripHtml(item.product.description),
    htmlDescription: item.product.description,
    imageUrl: item.product.imageUrl,
    productUrl: item.showExternalLink ? item.product.productUrl : null,
    tags: item.product.tags,
    href: `/bondage-system/${item.product.slug}`,
    url: absoluteUrl(request, `/bondage-system/${item.product.slug}`),
    positions: item.positions.map((position) => ({ id: position.id, name: position.name, slug: position.slug, href: `/positions/${position.slug}`, category: position.category ? { id: position.category.id, name: position.category.name } : null })),
    activities: item.activities.map((activity) => ({ id: activity.id, title: activity.title, slug: activity.slug, href: `/activities/${activity.slug}` }))
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "shopifyBondageSystem");
  if (blocked) return blocked;
  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 100)));
  const cursor = searchParams.get("cursor") || undefined;
  const q = String(searchParams.get("q") || "").trim();
  const items = await prisma.bondageSystemItem.findMany({
    where: {
      tenantId: auth.user.tenantId || undefined,
      visible: true,
      ...bondageSystemVisibilityScope(auth.user),
      ...(q ? { product: { title: { contains: q, mode: "insensitive" as const } } } : {})
    },
    include,
    orderBy: [{ sortOrder: "asc" }, { product: { title: "asc" } }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  });
  const pageItems = items.slice(0, limit);
  return NextResponse.json({ ok: true, nextCursor: items.length > limit ? items[limit].id : null, count: pageItems.length, items: pageItems.map((item) => serialize(request, item)) });
}
