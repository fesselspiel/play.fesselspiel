import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageGuide, PageHeader, Panel, SoftPanel } from "@/components/ui";
import { bondageSystemVisibilityScope } from "@/lib/access";
import { currentSessionContext } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";

export default async function BondageSystemDetailPage({ params }: { params: { slug: string } }) {
  await requireFeature("shopifyBondageSystem");
  const { user, tenant } = await currentSessionContext();
  if (!user) redirect("/login");
  if (!tenant) redirect("/");
  const item = await prisma.bondageSystemItem.findFirst({
    where: {
      tenantId: tenant.id,
      visible: true,
      product: { slug: params.slug },
      ...bondageSystemVisibilityScope(user)
    },
    include: { product: true, positions: true, activities: true }
  });
  if (!item) notFound();
  return (
    <AppShell>
      <PageHeader title={item.product.title} subtitle={`/bondage-system/${item.product.slug}`} />
      <PageGuide title="Bondage-System im Detail">
        Diese Seite zeigt ein aus Shopify synchronisiertes und freigegebenes Produkt. Es ist getrennt von deinen privaten Spielsachen, kann aber mit Szenen und Spielplänen verbunden werden.
      </PageGuide>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Panel>
          <div className="aspect-[16/10] overflow-hidden rounded-md bg-paper">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.product.imageUrl || "/toy-placeholder.svg"} alt="" className="h-full w-full object-cover" />
          </div>
          <p className="mt-5 whitespace-pre-wrap leading-7 text-graphite">{item.product.description || "Keine Beschreibung von Shopify erhalten."}</p>
          <div className="mt-5 grid gap-3 text-sm text-graphite sm:grid-cols-2">
            <div>Vendor: {item.product.vendor || "Shopify"}</div>
            <div>Synchronisiert: {formatDateTime(item.product.lastSyncedAt)}</div>
          </div>
          {item.showExternalLink && item.product.productUrl ? (
            <a href={item.product.productUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
              <ExternalLink className="h-4 w-4" />
              In Shopify öffnen
            </a>
          ) : null}
        </Panel>
        <div className="space-y-6">
          <SoftPanel>
            <h2 className="mb-3 text-lg font-semibold">Szenen</h2>
            <div className="space-y-2 text-sm">
              {item.positions.map((position) => (
                <Link key={position.id} href={`/positions/${position.slug}`} className="block rounded-md bg-surface px-3 py-2 hover:text-redbrand">{position.name}</Link>
              ))}
              {!item.positions.length ? <p className="text-graphite">Noch keine Szenen verknüpft.</p> : null}
            </div>
          </SoftPanel>
          <SoftPanel>
            <h2 className="mb-3 text-lg font-semibold">Spielpläne</h2>
            <div className="space-y-2 text-sm">
              {item.activities.map((activity) => (
                <Link key={activity.id} href={`/activities/${activity.slug}`} className="block rounded-md bg-surface px-3 py-2 hover:text-redbrand">{activity.title}</Link>
              ))}
              {!item.activities.length ? <p className="text-graphite">Noch keine Spielpläne verknüpft.</p> : null}
            </div>
          </SoftPanel>
        </div>
      </div>
    </AppShell>
  );
}
