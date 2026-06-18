import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
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
      orderBy: { name: "asc" }
    }),
    prisma.toy.findMany({ where: scope, orderBy: { title: "asc" } })
  ]);

  return (
    <AppShell>
      <PageHeader
        title="Stellungen"
        subtitle="Positionen mit Bildern, Beschreibungen und Verknuepfungen zu Spielzeugen und Aktivitaeten."
        action={
          <Link href="/positions/new" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white">
            <Plus className="h-4 w-4" />
            Stellung
          </Link>
        }
      />
      <PageGuide>
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
        <div className="space-y-3">
          {positions.map((position) => (
            <details key={position.id} className="group overflow-hidden rounded-lg border border-line bg-surface">
              <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 px-3 py-3 hover:bg-paper [&::-webkit-details-marker]:hidden">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-paper sm:h-16 sm:w-16">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={position.imageUrl || "/position-placeholder.svg"} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-semibold text-ink">{position.name}</h2>
                  <p className="mt-1 truncate text-xs text-graphite">{position.tools.length} Spielzeuge · {position.activities.length} Spielplaene</p>
                </div>
                <ChevronDown className="h-5 w-5 shrink-0 text-graphite transition group-open:rotate-180" />
              </summary>
              <div className="border-t border-line bg-paper p-4">
                <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
                  <div className="aspect-[4/3] overflow-hidden rounded-md bg-surface">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={position.imageUrl || "/position-placeholder.svg"} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-graphite">
                      <span className="rounded-md bg-surface px-2 py-1">/positions/{position.slug}</span>
                      <span className="rounded-md bg-surface px-2 py-1">{position.tools.length} Spielzeuge</span>
                      <span className="rounded-md bg-surface px-2 py-1">{position.activities.length} Spielplaene</span>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-graphite">{position.description || "Keine Beschreibung hinterlegt."}</p>
                    {position.tools.length ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {position.tools.slice(0, 6).map((tool) => (
                          <Link key={tool.id} href={`/toys/${tool.slug}`} className="rounded-md bg-surface px-2 py-1 text-xs font-medium text-graphite hover:text-redbrand">
                            {tool.title}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <Link href={`/positions/${position.slug}`} className="inline-flex min-h-10 items-center rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-redbrandHover">
                        Detail oeffnen
                      </Link>
                      <span className="text-xs text-graphite">Detailseite mit Bild, Verknuepfungen und Bearbeitung.</span>
                    </div>
                  </div>
                </div>
              </div>
            </details>
          ))}
        </div>
      ) : (
        <EmptyState title="Keine Stellungen gefunden" />
      )}
    </AppShell>
  );
}
