import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { ArrowLeft, Save, Square, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { Button, Field, inputClass, PageHeader, Panel, SoftPanel } from "@/components/ui";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { formatDate, formatDateInput, formatDateTime, formatDateTimeLocal, formatMinutes, minutesBetween, parseDateInput, parseDateTimeLocal } from "@/lib/dates";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";
import { fieldOptions, fieldValuesFromForm, trackerFields } from "@/lib/tracker-fields";
import { stopTrackerEntry } from "@/lib/tracker-core";

function readableFieldLabel(key: string, fields: unknown) {
  if (Array.isArray(fields)) {
    const match = fields.find((field) => field && typeof field === "object" && "key" in field && String((field as { key?: unknown }).key) === key) as { label?: unknown; name?: unknown } | undefined;
    const label = String(match?.label || match?.name || "").trim();
    if (label) return label;
  }
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}


async function stopEntry(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const key = String(formData.get("trackerKey") || "");
  await requireFeature(`tracker.${key}`);
  const stopped = await stopTrackerEntry({ key, user });
  if (!stopped) notFound();
  redirect(`/trackers/${key}/${stopped.slug || stopped.id}`);
}

async function updateEntry(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") || "");
  const entry = await prisma.trackerEntry.findFirst({ where: { id, ...(await ownerScope(user)) }, include: { trackerType: true } });
  if (!entry) notFound();
  await requireFeature(`tracker.${entry.trackerType.key}`);
  const startRaw = String(formData.get("startTime") || "");
  const endRaw = String(formData.get("endTime") || "");
  const allDay = formData.get("allDay") === "on";
  const dateRaw = String(formData.get("date") || "");
  const startTime = allDay ? parseDateInput(dateRaw) || parseDateTimeLocal(startRaw) || entry.startTime : parseDateTimeLocal(startRaw) || parseDateInput(dateRaw) || entry.startTime;
  const endTime = allDay ? null : endRaw ? parseDateTimeLocal(endRaw) : null;
  const currentValues = entry.fieldValues && typeof entry.fieldValues === "object" ? entry.fieldValues as Record<string, unknown> : {};
  const fieldValues = fieldValuesFromForm(formData, trackerFields(entry.trackerType.fields, entry.trackerType.key), currentValues);
  const updated = await prisma.trackerEntry.update({
    where: { id: entry.id },
    data: {
      startTime,
      endTime,
      allDay,
      durationMinutes: allDay ? null : minutesBetween(startTime, endTime),
      notes: String(formData.get("notes") || "").trim(),
      fieldValues: fieldValues as Prisma.InputJsonObject
    }
  });
  await logAction({
    actorId: user.id,
    action: `tracker_${entry.trackerType.key}_updated`,
    entityType: "trackerEntry",
    entityId: entry.id,
    title: `${entry.trackerType.title} bearbeitet`,
    href: `/trackers/${entry.trackerType.key}/${updated.slug || updated.id}`
  });
  redirect(`/trackers/${entry.trackerType.key}/${updated.slug || updated.id}`);
}

async function deleteEntry(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") || "");
  const entry = await prisma.trackerEntry.findFirst({ where: { id, ...(await ownerScope(user)) }, include: { trackerType: true } });
  if (!entry) notFound();
  await requireFeature(`tracker.${entry.trackerType.key}`);
  await prisma.trackerEntry.delete({ where: { id: entry.id } });
  await logAction({
    actorId: user.id,
    action: `tracker_${entry.trackerType.key}_deleted`,
    entityType: "trackerEntry",
    entityId: entry.id,
    title: `${entry.trackerType.title} gelöscht`,
    href: `/sessions?tracker=${entry.trackerType.key}`
  });
  redirect(`/sessions?tracker=${entry.trackerType.key}&year=${entry.startTime.getFullYear()}`);
}

export default async function TrackerEntryPage({ params }: { params: { trackerKey: string; slug: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature(`tracker.${params.trackerKey}`);
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
  const editableFields = trackerFields(entry.trackerType.fields, entry.trackerType.key);
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
            <SoftPanel><div className="text-sm text-graphite">{entry.allDay ? "Datum" : "Start"}</div><div className="mt-2 font-semibold">{entry.allDay ? formatDate(entry.startTime) : formatDateTime(entry.startTime)}</div></SoftPanel>
            <SoftPanel><div className="text-sm text-graphite">Ende</div><div className="mt-2 font-semibold">{entry.allDay ? "ganzer Tag" : entry.endTime ? formatDateTime(entry.endTime) : "läuft"}</div></SoftPanel>
            <SoftPanel><div className="text-sm text-graphite">Dauer</div><div className="mt-2 font-semibold">{entry.allDay ? "ohne Uhrzeit" : formatMinutes(entry.durationMinutes)}</div></SoftPanel>
          </div>
          {entry.notes ? <div className="mt-5 whitespace-pre-wrap rounded-md border border-line bg-paper p-4 text-sm leading-6">{entry.notes}</div> : null}
          {Object.keys(fieldValues).length ? (
            <div className="mt-5 rounded-md border border-line bg-paper p-4">
              <h2 className="mb-3 font-semibold">Tracker-Felder</h2>
              <dl className="space-y-2 text-sm">
                {Object.entries(fieldValues).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-3">
                    <dt className="text-graphite">{readableFieldLabel(key, entry.trackerType.fields)}</dt>
                    <dd className="font-medium">{String(value || "😐 neutral")}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          {!entry.allDay && !entry.endTime && entry.ownerId === user.id ? (
            <form action={stopEntry} className="mt-5">
              <input type="hidden" name="trackerKey" value={entry.trackerType.key} />
              <Button><Square className="h-4 w-4" /> Tracker beenden</Button>
            </form>
          ) : null}
          {entry.ownerId === user.id ? (
            <div className="mt-6 rounded-md border border-line bg-paper p-4">
              <h2 className="mb-3 font-semibold">Eintrag bearbeiten</h2>
              <form action={updateEntry} className="grid gap-3">
                <input type="hidden" name="id" value={entry.id} />
                <Field label="Datum"><input className={inputClass} name="date" type="date" defaultValue={formatDateInput(entry.startTime)} /></Field>
                <Field label="Start"><input className={inputClass} name="startTime" type="datetime-local" defaultValue={entry.allDay ? "" : formatDateTimeLocal(entry.startTime)} /></Field>
                <Field label="Ende"><input className={inputClass} name="endTime" type="datetime-local" defaultValue={entry.allDay ? "" : formatDateTimeLocal(entry.endTime)} /></Field>
                <label className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-graphite">
                  <input name="allDay" type="checkbox" defaultChecked={entry.allDay} className="h-4 w-4 accent-redbrand" />
                  Ganzer Tag, ohne Start- und Endzeit
                </label>
                {editableFields.map((field) => {
                  const options = fieldOptions(field);
                  return (
                    <Field key={field.key} label={field.label}>
                      {options.length ? (
                        <select className={inputClass} name={`field:${field.key}`} defaultValue={String(fieldValues[field.key] || "")}>
                          <option value="">😐 neutral</option>
                          {options.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      ) : field.type === "textarea" ? (
                        <textarea className={inputClass} name={`field:${field.key}`} rows={3} defaultValue={String(fieldValues[field.key] || "")} />
                      ) : (
                        <input className={inputClass} name={`field:${field.key}`} type={field.type === "number" ? "number" : "text"} defaultValue={String(fieldValues[field.key] || "")} />
                      )}
                    </Field>
                  );
                })}
                <Field label="Beschreibung"><textarea className={inputClass} name="notes" rows={4} defaultValue={entry.notes || ""} /></Field>
                <SubmitButton pendingLabel="Eintrag wird gespeichert..."><Save className="h-4 w-4" /> Eintrag speichern</SubmitButton>
              </form>
              <form action={deleteEntry} className="mt-3">
                <input type="hidden" name="id" value={entry.id} />
                <SubmitButton pendingLabel="Eintrag wird gelöscht..." className="border border-redbrand bg-surface text-redbrand hover:bg-redbrand hover:text-white">
                  <Trash2 className="h-4 w-4" /> Eintrag löschen
                </SubmitButton>
              </form>
            </div>
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
