import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SortablePositionList } from "@/components/sortable-catalog";
import { EmptyState, PageGuide, PageHeader } from "@/components/ui";
import { ownerScope } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function PositionsPage({ searchParams }: { searchParams: { q?: string; toy?: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const scope = await ownerScope(user);
  const q = searchParams.q?.trim();
  const toy = searchParams.toy;
  const [positions, toys] = await Promise.all([
    prisma.position.findMany({
      where: {
        ...scope,
        ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
        ...(toy ? { tools: { some: { id: toy } } } : {})
      },
      include: { tools: true, activities: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    }),
    prisma.toy.findMany({ where: scope, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] })
  ]);

  return (
    <AppShell>
      <PageHeader
        title="Stellungen"
        action={
          <Link href="/positions/new" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white">
            <Plus className="h-4 w-4" />
            Stellung
          </Link>
        }
      />
      <PageGuide title="Positionen mit Bildern und Verknuepfungen">
        Stellungen sind wiederverwendbare Bausteine fuer Aktivitaeten. Suche nach Namen, filtere nach Spielzeug und oeffne einen Eintrag, um Bild, Beschreibung, Verknuepfungen und Bearbeitung zu sehen.
      </PageGuide>
      <form className="mb-5 grid gap-3 rounded-lg bg-paper p-4 sm:grid-cols-[1fr_260px_auto]">
        <input className="focus-ring rounded-md border border-line px-3 py-2 text-sm" name="q" placeholder="Nach Name suchen" defaultValue={q} />
        <select className="focus-ring rounded-md border border-line px-3 py-2 text-sm" name="toy" defaultValue={toy || ""}>
          <option value="">Alle Spielzeuge</option>
          {toys.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
        </select>
        <button className="rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white">Filtern</button>
      </form>
      {positions.length ? (
        <SortablePositionList items={positions.map((position) => ({
          id: position.id,
          name: position.name,
          slug: position.slug,
          description: position.description,
          imageUrl: position.imageUrl,
          toolCount: position.tools.length,
          activityCount: position.activities.length,
          tools: position.tools.map((tool) => ({ id: tool.id, title: tool.title, slug: tool.slug }))
        }))} />
      ) : (
        <EmptyState title="Keine Stellungen gefunden" />
      )}
    </AppShell>
  );
}
