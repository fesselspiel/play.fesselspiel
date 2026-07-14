import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pencil, Square } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, PageGuide, PageHeader, Panel, SoftPanel } from "@/components/ui";
import { ownerScope } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { formatDateTime, formatMinutes } from "@/lib/dates";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";
import { stopKgSession } from "@/lib/session-actions";

export default async function KgSessionDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  await requireFeature("tracker.kg");
  const user = await currentUser();
  if (!user) redirect("/login");
  const session = await prisma.kgSession.findFirst({ where: { id: params.id, ...(await ownerScope(user)) } });
  if (!session) notFound();

  return (
    <AppShell>
      <PageHeader
        title="KG Time Tracker"
        subtitle={formatDateTime(session.startTime)}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={`/sessions/kg/${session.id}/edit`} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
              <Pencil className="h-4 w-4" />
              Bearbeiten
            </Link>
            <Link href="/sessions?tracker=kg" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
              Zur Historie
            </Link>
          </div>
        }
      />
      <PageGuide title="KG-Eintrag im Detail">
        Diese Detailseite zeigt Start, Ende, Dauer und Sessionbeschreibung eines KG-Tracker-Eintrags.
      </PageGuide>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <SoftPanel>
            <div className="text-sm text-graphite">Start</div>
            <div className="mt-2 font-semibold text-ink">{formatDateTime(session.startTime)}</div>
          </SoftPanel>
          <SoftPanel>
            <div className="text-sm text-graphite">Ende</div>
            <div className="mt-2 font-semibold text-ink">{formatDateTime(session.endTime)}</div>
          </SoftPanel>
          <SoftPanel>
            <div className="text-sm text-graphite">Dauer</div>
            <div className="mt-2 font-semibold text-ink">{formatMinutes(session.durationMinutes)}</div>
          </SoftPanel>
        </div>
        <Panel>
          <h2 className="mb-3 text-lg font-semibold">Sessionbeschreibung</h2>
          <p className="whitespace-pre-wrap text-sm leading-6 text-graphite">{session.notes || "Keine Beschreibung hinterlegt."}</p>
        </Panel>
        {!session.endTime && session.ownerId === user.id ? (
          <Panel>
            <h2 className="mb-3 text-lg font-semibold">Laufender Eintrag</h2>
            <p className="mb-4 text-sm text-graphite">Dieser KG-Tracker hat noch keine Endzeit. Mit dem Button wird die Endzeit auf jetzt gesetzt.</p>
            <form action={stopKgSession}>
              <input type="hidden" name="id" value={session.id} />
              <Button><Square className="h-4 w-4" /> KG-Tracker beenden</Button>
            </form>
          </Panel>
        ) : null}
      </div>
    </AppShell>
  );
}
