import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Save, Square } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Field, inputClass, PageGuide, PageHeader, Panel, SoftPanel } from "@/components/ui";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { formatDateTime, formatMinutes, minutesBetween } from "@/lib/dates";
import { featureEnabled, requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";
import { currentTenant } from "@/lib/tenancy";
import { quotaSummaryText, trackerQuotaStatusForUser } from "@/lib/tracker-quotas";
import { findTrackerTypeForUser, stopTrackerEntry, uniqueTrackerSlug } from "@/lib/tracker-core";

async function createTrackerEntry(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const key = String(formData.get("trackerKey") || "");
  await requireFeature(`tracker.${key}`);
  const trackerType = await findTrackerTypeForUser(key, user);
  if (!trackerType) redirect("/sessions?error=tracker");
  const startRaw = String(formData.get("startTime") || "");
  const endRaw = String(formData.get("endTime") || "");
  const startTime = startRaw ? new Date(startRaw) : new Date();
  const endTime = endRaw ? new Date(endRaw) : null;
  const entry = await prisma.trackerEntry.create({
    data: {
      tenantId: user.tenantId || trackerType.tenantId,
      ownerId: user.id,
      trackerTypeId: trackerType.id,
      slug: await uniqueTrackerSlug(trackerType.id, trackerType.key, startTime),
      title: trackerType.title,
      startTime,
      endTime,
      durationMinutes: minutesBetween(startTime, endTime),
      notes: String(formData.get("notes") || "").trim(),
      fieldValues: {}
    }
  });
  await logAction({
    actorId: user.id,
    action: `tracker_${trackerType.key}_created`,
    entityType: "trackerEntry",
    entityId: entry.id,
    title: `${trackerType.title} angelegt`,
    href: `/trackers/${trackerType.key}/${entry.slug || entry.id}`
  });
  redirect(`/trackers/${trackerType.key}/${entry.slug || entry.id}`);
}

async function stopEntry(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const key = String(formData.get("trackerKey") || "");
  await requireFeature(`tracker.${key}`);
  const entry = await stopTrackerEntry({ key, user });
  if (!entry) redirect("/sessions");
  await logAction({
    actorId: user.id,
    action: `tracker_${key}_stopped`,
    entityType: "trackerEntry",
    entityId: entry.id,
    title: `${entry.title || key} beendet`,
    href: `/trackers/${key}/${entry.slug || entry.id}`
  });
  redirect(`/trackers/${key}/${entry.slug || entry.id}`);
}

const months = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export default async function SessionsPage({ searchParams }: { searchParams: { year?: string; tracker?: string } }) {
  await requireFeature("trackers");
  const user = await currentUser();
  if (!user) redirect("/login");
  const tenant = await currentTenant();
  const year = Number(searchParams.year || new Date().getFullYear());
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);
  const scope = await ownerScope(user);
  const trackers = await prisma.trackerType.findMany({
    where: {
      enabled: true,
      ...(user.tenantId ? { OR: [{ tenantId: user.tenantId }, { tenantId: null }] } : { tenantId: null })
    },
    include: {
      entries: {
        where: { ...scope, startTime: { gte: yearStart, lt: yearEnd } },
        orderBy: { startTime: "desc" }
      }
    },
    orderBy: { title: "asc" }
  });
  const visibleTrackers = trackers.filter((tracker) => featureEnabled(tenant.features, `tracker.${tracker.key}`));
  const quotaStatus = await trackerQuotaStatusForUser(user);
  const quotaByKey = new Map(quotaStatus.map((entry) => [entry.tracker.key, entry]));

  if (!visibleTrackers.length) redirect("/feature-disabled?feature=trackers");
  const activeTracker = visibleTrackers.find((tracker) => tracker.key === searchParams.tracker) || visibleTrackers[0];
  const totalMinutes = activeTracker.entries.reduce((sum, entry) => sum + (entry.durationMinutes || 0), 0);
  const open = activeTracker.entries.find((entry) => !entry.endTime);
  const quota = quotaByKey.get(activeTracker.key);
  const byDay = new Map<string, typeof activeTracker.entries>();
  for (const entry of activeTracker.entries) {
    const key = `${entry.startTime.getMonth()}-${entry.startTime.getDate()}`;
    byDay.set(key, [...(byDay.get(key) || []), entry]);
  }

  return (
    <AppShell>
      <PageHeader title="Tracker" />
      <PageGuide title="Einheitliche Tracker-Zentrale">
        Segufix, KG und weitere Tracker sind hier dieselbe Datenstruktur. Jeder Tracker kann Einträge, laufende Zeiten, Kontingente und eine eigene Farbe haben.
      </PageGuide>
      <div className="space-y-4">
        <div className="flex gap-2 overflow-x-auto rounded-lg border border-line bg-paper p-2">
          {visibleTrackers.map((tracker) => {
            const active = tracker.id === activeTracker.id;
            return (
              <Link
                key={tracker.id}
                href={`/sessions?tracker=${tracker.key}&year=${year}`}
                className={`focus-ring inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition ${active ? "bg-redbrand text-white" : "bg-surface text-ink hover:bg-canvas"}`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: active ? "#fff" : tracker.color }} />
                {tracker.title}
              </Link>
            );
          })}
        </div>
        <Panel key={activeTracker.id}>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-ink">{activeTracker.title}</h2>
                  <p className="mt-1 text-sm text-graphite">{activeTracker.description || `Tracker ${activeTracker.key}`}</p>
                  {quota?.hasQuota ? <p className="mt-2 text-xs font-semibold text-graphite">{quotaSummaryText(quota)}</p> : null}
                </div>
                <span className="rounded-md border border-line bg-paper px-3 py-1 text-xs font-semibold text-graphite">tracker.{activeTracker.key}</span>
              </div>
              <div className="mb-5 grid gap-3 sm:grid-cols-3">
                <SoftPanel><div className="text-sm text-graphite">Einträge</div><div className="mt-2 text-2xl font-semibold">{activeTracker.entries.length}</div></SoftPanel>
                <SoftPanel><div className="text-sm text-graphite">Gesamtzeit</div><div className="mt-2 text-2xl font-semibold">{formatMinutes(totalMinutes)}</div></SoftPanel>
                <SoftPanel><div className="text-sm text-graphite">Status</div><div className="mt-2 text-2xl font-semibold">{open ? "läuft" : quota?.complete === false ? "Todo" : "ok"}</div></SoftPanel>
              </div>
              {open ? (
                <div className="mb-5 rounded-md border border-line bg-paper p-3 text-sm">
                  <Link href={`/trackers/${activeTracker.key}/${open.slug || open.id}`} className="font-semibold text-ink hover:text-redbrand">Läuft seit {formatDateTime(open.startTime)}</Link>
                  {open.ownerId === user.id ? (
                    <form action={stopEntry} className="mt-3">
                      <input type="hidden" name="trackerKey" value={activeTracker.key} />
                      <Button><Square className="h-4 w-4" /> Tracker beenden</Button>
                    </form>
                  ) : null}
                </div>
              ) : null}
              <form action={createTrackerEntry} className="mb-5 grid gap-3 lg:grid-cols-[1fr_1fr_1.5fr_auto] lg:items-end">
                <input type="hidden" name="trackerKey" value={activeTracker.key} />
                <Field label="Start"><input className={inputClass} name="startTime" type="datetime-local" /></Field>
                <Field label="Ende"><input className={inputClass} name="endTime" type="datetime-local" /></Field>
                <Field label="Beschreibung"><input className={inputClass} name="notes" placeholder="Optionaler Kommentar" /></Field>
                <Button><Save className="h-4 w-4" /> Eintrag speichern</Button>
              </form>
              <div className="mb-5 overflow-x-auto">
                <div className="min-w-[760px]">
                  <div className="grid grid-cols-[110px_repeat(31,minmax(16px,1fr))] gap-1 text-xs">
                    <div />
                    {Array.from({ length: 31 }, (_, day) => <div key={day} className="text-center text-graphite">{day + 1}</div>)}
                    {months.map((month, monthIndex) => (
                      <div key={month} className="contents">
                        <div className="pr-2 text-right font-medium text-graphite">{month}</div>
                        {Array.from({ length: 31 }, (_, day) => {
                          const entries = byDay.get(`${monthIndex}-${day + 1}`) || [];
                          return (
                            <div
                              key={`${month}-${day}`}
                              className="h-5 rounded-sm border border-line"
                              title={entries.length ? `${entries.length} Einträge` : ""}
                              style={{ backgroundColor: entries.length ? activeTracker.color : "transparent", opacity: entries.length ? 0.85 : 1 }}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {activeTracker.entries.slice(0, 8).map((entry) => (
                  <Link key={entry.id} href={`/trackers/${activeTracker.key}/${entry.slug || entry.id}`} className="block rounded-md border border-line bg-paper p-3 text-sm hover:border-redbrand">
                    <strong>{formatDateTime(entry.startTime)}</strong>
                    <span className="ml-2 text-graphite">{entry.endTime ? formatMinutes(entry.durationMinutes) : "läuft"}</span>
                    {entry.notes ? <span className="ml-2 text-graphite">{entry.notes}</span> : null}
                  </Link>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4 text-sm">
                <span className="mr-auto text-xs font-semibold text-graphite">Jahresansicht {year}</span>
                <Link href={`/sessions?tracker=${activeTracker.key}&year=${year - 1}`} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-line bg-surface px-3 py-2 font-semibold hover:bg-paper">
                  <ChevronLeft className="h-4 w-4" /> {year - 1}
                </Link>
                <Link href={`/sessions?tracker=${activeTracker.key}&year=${year + 1}`} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-line bg-surface px-3 py-2 font-semibold hover:bg-paper">
                  {year + 1} <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
        </Panel>
      </div>
    </AppShell>
  );
}
