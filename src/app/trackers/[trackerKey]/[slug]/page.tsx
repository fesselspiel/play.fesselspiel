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
import { formatDateTime, formatDateTimeLocal, formatMinutes, minutesBetween, parseDateTimeLocal } from "@/lib/dates";
import { requireFeature } from "@/lib/features";
import { moodAfter, moodBefore } from "@/lib/moods";
import { prisma } from "@/lib/prisma";
import { stopTrackerEntry } from "@/lib/tracker-core";

type TrackerField = {
  key: string;
  label: string;
  type: string;
  options?: Array<string | { value?: unknown; label?: unknown }>;
};

function trackerFields(fields: unknown, trackerKey?: string): TrackerField[] {
  const parsed = Array.isArray(fields)
    ? fields
        .filter((field) => field && typeof field === "object" && "key" in field)
        .map((field) => {
          const data = field as { key?: unknown; label?: unknown; name?: unknown; type?: unknown; options?: unknown };
          return {
            key: String(data.key || ""),
            label: String(data.label || data.name || data.key || ""),
            type: String(data.type || "text"),
            options: Array.isArray(data.options) ? data.options as TrackerField["options"] : undefined
          };
        })
        .filter((field) => field.key)
    : [];
  const existingKeys = new Set(parsed.map((field) => field.key));
  if (trackerKey === "segufix") {
    if (!existingKeys.has("moodBefore")) parsed.push({ key: "moodBefore", label: "Stimmung vorher", type: "select", options: Object.entries(moodBefore).map(([value, label]) => ({ value, label })) });
    if (!existingKeys.has("moodAfter")) parsed.push({ key: "moodAfter", label: "Stimmung nachher", type: "select", options: Object.entries(moodAfter).map(([value, label]) => ({ value, label })) });
  }
  return parsed;
}

function fieldOptions(field: TrackerField) {
  if (field.options?.length) {
    return field.options.map((option) => {
      if (typeof option === "string") return { value: option, label: option };
      return { value: String(option.value || option.label || ""), label: String(option.label || option.value || "") };
    }).filter((option) => option.value);
  }
  if (field.key === "moodBefore") return Object.entries(moodBefore).map(([value, label]) => ({ value, label }));
  if (field.key === "moodAfter") return Object.entries(moodAfter).map(([value, label]) => ({ value, label }));
  return [];
}

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
  const startTime = parseDateTimeLocal(startRaw) || entry.startTime;
  const endTime = endRaw ? parseDateTimeLocal(endRaw) : null;
  const currentValues = entry.fieldValues && typeof entry.fieldValues === "object" ? entry.fieldValues as Record<string, unknown> : {};
  const fieldValues: Record<string, unknown> = { ...currentValues };
  for (const field of trackerFields(entry.trackerType.fields, entry.trackerType.key)) {
    const nextValue = String(formData.get(`field:${field.key}`) || "").trim();
    if (nextValue) fieldValues[field.key] = nextValue;
    else delete fieldValues[field.key];
  }
  const updated = await prisma.trackerEntry.update({
    where: { id: entry.id },
    data: {
      startTime,
      endTime,
      durationMinutes: minutesBetween(startTime, endTime),
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
                    <dt className="text-graphite">{readableFieldLabel(key, entry.trackerType.fields)}</dt>
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
          {entry.ownerId === user.id ? (
            <div className="mt-6 rounded-md border border-line bg-paper p-4">
              <h2 className="mb-3 font-semibold">Eintrag bearbeiten</h2>
              <form action={updateEntry} className="grid gap-3">
                <input type="hidden" name="id" value={entry.id} />
                <Field label="Start"><input className={inputClass} name="startTime" type="datetime-local" defaultValue={formatDateTimeLocal(entry.startTime)} /></Field>
                <Field label="Ende"><input className={inputClass} name="endTime" type="datetime-local" defaultValue={formatDateTimeLocal(entry.endTime)} /></Field>
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
                      ) : (
                        <input className={inputClass} name={`field:${field.key}`} defaultValue={String(fieldValues[field.key] || "")} />
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
