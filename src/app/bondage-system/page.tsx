import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SortableBondageSystemList } from "@/components/sortable-catalog";
import { EmptyState, PageGuide, PageHeader } from "@/components/ui";
import { bondageSystemVisibilityScope } from "@/lib/access";
import { currentSessionContext } from "@/lib/auth";
import { requireFeature } from "@/lib/features";
import { stripHtml } from "@/lib/html";
import { prisma } from "@/lib/prisma";

export default async function BondageSystemPage() {
  await requireFeature("shopifyBondageSystem");
  const { user, tenant } = await currentSessionContext();
  if (!user) redirect("/login");
  if (!tenant) redirect("/");
  const items = await prisma.bondageSystemItem.findMany({
    where: {
      tenantId: tenant.id,
      visible: true,
      ...bondageSystemVisibilityScope(user)
    },
    include: { product: true, positions: true, activities: true },
    orderBy: [{ sortOrder: "asc" }, { product: { title: "asc" } }]
  });
  return (
    <AppShell>
      <PageHeader title="Bondage-System" />
      <PageGuide title="Synchronisierte Ausrüstung aus Shopify">
        Hier siehst du freigegebene Produkte aus dem verbundenen Shopify-Shop. Diese Produkte sind vom privaten Spielzeugkatalog getrennt und können mit Szenen und Spielplänen verknüpft werden.
      </PageGuide>
      {items.length ? (
        <SortableBondageSystemList canSort={user.role === "ADMIN" || user.role === "SUPER_ADMIN"} items={items.map((item) => ({
          id: item.id,
          title: item.product.title,
          slug: item.product.slug,
          description: stripHtml(item.product.description),
          imageUrl: item.product.imageUrl,
          vendor: item.product.vendor,
          positionCount: item.positions.length,
          activityCount: item.activities.length,
          inTagFilter: item.product.inTagFilter
        }))} />
      ) : (
        <EmptyState title="Noch keine Produkte freigegeben">
          Admins können unter <Link href="/settings/shopify" className="font-semibold text-redbrand">Einstellungen → Shopify</Link> Produkte einlesen und sichtbar schalten.
        </EmptyState>
      )}
    </AppShell>
  );
}
