import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Square } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, PageHeader, Panel, SoftPanel } from "@/components/ui";
import { ownerScope } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { formatDateTime, formatMinutes } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { stopTrackerEntry } from "@/lib/tracker-core";

async function stopEntry(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const key = String(formData.get("trackerKey") || "");
  const stopped = await stopTrackerEntry({ key, user });
  if (!stopped) notFound();
  redirect(`/trackers/${key}/${stopped.slug || stopped.id}`);
}

export default async function TrackerEntryPage({ params }: { params: { trackerKey: string; slug: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const scope = await ownerScope(user);
  const entry = await prisma.trackerEntry.findFirst({
    where: {
      ...scope,
      trackerType: { key: params.trackerKey },
      OR: [{ slug: params.slug }, { id: params.slug }]
    },
    include: { trackerType: true, owner: { include: { profile: true } } }
  });
  if (!entry) notFound();
  const fieldValues = entry.fieldValues && typeof entry.fieldValues === "object" ? entry.fieldValues as Record<string, unknown> : {};
  return (
    <AppShell>
      <PageHeader title={entry.title || entry.trackerType.title} />
      <div className="mb-4">
        <Link href="/sessions" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
          <ArrowLeft className="h-4 w-4" /> Tracker-Zentrale
        </Link>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel>
          <div className="grid gap-4 sm:grid-cols-3">
            <SoftPanel><div className="text-sm text-graphite">Start</div><div className="mt-2 font-semibold">{formatDateTime(entry.startTime)}</div></SoftPanel>
            <SoftPanel><div className="text-sm text-graphite">Ende</div><div className="mt-2 font-semibold">{entry.endTime ? formatDateTime(entry.endTime) : "läuft"}</div></SoftPanel>
            <SoftPanel><div className="text-sm text-graphite">Dauer</div><div className="mt-2 font-semibold">{formatMinutes(entry.durationMinutes)}</div></SoftPanel>
          </div>
          {entry.notes ? <div className="mt-5 whitespace-pre-wrap rounded-md border border-line bg-paper p-4 text-sm leading-6">{entry.notes}</div> : null}
          {Object.keys(fieldValues).length ? (
            <div className="mt-5 rounded-md border border-line bg-paper p-4">
              <h2 className="mb-3 font-semibold">Tracker-Felder</h2>
              <dl className="space-y-2 text-sm">
                {Object.entries(fieldValues).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-3">
                    <dt className="text-graphite">{key}</dt>
                    <dd className="font-medium">{String(value || "😐 neutral")}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          {!entry.endTime && entry.ownerId === user.id ? (
            <form action={stopEntry} className="mt-5">
              <input type="hidden" name="trackerKey" value={entry.trackerType.key} />
              <Button><Square className="h-4 w-4" /> Tracker beenden</Button>
            </form>
          ) : null}
        </Panel>
        <Panel>
          <h2 className="mb-3 text-lg font-semibold">{entry.trackerType.title}</h2>
          <p className="text-sm leading-6 text-graphite">{entry.trackerType.description || "Allgemeiner Tracker-Eintrag."}</p>
          <div className="mt-4 text-sm text-graphite">Besitzer: {entry.owner.profile?.displayName || entry.owner.name || entry.owner.username || entry.owner.email}</div>
        </Panel>
      </div>
    </AppShell>
  );
}

