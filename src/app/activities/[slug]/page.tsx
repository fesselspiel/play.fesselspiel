import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pencil } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CopySubtitle } from "@/components/copy-subtitle";
import { Badge, PageGuide, PageHeader, Panel, SoftPanel } from "@/components/ui";
import { isAccessibleOwner } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/dates";

const statusLabel = { PLANNED: "geplant", DONE: "durchgefuehrt", DISCARDED: "verworfen" } as const;

export default async function ActivityDetailPage({ params }: { params: { slug: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const activity = await prisma.activityPlan.findUnique({ where: { slug: params.slug }, include: { tools: true, positions: true } });
  if (!activity || !(await isAccessibleOwner(user, activity.ownerId))) notFound();
  const path = `/activities/${activity.slug}`;
  const url = `${env.appUrl}${path}`;
  return (
    <AppShell>
      <PageHeader
        title={activity.title}
        subtitle={<CopySubtitle value={url} label={path} />}
        action={
          <Badge tone="red">{statusLabel[activity.status]}</Badge>
        }
      />
      <PageGuide>
        Diese Detailseite zeigt Termin, Notiz, Status und alle ausgewaehlten Bausteine eines Spielplans. Nutze Bearbeiten, um Status, Termin oder Verknuepfungen nachtraeglich zu aendern.
      </PageGuide>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Panel>
          <p className="text-sm text-graphite">{activity.category || "Spielidee"} · {formatDateTime(activity.plannedAt)}</p>
          <p className="mt-5 leading-7 text-graphite">{activity.note || "Keine Notiz hinterlegt."}</p>
        </Panel>
        <div className="space-y-6">
          <SoftPanel>
            <h2 className="mb-3 text-lg font-semibold">Spielsachen</h2>
            <div className="space-y-2">
              {activity.tools.map((toy) => <Link key={toy.id} href={`/toys/${toy.slug}`} className="block rounded-md bg-white px-3 py-2 text-sm hover:text-redbrand">{toy.title}</Link>)}
            </div>
          </SoftPanel>
          <SoftPanel>
            <h2 className="mb-3 text-lg font-semibold">Stellungen</h2>
            <div className="space-y-2">
              {activity.positions.map((position) => <Link key={position.id} href={`/positions/${position.slug}`} className="block rounded-md bg-white px-3 py-2 text-sm hover:text-redbrand">{position.name}</Link>)}
            </div>
          </SoftPanel>
        </div>
      </div>
      <Panel className="mt-6">
        <h2 className="mb-2 text-lg font-semibold">Aktionen</h2>
        <p className="mb-4 text-sm text-graphite">Bearbeite diesen Spielplan, wenn Termin, Status, Notiz oder Bausteine geaendert werden sollen.</p>
        <Link href={`/activities/${activity.slug}/edit`} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
          <Pencil className="h-4 w-4" />
          Bearbeiten
        </Link>
      </Panel>
    </AppShell>
  );
}
