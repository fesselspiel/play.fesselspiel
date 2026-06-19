import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pencil } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageGuide, PageHeader, Panel, SoftPanel } from "@/components/ui";
import { ownerScope } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { formatDateTime, formatMinutes } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export default async function KgSessionDetailPage({ params }: { params: { id: string } }) {
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
          <Link href="/sessions?tracker=kg" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
            <Pencil className="h-4 w-4" />
            Zur Historie
          </Link>
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
      </div>
    </AppShell>
  );
}
