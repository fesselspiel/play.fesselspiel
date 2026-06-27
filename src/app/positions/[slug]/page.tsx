import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pencil, Star } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, PageGuide, PageHeader, Panel, SoftPanel } from "@/components/ui";
import { isAccessibleOwner, contentTenantScope } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { hasFeature, requireFeature } from "@/lib/features";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

async function togglePositionFavorite(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("positions");
  const positionId = String(formData.get("positionId") || "");
  const position = await prisma.position.findFirst({ where: { id: positionId, ...contentTenantScope(user) }, select: { id: true, ownerId: true, name: true, slug: true } });
  if (!position || !(await isAccessibleOwner(user, position.ownerId))) notFound();
  const existing = await prisma.positionFavorite.findUnique({ where: { positionId_userId: { positionId: position.id, userId: user.id } } });
  if (existing) {
    await prisma.positionFavorite.delete({ where: { id: existing.id } });
  } else {
    await prisma.positionFavorite.create({ data: { positionId: position.id, userId: user.id } });
    await logAction({
      actorId: user.id,
      action: "position_favorited",
      entityType: "position",
      entityId: position.id,
      title: `Szene favorisiert: ${position.name}`,
      href: `/positions/${position.slug}`
    });
  }
  redirect(`/positions/${position.slug}`);
}

export default async function PositionDetailPage({ params }: { params: { slug: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("positions");
  const toysEnabled = await hasFeature("toys");
  const bondageSystemEnabled = await hasFeature("shopifyBondageSystem");
  const position = await prisma.position.findFirst({
    where: { slug: params.slug, ...contentTenantScope(user) },
    include: { category: true, tools: toysEnabled, activities: true, favorites: true }
  });
  if (!position || !(await isAccessibleOwner(user, position.ownerId))) notFound();
  const isFavorite = position.favorites.some((favorite) => favorite.userId === user.id);
  const positionBondageItems = bondageSystemEnabled ? await prisma.bondageSystemItem.findMany({
    where: { positions: { some: { id: position.id } } },
    include: { product: true },
    orderBy: [{ sortOrder: "asc" }, { product: { title: "asc" } }]
  }) : [];
  return (
    <AppShell>
      <PageHeader
        title={position.name}
        subtitle={`/positions/${position.slug}`}
      />
      <PageGuide>
        Diese Seite dokumentiert eine einzelne Szene. Du siehst Bild, Beschreibung, verknüpfte Spielzeuge und Aktivitäten; über Bearbeiten kannst du Inhalte und Verknüpfungen anpassen.
      </PageGuide>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Panel>
          <div className="aspect-[16/10] overflow-hidden rounded-md bg-paper">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={position.imageUrl || "/position-placeholder.svg"} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Badge tone="neutral">Kategorie: {position.category?.name || "Allgemein"}</Badge>
            <Badge tone={position.selfBondageCapable ? "red" : "neutral"}>
              {position.selfBondageCapable ? "Self-Bondage-fähig" : "Nicht als Self-Bondage-fähig markiert"}
            </Badge>
          </div>
          <p className="mt-5 leading-7 text-graphite">{position.description || "Keine Beschreibung hinterlegt."}</p>
        </Panel>
        <div className="space-y-6">
          {toysEnabled ? (
            <SoftPanel>
              <h2 className="mb-3 text-lg font-semibold">Spielzeuge</h2>
              <div className="space-y-2">
                {position.tools.map((toy) => <Link key={toy.id} href={`/toys/${toy.slug}`} className="block rounded-md bg-paper px-3 py-2 text-sm text-ink hover:text-redbrand">{toy.title}</Link>)}
              </div>
            </SoftPanel>
          ) : null}
          {bondageSystemEnabled ? (
            <SoftPanel>
              <h2 className="mb-3 text-lg font-semibold">Bondage-System</h2>
              <div className="space-y-2">
                {positionBondageItems.map((item) => (
                  <Link key={item.id} href={`/bondage-system/${item.product.slug}`} className="block rounded-md bg-paper px-3 py-2 text-sm text-ink hover:text-redbrand">{item.product.title}</Link>
                ))}
                {!positionBondageItems.length ? <p className="text-sm text-graphite">Keine Bondage-System-Produkte verknüpft.</p> : null}
              </div>
            </SoftPanel>
          ) : null}
          <SoftPanel>
            <h2 className="mb-3 text-lg font-semibold">Aktivitäten</h2>
            <div className="space-y-2">
              {position.activities.map((activity) => <Link key={activity.id} href={`/activities/${activity.slug}`} className="block rounded-md bg-paper px-3 py-2 text-sm text-ink hover:text-redbrand">{activity.title}</Link>)}
            </div>
          </SoftPanel>
        </div>
      </div>
      <Panel className="mt-6">
        <h2 className="mb-2 text-lg font-semibold">Aktionen</h2>
        <p className="mb-4 text-sm text-graphite">Bearbeite diese Szene, wenn Bild, Beschreibung oder die verknüpften Spielzeuge angepasst werden sollen.</p>
        <div className="flex flex-wrap items-center gap-3">
          <form action={togglePositionFavorite}>
            <input type="hidden" name="positionId" value={position.id} />
            <button className={`inline-flex min-h-10 items-center gap-2 rounded-md border border-line px-4 py-2 text-sm font-semibold hover:bg-paper ${isFavorite ? "bg-redbrand text-white hover:bg-redbrandHover" : "bg-surface text-ink"}`}>
              <Star className="h-4 w-4" />
              {isFavorite ? "Favorit" : "Als Favorit markieren"}
            </button>
          </form>
          <Link href={`/positions/${position.slug}/edit`} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
            <Pencil className="h-4 w-4" />
            Bearbeiten
          </Link>
        </div>
        {position.favorites.length ? <p className="mt-3 text-xs text-graphite">{position.favorites.length} Favorit{position.favorites.length === 1 ? "" : "en"}</p> : null}
      </Panel>
    </AppShell>
  );
}
