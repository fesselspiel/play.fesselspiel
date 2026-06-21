import Link from "next/link";
import { redirect } from "next/navigation";
import { Lightbulb, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, EmptyState, PageGuide, PageHeader, Panel, SoftPanel } from "@/components/ui";
import { activityStatusDisplay, activityStatusTone } from "@/lib/activity-status";
import { ownerScope } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { hasFeature, requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/dates";

export default async function ActivitiesPage() {
  await requireFeature("activities");
  const user = await currentUser();
  if (!user) redirect("/login");
  const selfBondageEnabled = await hasFeature("selfBondage");
  const toolsEnabled = await hasFeature("toys");
  const positionsEnabled = await hasFeature("positions");
  const activities = await prisma.activityPlan.findMany({
    where: await ownerScope(user),
    include: { tools: toolsEnabled, positions: positionsEnabled },
    orderBy: [{ status: "asc" }, { plannedAt: "asc" }]
  });
  const selfBondagePositions = selfBondageEnabled ? await prisma.position.findMany({
    where: { ...(await ownerScope(user)), selfBondageCapable: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    take: 6
  }) : [];
  const ideas = activities.filter((activity) => activity.category === "IDEA_COLLECTION");
  const plans = activities.filter((activity) => activity.category !== "IDEA_COLLECTION");
  return (
    <AppShell>
      <PageHeader title="Lass uns spielen" />
      <PageGuide title="Spielideen planen">
        Hier planst du gemeinsame Spielideen aus Bausteinen. Öffne einen Plan für Details oder erstelle eine neue Idee mit Datum, Status, Notiz, Spielsachen und Szenen.
      </PageGuide>
      <div className="mb-6 grid gap-4 xl:grid-cols-3">
        <Panel className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-redbrand text-white">
            <Sparkles className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-semibold text-ink">Spieltermin planen</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-graphite">
            Lege einen konkreten Termin an, wähle Spielsachen und Szenen aus und entscheide, ob es direkt geplant oder erst angefragt ist.
          </p>
          <Link href="/activities/new" className="focus-ring mt-5 inline-flex min-h-14 items-center justify-center gap-3 rounded-md bg-redbrand px-7 py-3 text-base font-semibold text-white shadow-soft hover:bg-redbrandHover">
            <Plus className="h-5 w-5" />
            Neuen Spieltermin anlegen
          </Link>
        </Panel>
        {selfBondageEnabled ? <Panel className="bg-paper text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sky-600 text-white">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-semibold text-ink">Self-Bondage-Auftrag</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-graphite">
            Erstelle einen Auftrag: Eine Person bringt sich selbst in eine ausgewählte Lage und wartet dort auf die weitere Ansage.
          </p>
          {selfBondagePositions.length ? (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {selfBondagePositions.map((position) => (
                <span key={position.id} className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-graphite">{position.name}</span>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-md bg-surface p-3 text-sm text-graphite">Markiere bei Szenen das Feld „Self-Bondage-fähig“, damit sie hier als Vorbereitung auftauchen.</p>
          )}
          <Link href="/activities/new?template=self-bondage" className="focus-ring mt-5 inline-flex min-h-14 items-center justify-center gap-3 rounded-md border border-sky-600 bg-sky-600 px-7 py-3 text-base font-semibold text-white shadow-soft hover:bg-sky-700">
            <ShieldCheck className="h-5 w-5" />
            Self-Bondage-Auftrag erteilen
          </Link>
        </Panel> : null}
        <Panel className="bg-paper text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-white">
            <Lightbulb className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-semibold text-ink">Ideensammlung</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-graphite">
            Sammle Dinge, die ihr irgendwann ausprobieren wollt. Bilder und Bausteine bleiben direkt an der Idee hängen.
          </p>
          <Link href="/activities/new?template=idea" className="focus-ring mt-5 inline-flex min-h-14 items-center justify-center gap-3 rounded-md border border-amber-500 bg-amber-500 px-7 py-3 text-base font-semibold text-white shadow-soft hover:bg-amber-600">
            <Lightbulb className="h-5 w-5" />
            Idee festhalten
          </Link>
        </Panel>
      </div>
      {ideas.length ? (
        <Panel className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">Ideensammlung</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {ideas.map((idea) => (
              <Link key={idea.id} href={`/activities/${idea.slug}`} className="block rounded-md border border-line bg-paper p-3 hover:border-amber-500">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-ink">{idea.title}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-graphite">{idea.note || "Noch keine Beschreibung."}</p>
                  </div>
                  <Badge tone={activityStatusTone(idea.status)}>{activityStatusDisplay(idea.status, false, true)}</Badge>
                </div>
              </Link>
            ))}
          </div>
        </Panel>
      ) : null}
      {plans.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {plans.map((activity) => {
            const isSelfBondageOrder = activity.category === "SELF_BONDAGE_ORDER" || activity.category === "Self-Bondage";
            return (
            <Link key={activity.id} href={`/activities/${activity.slug}`}>
              <SoftPanel className="h-full transition hover:bg-[#eeeeee]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{activity.title}</h2>
                    <p className="mt-1 text-sm text-graphite">{isSelfBondageOrder ? "Auftrag" : activity.category || "Aktivität"} · {isSelfBondageOrder && !activity.plannedAt ? "gilt sofort beim Lesen" : formatDateTime(activity.plannedAt)}</p>
                  </div>
                  <Badge tone={activityStatusTone(activity.status)}>{activityStatusDisplay(activity.status, isSelfBondageOrder)}</Badge>
                </div>
                <p className="mt-4 text-sm text-graphite">{activity.note || "Keine Notiz."}</p>
                {toolsEnabled || positionsEnabled ? (
                  <p className="mt-4 text-xs text-graphite">
                    {toolsEnabled ? `${(activity as { tools?: unknown[] }).tools?.length || 0} Spielzeuge` : ""}
                    {toolsEnabled && positionsEnabled ? " · " : ""}
                    {positionsEnabled ? `${(activity as { positions?: unknown[] }).positions?.length || 0} Szenen` : ""}
                  </p>
                ) : null}
              </SoftPanel>
            </Link>
            );
          })}
        </div>
      ) : (
        !ideas.length ? <EmptyState title="Noch nichts geplant" /> : null
      )}
    </AppShell>
  );
}
