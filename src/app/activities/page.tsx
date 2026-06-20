import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, ShieldCheck, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, EmptyState, PageGuide, PageHeader, Panel, SoftPanel } from "@/components/ui";
import { activityStatusDisplay, activityStatusTone } from "@/lib/activity-status";
import { ownerScope } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/dates";

export default async function ActivitiesPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const activities = await prisma.activityPlan.findMany({
    where: await ownerScope(user),
    include: { tools: true, positions: true },
    orderBy: [{ status: "asc" }, { plannedAt: "asc" }]
  });
  const selfBondagePositions = await prisma.position.findMany({
    where: { ...(await ownerScope(user)), selfBondageCapable: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    take: 6
  });
  return (
    <AppShell>
      <PageHeader title="Lass uns spielen" />
      <PageGuide title="Spielideen planen">
        Hier planst du gemeinsame Spielideen aus Bausteinen. Öffne einen Plan für Details oder erstelle eine neue Idee mit Datum, Status, Notiz, Spielsachen und Stellungen.
      </PageGuide>
      <div className="mb-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Panel className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-redbrand text-white">
            <Sparkles className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-semibold text-ink">Spieltermin planen</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-graphite">
            Lege einen konkreten Termin an, wähle Spielsachen und Stellungen aus und entscheide, ob es direkt geplant oder erst angefragt ist.
          </p>
          <Link href="/activities/new" className="focus-ring mt-5 inline-flex min-h-14 items-center justify-center gap-3 rounded-md bg-redbrand px-7 py-3 text-base font-semibold text-white shadow-soft hover:bg-redbrandHover">
            <Plus className="h-5 w-5" />
            Neuen Spieltermin anlegen
          </Link>
        </Panel>
        <Panel className="bg-paper text-center">
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
            <p className="mt-4 rounded-md bg-surface p-3 text-sm text-graphite">Markiere bei Stellungen das Feld „Self-Bondage-fähig“, damit sie hier als Vorbereitung auftauchen.</p>
          )}
          <Link href="/activities/new?template=self-bondage" className="focus-ring mt-5 inline-flex min-h-14 items-center justify-center gap-3 rounded-md border border-sky-600 bg-sky-600 px-7 py-3 text-base font-semibold text-white shadow-soft hover:bg-sky-700">
            <ShieldCheck className="h-5 w-5" />
            Self-Bondage-Auftrag erteilen
          </Link>
        </Panel>
      </div>
      {activities.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {activities.map((activity) => {
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
                <p className="mt-4 text-xs text-graphite">{activity.tools.length} Spielzeuge · {activity.positions.length} Stellungen</p>
              </SoftPanel>
            </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState title="Noch nichts geplant" />
      )}
    </AppShell>
  );
}
