import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { ChevronLeft, ChevronRight, Play, Save, Square } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TrackerLinkPicker } from "@/components/tracker-link-picker";
import { Button, Field, inputClass, PageGuide, PageHeader, Panel, SoftPanel } from "@/components/ui";
import { ownerScope } from "@/lib/access";
import { logAction, userDisplayName } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { formatDate, formatDateInput, formatDateTime, formatDateTimeLocal, formatMinutes, minutesBetween, parseDateInput, parseDateTimeLocal } from "@/lib/dates";
import { featureEnabled, hasFeature, requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";
import { currentTenant } from "@/lib/tenancy";
import { fieldOptions, fieldValuesFromForm, trackerFields } from "@/lib/tracker-fields";
import { quotaSummaryText, trackerQuotaStatusForUser } from "@/lib/tracker-quotas";
import { findTrackerTypeForUser, startTrackerEntry, stopAllRunningTrackerEntriesForUser, stopTrackerEntry, uniqueTrackerSlug } from "@/lib/tracker-core";
import { trackerLinkConnectData, trackerLinkOptionData, trackerLinkOptions } from "@/lib/tracker-links";

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
  const allDay = formData.get("allDay") === "on";
  const dateRaw = String(formData.get("date") || "");
  const startTime = allDay ? parseDateInput(dateRaw) || parseDateTimeLocal(startRaw) || new Date() : parseDateTimeLocal(startRaw) || parseDateInput(dateRaw) || new Date();
  const endTime = allDay ? null : endRaw ? parseDateTimeLocal(endRaw) : null;
  const fieldValues = fieldValuesFromForm(formData, trackerFields(trackerType.fields, trackerType.key));
  const scope = await ownerScope(user);
  const linkFeatures = {
    toys: await hasFeature("toys"),
    positions: await hasFeature("positions"),
    bondageSystem: await hasFeature("shopifyBondageSystem")
  };
  const links = await trackerLinkConnectData(user, scope, formData, linkFeatures);
  const entry = await prisma.trackerEntry.create({
    data: {
      tenantId: user.tenantId || trackerType.tenantId,
      ownerId: user.id,
      trackerTypeId: trackerType.id,
      slug: await uniqueTrackerSlug(trackerType.id, trackerType.key, startTime),
      title: trackerType.title,
      startTime,
      endTime,
      allDay,
      durationMinutes: allDay ? null : minutesBetween(startTime, endTime),
      notes: String(formData.get("notes") || "").trim(),
      fieldValues: fieldValues as Prisma.InputJsonObject,
      toys: { connect: links.toys },
      positions: { connect: links.positions },
      bondageSystemItems: { connect: links.bondageItems }
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

async function startEntry(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const key = String(formData.get("trackerKey") || "");
  const returnTo = String(formData.get("returnTo") || "");
  await requireFeature(`tracker.${key}`);
  const notes = String(formData.get("notes") || "").trim() || "Per Dashboard gestartet";
  const entry = await startTrackerEntry({ key, user, notes });
  if (!entry) redirect("/sessions");
  await logAction({
    actorId: user.id,
    action: `tracker_${key}_started`,
    entityType: "trackerEntry",
    entityId: entry.id,
    title: `${entry.title || key} gestartet`,
    href: `/trackers/${key}/${entry.slug || entry.id}`
  });
  redirect(returnTo || `/trackers/${key}/${entry.slug || entry.id}`);
}

async function stopEntry(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const key = String(formData.get("trackerKey") || "");
  const returnTo = String(formData.get("returnTo") || "");
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
  redirect(returnTo || `/trackers/${key}/${entry.slug || entry.id}`);
}

async function stopAllSessionTrackers(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const returnTo = String(formData.get("returnTo") || "/sessions");
  await requireFeature("trackers");
  const { openEntries, stopped } = await stopAllRunningTrackerEntriesForUser({ user });
  if (!stopped.length) redirect(returnTo);
  for (const stoppedEntry of stopped) {
    const source = openEntries.find((entry) => entry.id === stoppedEntry.id);
    const key = source?.trackerType.key;
    if (!key) continue;
    await logAction({
      actorId: user.id,
      action: `tracker_${key}_stopped`,
      entityType: "trackerEntry",
      entityId: stoppedEntry.id,
      title: `${stoppedEntry.title || key} beendet`,
      href: `/trackers/${key}/${stoppedEntry.slug || stoppedEntry.id}`
    });
  }

  redirect(returnTo);
}

const months = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export default async function SessionsPage(
  props: { searchParams: Promise<{ year?: string; tracker?: string; date?: string }> }
) {
  const searchParams = await props.searchParams;
  await requireFeature("trackers");
  const user = await currentUser();
  if (!user) redirect("/login");
  const tenant = await currentTenant();
  const requestedYear = Number(searchParams.year || "");
  const year = Number.isFinite(requestedYear) && requestedYear >= 2000 ? requestedYear : new Date().getFullYear();
  const now = new Date();
  const yearStart = parseDateInput(`${year}-01-01`) || new Date(year, 0, 1);
  const yearEnd = parseDateInput(`${year + 1}-01-01`) || new Date(year + 1, 0, 1);
  const scope = await ownerScope(user);
  const trackers = await prisma.trackerType.findMany({
    where: {
      enabled: true,
      ...(user.tenantId ? { OR: [{ tenantId: user.tenantId }, { tenantId: null }] } : { tenantId: null })
    },
    include: {
      entries: {
        where: { ...scope, startTime: { gte: yearStart, lt: yearEnd } },
        include: { toys: true, positions: true, bondageSystemItems: { include: { product: true } } },
        orderBy: { startTime: "desc" }
      }
    },
    orderBy: { title: "asc" }
  });
  const visibleTrackers = trackers.filter((tracker) => featureEnabled(tenant.features, `tracker.${tracker.key}`));
  const runningEntries = await prisma.trackerEntry.findMany({
    where: {
      ...scope,
      trackerType: { id: { in: visibleTrackers.map((tracker) => tracker.id) } },
      endTime: null,
      allDay: false
    },
    include: {
      trackerType: { select: { key: true, title: true } },
      owner: { select: { id: true, name: true, username: true, profile: { select: { displayName: true } } } }
    },
    orderBy: { startTime: "desc" }
  });
  const runningEntryByTracker = new Map(runningEntries.map((entry) => [entry.trackerType.key, entry]));
  const userRunningEntries = runningEntries.filter((entry) => entry.ownerId === user.id);
  const runningTrackerCount = new Map(userRunningEntries.map((entry) => [entry.trackerType.key, entry])).size;
  const quotaStatus = await trackerQuotaStatusForUser(user);
  const quotaByKey = new Map(quotaStatus.map((entry) => [entry.tracker.key, entry]));

  if (!visibleTrackers.length) redirect("/feature-disabled?feature=trackers");
  const activeTracker = visibleTrackers.find((tracker) => tracker.key === searchParams.tracker) || visibleTrackers[0];
  const totalMinutes = activeTracker.entries.reduce((sum, entry) => sum + (entry.durationMinutes || 0), 0);
  const open = runningEntryByTracker.get(activeTracker.key) || activeTracker.entries.find((entry) => !entry.endTime && !entry.allDay);
  const quota = quotaByKey.get(activeTracker.key);
  const statusLabel = open ? "läuft" : quota?.hasQuota ? quota.complete ? "erfüllt" : "offen" : "kein Ziel";
  const activeTrackerFields = trackerFields(activeTracker.fields, activeTracker.key);
  const selectedDate = parseDateInput(searchParams.date);
  const selectedDateValue = selectedDate ? formatDateInput(selectedDate) : "";
  const selectedDateTimeValue = selectedDate ? `${selectedDateValue}T00:00` : "";
  const linkFeatures = {
    toys: await hasFeature("toys"),
    positions: await hasFeature("positions"),
    bondageSystem: await hasFeature("shopifyBondageSystem")
  };
  const linkOptions = trackerLinkOptionData(await trackerLinkOptions(user, scope, linkFeatures));
  const byDay = new Map<string, typeof activeTracker.entries>();
  const quickPanelCardsReturnTo = `/sessions?tracker=${activeTracker.key}&year=${year}`;
  const activeTrackerRunningMinutes = open && !open.allDay ? Math.max(0, Math.floor((now.getTime() - open.startTime.getTime()) / 60000)) : 0;
  for (const entry of activeTracker.entries) {
    const key = formatDateInput(entry.startTime);
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
        <Panel className="border-redbrand/30">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-ink">Tracker-Kontrolle</h2>
              <p className="mt-1 text-sm text-graphite">Starten, stoppen und zwischen Trackern direkt wechseln.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {runningEntries.length ? (
                <span className="inline-flex min-h-8 items-center rounded-full bg-redbrand/10 px-3 py-1 text-xs font-semibold text-redbrand">
                  {runningEntries.length} aktiv
                </span>
              ) : null}
              {runningTrackerCount ? (
                <form action={stopAllSessionTrackers} className="shrink-0">
                  <input type="hidden" name="returnTo" value={quickPanelCardsReturnTo} />
                  <Button variant="danger" type="submit"><Square className="h-4 w-4" /> Alle stoppen</Button>
                </form>
              ) : null}
            </div>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {visibleTrackers.map((tracker) => {
              const openEntry = runningEntryByTracker.get(tracker.key);
              const trackerQuota = quotaByKey.get(tracker.key);
              const isRunning = Boolean(openEntry);
              const runningMinutes = openEntry ? Math.max(0, Math.floor((now.getTime() - new Date(openEntry.startTime).getTime()) / 60000)) : 0;
              const runningOwnerLabel = openEntry ? userDisplayName(openEntry.owner) : "";
              const trackerCardState = isRunning ? (openEntry?.ownerId === user.id ? "läuft (du)" : `läuft von ${runningOwnerLabel}`) : trackerQuota?.hasQuota ? trackerQuota.complete ? "erfüllt" : "offen" : "kein Ziel";
              const statusColor = isRunning ? "bg-redbrand/10 text-redbrand" : "bg-emerald-500/10 text-emerald-700";
              return (
                <div key={tracker.id} className="rounded-md border border-line bg-paper p-3">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-ink">{tracker.title}</h3>
                      <p className="mt-1 text-xs text-graphite">
                        {openEntry ? `läuft seit ${formatDateTime(openEntry.startTime)} · ${formatMinutes(runningMinutes)}` : trackerQuota ? quotaSummaryText(trackerQuota) : "Kein Kontingent"}
                      </p>
                    </div>
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusColor}`}>{trackerCardState}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isRunning ? (
                      openEntry?.ownerId === user.id ? (
                        <form action={stopEntry} className="shrink-0">
                          <input type="hidden" name="trackerKey" value={tracker.key} />
                          <input type="hidden" name="returnTo" value={quickPanelCardsReturnTo} />
                          <Button variant="danger" type="submit"><Square className="h-4 w-4" /> Stop</Button>
                        </form>
                      ) : (
                        <span className="inline-flex min-h-9 items-center rounded-md border border-line bg-surface px-3 py-2 text-sm text-graphite">Läuft von {runningOwnerLabel}</span>
                      )
                    ) : (
                      <form action={startEntry} className="shrink-0">
                        <input type="hidden" name="trackerKey" value={tracker.key} />
                        <input type="hidden" name="returnTo" value={quickPanelCardsReturnTo} />
                        <Button type="submit"><Play className="h-4 w-4" /> Start</Button>
                      </form>
                    )}
                    <Link href={`/sessions?tracker=${tracker.key}&year=${year}`} className="inline-flex min-h-9 items-center rounded-md border border-line bg-surface px-3 py-2 text-sm font-semibold hover:bg-paper">
                      Öffnen
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
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
                <SoftPanel><div className="text-sm text-graphite">Kontingent</div><div className="mt-2 text-2xl font-semibold">{statusLabel}</div></SoftPanel>
              </div>
                {open ? (
                  <div className="mb-5 rounded-md border border-line bg-paper p-3 text-sm">
                    <Link href={`/trackers/${activeTracker.key}/${open.slug || open.id}`} className="font-semibold text-ink hover:text-redbrand">Läuft seit {formatDateTime(open.startTime)}</Link>
                    {open.ownerId === user.id ? <p className="mt-1 text-graphite">Aktive Laufzeit: {formatMinutes(activeTrackerRunningMinutes)}</p> : null}
                    {open.ownerId === user.id ? (
                      <form action={stopEntry} className="mt-3">
                        <input type="hidden" name="trackerKey" value={activeTracker.key} />
                        <input type="hidden" name="returnTo" value={quickPanelCardsReturnTo} />
                        <Button><Square className="h-4 w-4" /> Tracker beenden</Button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              <form id="new-entry" action={createTrackerEntry} className="mb-5 space-y-3">
                <input type="hidden" name="trackerKey" value={activeTracker.key} />
                {selectedDateValue ? (
                  <div className="rounded-md border border-line bg-paper p-3 text-sm text-graphite">
                    Neuer Eintrag für <strong className="text-ink">{formatDate(selectedDate)}</strong>. Wähle bei Bedarf „ganzer Tag“, wenn keine Uhrzeit gelten soll.
                  </div>
                ) : null}
                <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1.5fr_auto] lg:items-end">
                  <Field label="Datum"><input className={inputClass} name="date" type="date" defaultValue={selectedDateValue} /></Field>
                  <Field label="Start"><input className={inputClass} name="startTime" type="datetime-local" defaultValue={selectedDateTimeValue} /></Field>
                  <Field label="Ende"><input className={inputClass} name="endTime" type="datetime-local" /></Field>
                  <Field label="Beschreibung"><input className={inputClass} name="notes" placeholder="Optionaler Kommentar" /></Field>
                    <Button><Save className="h-4 w-4" /> Eintrag speichern</Button>
                  </div>
                <label className="flex items-center gap-2 rounded-md border border-line bg-paper px-3 py-2 text-sm font-medium text-graphite">
                  <input name="allDay" type="checkbox" className="h-4 w-4 accent-redbrand" />
                  Ganzer Tag, ohne Start- und Endzeit
                </label>
                {activeTrackerFields.length ? (
                  <div className="grid gap-3 rounded-lg border border-line bg-paper p-3 sm:grid-cols-2 lg:grid-cols-3">
                    {activeTrackerFields.map((field) => {
                      const options = fieldOptions(field);
                      return (
                        <Field key={field.key} label={field.label}>
                          {options.length ? (
                            <select className={inputClass} name={`field:${field.key}`} defaultValue="">
                              <option value="">😐 neutral</option>
                              {options.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          ) : field.type === "textarea" ? (
                            <textarea className={inputClass} name={`field:${field.key}`} rows={3} />
                          ) : (
                            <input className={inputClass} name={`field:${field.key}`} type={field.type === "number" ? "number" : "text"} />
                          )}
                        </Field>
                      );
                    })}
                  </div>
                ) : null}
                <TrackerLinkPicker toys={linkOptions.toys} bondageItems={linkOptions.bondageItems} positions={linkOptions.positions} />
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
                          const date = new Date(year, monthIndex, day + 1);
                          const validDay = date.getMonth() === monthIndex;
                          const dateValue = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day + 1).padStart(2, "0")}`;
                          const entries = byDay.get(dateValue) || [];
                          const firstEntry = entries[0];
                          const cellStyle = { backgroundColor: entries.length ? activeTracker.color : "transparent", opacity: validDay ? entries.length ? 0.85 : 1 : 0.25 };
                          return firstEntry ? (
                            <Link
                              key={`${month}-${day}`}
                              href={`/trackers/${activeTracker.key}/${firstEntry.slug || firstEntry.id}`}
                              className="focus-ring h-5 rounded-sm border border-line hover:ring-2 hover:ring-redbrand"
                              title={`${entries.length} Einträge, öffnen`}
                              style={cellStyle}
                            />
                          ) : validDay ? (
                            <Link
                              key={`${month}-${day}`}
                              href={`/sessions?tracker=${activeTracker.key}&year=${year}&date=${dateValue}#new-entry`}
                              className="focus-ring h-5 rounded-sm border border-line hover:bg-paper hover:ring-2 hover:ring-redbrand"
                              title={`Neuen Eintrag für ${dateValue} anlegen`}
                              style={cellStyle}
                            />
                          ) : (
                            <div
                              key={`${month}-${day}`}
                              className="h-5 rounded-sm border border-line"
                              title=""
                              style={cellStyle}
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
                    <strong>{entry.allDay ? formatDate(entry.startTime) : formatDateTime(entry.startTime)}</strong>
                    <span className="ml-2 text-graphite">{entry.allDay ? "ganzer Tag" : entry.endTime ? formatMinutes(entry.durationMinutes) : "läuft"}</span>
                    <span className="mt-1 block text-xs text-graphite">
                      {[
                        entry.toys.length ? `${entry.toys.length} Spielsachen` : "",
                        entry.bondageSystemItems.length ? `${entry.bondageSystemItems.length} Produkte` : "",
                        entry.positions.length ? `${entry.positions.length} Szenen` : ""
                      ].filter(Boolean).join(" · ")}
                    </span>
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
