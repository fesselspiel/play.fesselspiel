import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SortableToyList } from "@/components/sortable-catalog";
import { EmptyState, PageGuide, PageHeader } from "@/components/ui";
import { ownerScope } from "@/lib/access";
import { userDisplayName } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { hasFeature, requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";

export default async function ToysPage({ searchParams }: { searchParams: { q?: string; position?: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("toys");
  const positionsEnabled = await hasFeature("positions");
  const scope = await ownerScope(user);
  const q = searchParams.q?.trim();
  const position = positionsEnabled ? searchParams.position : undefined;
  const [toys, positions] = await Promise.all([
    prisma.toy.findMany({
      where: {
        ...scope,
        ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
        ...(position ? { positions: { some: { id: position } } } : {})
      },
      include: { positions: positionsEnabled, activities: true, favorites: { include: { user: { include: { profile: true } } } } },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }]
    }),
    positionsEnabled ? prisma.position.findMany({ where: scope, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }) : Promise.resolve([])
  ]);

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
      <form className={`mb-5 grid gap-3 rounded-lg bg-paper p-4 ${positionsEnabled ? "sm:grid-cols-[1fr_260px_auto]" : "sm:grid-cols-[1fr_auto]"}`}>
        <input className="focus-ring rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" name="q" placeholder="Nach Spielzeug suchen" defaultValue={q} />
        {positionsEnabled ? (
          <select className="focus-ring rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" name="position" defaultValue={position || ""}>
            <option value="">Alle Szenen</option>
            {positions.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
        ) : null}
        <button className="rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white">Filtern</button>
      </form>
      {toys.length ? (
        <SortableToyList canSort={user.role === "ADMIN" || user.role === "SUPER_ADMIN"} items={toys.map((toy) => ({
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
      ) : (
        <EmptyState title="Noch keine Spielzeuge angelegt">
          <Link href="/toys/new" className="font-semibold text-redbrand">Ersten Eintrag erstellen</Link>
        </EmptyState>
      )}
    </AppShell>
  );
}
