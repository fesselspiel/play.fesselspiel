import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, EmptyState, PageGuide, PageHeader, SoftPanel } from "@/components/ui";
import { activityStatusLabel, activityStatusTone } from "@/lib/activity-status";
import { ownerScope } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/dates";

const statusLabel = activityStatusLabel;

export default async function ActivitiesPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const activities = await prisma.activityPlan.findMany({
    where: await ownerScope(user),
    include: { tools: true, positions: true },
    orderBy: [{ status: "asc" }, { plannedAt: "asc" }]
  });
  return (
    <AppShell>
      <PageHeader
        title="Lass uns spielen"
        action={<Link href="/activities/new" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Spielidee</Link>}
      />
      <PageGuide title="Spielideen planen">
        Hier planst du gemeinsame Spielideen aus Bausteinen. Oeffne einen Plan fuer Details oder erstelle eine neue Idee mit Datum, Status, Notiz, Spielsachen und Stellungen.
      </PageGuide>
      {activities.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {activities.map((activity) => (
            <Link key={activity.id} href={`/activities/${activity.slug}`}>
              <SoftPanel className="h-full transition hover:bg-[#eeeeee]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{activity.title}</h2>
                    <p className="mt-1 text-sm text-graphite">{activity.category || "Aktivitaet"} · {formatDateTime(activity.plannedAt)}</p>
                  </div>
                  <Badge tone={activityStatusTone(activity.status)}>{statusLabel[activity.status]}</Badge>
                </div>
                <p className="mt-4 text-sm text-graphite">{activity.note || "Keine Notiz."}</p>
                <p className="mt-4 text-xs text-graphite">{activity.tools.length} Spielzeuge · {activity.positions.length} Stellungen</p>
              </SoftPanel>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState title="Noch nichts geplant" />
      )}
    </AppShell>
  );
}
