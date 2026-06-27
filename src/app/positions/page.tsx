import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SortablePositionList } from "@/components/sortable-catalog";
import { EmptyState, PageGuide, PageHeader } from "@/components/ui";
import { ownerScope } from "@/lib/access";
import { userDisplayName } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { catalogCategories, defaultCategoryNames } from "@/lib/catalog-categories";
import { hasFeature, requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";

export default async function PositionsPage({ searchParams }: { searchParams: { q?: string; toy?: string; category?: string; favoritesFirst?: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("positions");
  const toysEnabled = await hasFeature("toys");
  const scope = await ownerScope(user);
  const q = searchParams.q?.trim();
  const toy = toysEnabled ? searchParams.toy : undefined;
  const category = searchParams.category || "";
  const favoritesFirst = searchParams.favoritesFirst === "on";
  const [positions, toys, categories] = await Promise.all([
    prisma.position.findMany({
      where: {
        ...scope,
        ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
        ...(toy ? { tools: { some: { id: toy } } } : {}),
        ...(category ? { categoryId: category } : {})
      },
      include: { category: true, tools: toysEnabled, activities: true, favorites: { include: { user: { include: { profile: true } } } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    }),
    toysEnabled ? prisma.toy.findMany({ where: scope, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }) : Promise.resolve([]),
    catalogCategories("position", user.tenantId)
  ]);
  const sortedPositions = [...positions].sort((a, b) => favoritesFirst ? Number(b.favorites.some((favorite) => favorite.userId === user.id)) - Number(a.favorites.some((favorite) => favorite.userId === user.id)) : 0);
  const positionsByCategory = categories.map((entry) => ({
    category: entry,
    items: sortedPositions.filter((position) => position.categoryId === entry.id)
  })).filter((group) => group.items.length);
  const uncategorized = sortedPositions.filter((position) => !position.categoryId || !categories.some((entry) => entry.id === position.categoryId));
  if (uncategorized.length) positionsByCategory.push({ category: { id: "", name: defaultCategoryNames.position, kind: "position", tenantId: user.tenantId || null, sortOrder: 9999, createdAt: new Date(), updatedAt: new Date() }, items: uncategorized });

  return (
    <AppShell>
      <PageHeader
        title="Szenen"
        action={
          <Link href="/positions/new" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white">
            <Plus className="h-4 w-4" />
            Szene
          </Link>
        }
      />
      <PageGuide title="Positionen mit Bildern und Verknüpfungen">
        Szenen sind wiederverwendbare Bausteine für Aktivitäten. Suche nach Namen, filtere nach Spielzeug und öffne einen Eintrag, um Bild, Beschreibung, Verknüpfungen und Bearbeitung zu sehen.
      </PageGuide>
      <form className={`mb-5 grid gap-3 rounded-lg bg-paper p-4 ${toysEnabled ? "sm:grid-cols-[1fr_220px_220px_auto_auto]" : "sm:grid-cols-[1fr_220px_auto_auto]"}`}>
        <input className="focus-ring rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" name="q" placeholder="Nach Name suchen" defaultValue={q} />
        <select className="focus-ring rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" name="category" defaultValue={category}>
          <option value="">Alle Kategorien</option>
          {categories.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
        {toysEnabled ? (
          <select className="focus-ring rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" name="toy" defaultValue={toy || ""}>
            <option value="">Alle Spielzeuge</option>
            {toys.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
          </select>
        ) : null}
        <label className="flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm font-semibold text-graphite">
          <input name="favoritesFirst" type="checkbox" defaultChecked={favoritesFirst} className="h-4 w-4 accent-redbrand" />
          Favoriten zuerst
        </label>
        <button className="rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white">Filtern</button>
      </form>
      {positions.length ? (
        <div className="space-y-4">
          {positionsByCategory.map((group) => (
            <details key={group.category.id || "default"} open className="overflow-hidden rounded-lg border border-line bg-surface">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-paper px-4 py-3 text-sm font-semibold text-ink hover:text-redbrand [&::-webkit-details-marker]:hidden">
                <span>{group.category.name}</span>
                <span className="rounded-md bg-surface px-2 py-1 text-xs font-medium text-graphite">{group.items.length} Szene{group.items.length === 1 ? "" : "n"}</span>
              </summary>
              <div className="p-3">
                <SortablePositionList canSort={user.role === "ADMIN"} items={group.items.map((position) => ({
                  id: position.id,
                  name: position.name,
                  slug: position.slug,
                  description: position.description,
                  imageUrl: position.imageUrl,
                  selfBondageCapable: position.selfBondageCapable,
                  toolCount: toysEnabled ? position.tools.length : 0,
                  activityCount: position.activities.length,
                  tools: toysEnabled ? position.tools.map((tool) => ({ id: tool.id, title: tool.title, slug: tool.slug })) : [],
                  favoriteCount: position.favorites.length,
                  favoriteNames: position.favorites.map((favorite) => userDisplayName(favorite.user)),
                  isFavorite: position.favorites.some((favorite) => favorite.userId === user.id)
                }))} showTools={toysEnabled} />
              </div>
            </details>
          ))}
        </div>
      ) : (
        <EmptyState title="Keine Szenen gefunden" />
      )}
    </AppShell>
  );
}
