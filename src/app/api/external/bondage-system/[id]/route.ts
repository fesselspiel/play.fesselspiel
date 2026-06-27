import { NextRequest, NextResponse } from "next/server";
import { bondageSystemVisibilityScope } from "@/lib/access";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { absoluteUrl } from "@/lib/external-mobile-serializers";
import { stripHtml } from "@/lib/html";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "shopifyBondageSystem");
  if (blocked) return blocked;
  const item = await prisma.bondageSystemItem.findFirst({
    where: {
      tenantId: auth.user.tenantId || undefined,
      visible: true,
      OR: [{ id: params.id }, { product: { slug: params.id } }],
      ...bondageSystemVisibilityScope(auth.user)
    },
    include: { product: true, positions: { include: { category: true } }, activities: true }
  });
  if (!item) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({
    ok: true,
    item: {
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
    }
  });
}
