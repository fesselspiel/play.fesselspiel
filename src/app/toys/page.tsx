import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SortableToyList } from "@/components/sortable-catalog";
import { EmptyState, PageGuide, PageHeader } from "@/components/ui";
import { ownerScope } from "@/lib/access";
import { userDisplayName } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { catalogCategories, defaultCategoryNames } from "@/lib/catalog-categories";
import { hasFeature, requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";

export default async function ToysPage({ searchParams }: { searchParams: { q?: string; position?: string; category?: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("toys");
  const positionsEnabled = await hasFeature("positions");
  const scope = await ownerScope(user);
  const q = searchParams.q?.trim();
  const position = positionsEnabled ? searchParams.position : undefined;
  const category = searchParams.category || "";
  const [toys, positions, categories] = await Promise.all([
    prisma.toy.findMany({
      where: {
        ...scope,
        ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
        ...(position ? { positions: { some: { id: position } } } : {}),
        ...(category ? { categoryId: category } : {})
      },
      include: { category: true, positions: positionsEnabled, activities: true, favorites: { include: { user: { include: { profile: true } } } } },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }]
    }),
    positionsEnabled ? prisma.position.findMany({ where: scope, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }) : Promise.resolve([]),
    catalogCategories("toy", user.tenantId)
  ]);
  const toysByCategory = categories.map((entry) => ({
    category: entry,
    items: toys.filter((toy) => toy.categoryId === entry.id)
  })).filter((group) => group.items.length);
  const uncategorized = toys.filter((toy) => !toy.categoryId || !categories.some((entry) => entry.id === toy.categoryId));
  if (uncategorized.length) toysByCategory.push({ category: { id: "", name: defaultCategoryNames.toy, kind: "toy", tenantId: user.tenantId || null, sortOrder: 9999, createdAt: new Date(), updatedAt: new Date() }, items: uncategorized });

  return (
    <AppShell>
      <PageHeader
        title="Spielzeugkatalog"
        action={
          <Link href="/toys/new" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white">
            <Plus className="h-4 w-4" />
            Spielzeug
          </Link>
        }
      />
      <PageGuide title="Persönliche Ausrüstung mit Bildern und Verknüpfungen">
        Hier verwaltest du deinen Spielzeugkatalog. Öffne einen Eintrag für Details, QR-Code und Verknüpfungen oder lege über den roten Button ein neues Spielzeug mit Bild, Beschreibung und passenden Szenen an.
      </PageGuide>
      <form className={`mb-5 grid gap-3 rounded-lg bg-paper p-4 ${positionsEnabled ? "sm:grid-cols-[1fr_220px_220px_auto]" : "sm:grid-cols-[1fr_220px_auto]"}`}>
        <input className="focus-ring rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" name="q" placeholder="Nach Spielzeug suchen" defaultValue={q} />
        <select className="focus-ring rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" name="category" defaultValue={category}>
          <option value="">Alle Kategorien</option>
          {categories.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
        {positionsEnabled ? (
          <select className="focus-ring rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" name="position" defaultValue={position || ""}>
            <option value="">Alle Szenen</option>
            {positions.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
        ) : null}
        <button className="rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white">Filtern</button>
      </form>
      {toys.length ? (
        <div className="space-y-4">
          {toysByCategory.map((group) => (
            <details key={group.category.id || "default"} open className="overflow-hidden rounded-lg border border-line bg-surface">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-paper px-4 py-3 text-sm font-semibold text-ink hover:text-redbrand [&::-webkit-details-marker]:hidden">
                <span>{group.category.name}</span>
                <span className="rounded-md bg-surface px-2 py-1 text-xs font-medium text-graphite">{group.items.length} Eintrag{group.items.length === 1 ? "" : "e"}</span>
              </summary>
              <div className="p-3">
                <SortableToyList canSort={user.role === "ADMIN" || user.role === "SUPER_ADMIN"} items={group.items.map((toy) => ({
                  id: toy.id,
                  title: toy.title,
                  slug: toy.slug,
                  description: toy.description,
                  imageUrl: toy.imageUrl,
                  positionCount: positionsEnabled ? toy.positions.length : 0,
                  activityCount: toy.activities.length,
                  favoriteCount: toy.favorites.length,
                  favoriteNames: toy.favorites.map((favorite) => userDisplayName(favorite.user)),
                  isFavorite: toy.favorites.some((favorite) => favorite.userId === user.id)
                }))} />
              </div>
            </details>
          ))}
        </div>
      ) : (
        <EmptyState title="Noch keine Spielzeuge angelegt">
          <Link href="/toys/new" className="font-semibold text-redbrand">Ersten Eintrag erstellen</Link>
        </EmptyState>
      )}
    </AppShell>
  );
}
