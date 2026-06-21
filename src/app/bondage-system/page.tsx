import Link from "next/link";
import { redirect } from "next/navigation";
import { PackageSearch } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageGuide, PageHeader, Panel } from "@/components/ui";
import { bondageSystemVisibilityScope } from "@/lib/access";
import { currentSessionContext } from "@/lib/auth";
import { requireFeature } from "@/lib/features";
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
        <div className="space-y-3">
          {items.map((item) => (
            <details key={item.id} className="group overflow-hidden rounded-lg border border-line bg-surface">
              <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 px-3 py-3 hover:bg-paper [&::-webkit-details-marker]:hidden">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-paper sm:h-16 sm:w-16">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.product.imageUrl || "/toy-placeholder.svg"} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-semibold text-ink">{item.product.title}</h2>
                  <p className="mt-1 truncate text-xs text-graphite">{item.positions.length} Szenen · {item.activities.length} Spielpläne · {item.product.vendor || "Shopify"}</p>
                </div>
                <PackageSearch className="h-5 w-5 shrink-0 text-graphite" />
              </summary>
              <div className="border-t border-line bg-paper p-4">
                <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
                  <div className="aspect-[4/3] overflow-hidden rounded-md bg-surface">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.product.imageUrl || "/toy-placeholder.svg"} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2 text-xs font-medium text-graphite">
                      <span className="rounded-md bg-surface px-2 py-1">{item.positions.length} Szenen</span>
                      <span className="rounded-md bg-surface px-2 py-1">{item.activities.length} Spielpläne</span>
                      {!item.product.inTagFilter ? <span className="rounded-md bg-surface px-2 py-1">nicht mehr im Shopify-Filter</span> : null}
                    </div>
                    <p className="mt-4 line-clamp-4 text-sm leading-6 text-graphite">{item.product.description || "Keine Beschreibung von Shopify erhalten."}</p>
                    <Link href={`/bondage-system/${item.product.slug}`} className="mt-4 inline-flex min-h-10 items-center rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-redbrandHover">
                      Detail öffnen
                    </Link>
                  </div>
                </div>
              </div>
            </details>
          ))}
        </div>
      ) : (
        <EmptyState title="Noch keine Produkte freigegeben">
          Admins können unter <Link href="/settings/shopify" className="font-semibold text-redbrand">Einstellungen → Shopify</Link> Produkte einlesen und sichtbar schalten.
        </EmptyState>
      )}
    </AppShell>
  );
}
