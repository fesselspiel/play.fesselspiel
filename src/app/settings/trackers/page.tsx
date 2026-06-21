import { redirect } from "next/navigation";
import { Plus, Save } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { Field, inputClass, PageGuide, PageHeader, Panel } from "@/components/ui";
import { logAction, userDisplayName } from "@/lib/audit";
import { currentSessionContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";

function normalizeTrackerKey(value: string) {
  return slugify(value).replace(/-/g, "_").slice(0, 40);
}

async function createTracker(formData: FormData) {
  "use server";
  const { actor, tenant } = await currentSessionContext();
  if (!actor || !tenant) redirect("/login");
  if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") redirect("/");
  const title = String(formData.get("title") || "").trim();
  const key = normalizeTrackerKey(String(formData.get("key") || title));
  if (!title || !key) redirect("/settings/trackers?error=missing");
  const existing = await prisma.trackerType.findUnique({ where: { tenantId_key: { tenantId: tenant.id, key } } });
  if (existing) redirect("/settings/trackers?error=exists");
  const tracker = await prisma.trackerType.create({
    data: {
      tenantId: tenant.id,
      key,
      title,
      description: String(formData.get("description") || "").trim(),
      color: String(formData.get("color") || "#E30613").trim() || "#E30613",
      enabled: formData.get("enabled") === "on",
      allowOpenSession: formData.get("allowOpenSession") === "on",
      autoCloseOpenSession: formData.get("autoCloseOpenSession") === "on",
      fields: []
    }
  });
  await prisma.tenantFeature.upsert({
    where: { tenantId_key: { tenantId: tenant.id, key: `tracker.${tracker.key}` } },
    update: { enabled: formData.get("featureEnabled") === "on" },
    create: { tenantId: tenant.id, key: `tracker.${tracker.key}`, enabled: formData.get("featureEnabled") === "on" }
  });
  await logAction({
    actorId: actor.id,
    action: "tracker_type_created",
    entityType: "trackerType",
    entityId: tracker.id,
    title: `${userDisplayName(actor)} hat den Tracker ${tracker.title} angelegt`,
    href: "/settings/trackers"
  });
  redirect("/settings/trackers?saved=created");
}

async function saveTracker(formData: FormData) {
  "use server";
  const { actor, tenant } = await currentSessionContext();
  if (!actor || !tenant) redirect("/login");
  if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") redirect("/");
  const id = String(formData.get("id") || "");
  const tracker = await prisma.trackerType.findFirst({ where: { id, tenantId: tenant.id } });
  if (!tracker) redirect("/settings/trackers?error=not-found");
  const title = String(formData.get("title") || tracker.title).trim();
  await prisma.trackerType.update({
    where: { id: tracker.id },
    data: {
      title,
      description: String(formData.get("description") || "").trim(),
      color: String(formData.get("color") || tracker.color).trim() || tracker.color,
      enabled: formData.get("enabled") === "on",
      allowOpenSession: formData.get("allowOpenSession") === "on",
      autoCloseOpenSession: formData.get("autoCloseOpenSession") === "on"
    }
  });
  await prisma.tenantFeature.upsert({
    where: { tenantId_key: { tenantId: tenant.id, key: `tracker.${tracker.key}` } },
    update: { enabled: formData.get("featureEnabled") === "on" },
    create: { tenantId: tenant.id, key: `tracker.${tracker.key}`, enabled: formData.get("featureEnabled") === "on" }
  });
  await logAction({
    actorId: actor.id,
    action: "tracker_type_updated",
    entityType: "trackerType",
    entityId: tracker.id,
    title: `${userDisplayName(actor)} hat den Tracker ${title} bearbeitet`,
    href: "/settings/trackers"
  });
  redirect("/settings/trackers?saved=updated");
}

export default async function TrackerSettingsPage({ searchParams }: { searchParams: { saved?: string; error?: string } }) {
  const { actor, tenant } = await currentSessionContext();
  if (!actor) redirect("/login");
  if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") redirect("/");
  if (!tenant) redirect("/");
  const trackers = await prisma.trackerType.findMany({
    where: { tenantId: tenant.id },
    include: { _count: { select: { entries: true } } },
    orderBy: [{ key: "asc" }]
  });
  const featureEnabled = new Set(tenant.features.filter((feature) => feature.enabled).map((feature) => feature.key));
  const featureKnown = new Set(tenant.features.map((feature) => feature.key));

  return (
    <AppShell>
      <PageHeader title="Tracker" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {searchParams.saved ? <Panel className="text-sm text-graphite">Tracker gespeichert.</Panel> : null}
          {searchParams.error ? (
            <Panel className="text-sm text-redbrand">
              {searchParams.error === "exists" ? "Dieser Tracker-Key existiert bereits." : searchParams.error === "missing" ? "Bitte Titel und Key angeben." : "Tracker konnte nicht gespeichert werden."}
            </Panel>
          ) : null}

          <Panel>
            <details className="group/tracker-create">
              <summary className="focus-ring flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-1 text-lg font-semibold text-ink hover:text-redbrand [&::-webkit-details-marker]:hidden">
                Neuen Tracker anlegen
                <span className="text-sm font-medium text-graphite group-open/tracker-create:hidden">aufklappen</span>
                <span className="hidden text-sm font-medium text-graphite group-open/tracker-create:inline">einklappen</span>
              </summary>
              <form action={createTracker} className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Titel"><input className={inputClass} name="title" placeholder="Ropes Tracker" required /></Field>
                  <Field label="Key"><input className={inputClass} name="key" placeholder="ropes" /></Field>
                </div>
                <Field label="Beschreibung"><textarea className={inputClass} name="description" rows={3} /></Field>
                <Field label="Farbe"><input className={inputClass} name="color" type="color" defaultValue="#E30613" /></Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="flex items-center gap-2 rounded-md border border-line bg-paper p-3 text-sm"><input name="enabled" type="checkbox" defaultChecked className="h-4 w-4 accent-redbrand" /> Tracker aktiv</label>
                  <label className="flex items-center gap-2 rounded-md border border-line bg-paper p-3 text-sm"><input name="featureEnabled" type="checkbox" defaultChecked className="h-4 w-4 accent-redbrand" /> Auf Seite sichtbar</label>
                  <label className="flex items-center gap-2 rounded-md border border-line bg-paper p-3 text-sm"><input name="autoCloseOpenSession" type="checkbox" defaultChecked className="h-4 w-4 accent-redbrand" /> Offene automatisch schließen</label>
                </div>
                <input type="hidden" name="allowOpenSession" value="on" />
                <SubmitButton pendingLabel="Tracker wird angelegt..."><Plus className="h-4 w-4" /> Tracker anlegen</SubmitButton>
              </form>
            </details>
          </Panel>

          <Panel>
            <details className="group/tracker-list" open>
              <summary className="focus-ring flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-1 text-lg font-semibold text-ink hover:text-redbrand [&::-webkit-details-marker]:hidden">
                Vorhandene Tracker
                <span className="text-sm font-medium text-graphite group-open/tracker-list:hidden">aufklappen</span>
                <span className="hidden text-sm font-medium text-graphite group-open/tracker-list:inline">einklappen</span>
              </summary>
              <div className="mt-4 space-y-3">
                {trackers.map((tracker) => (
                  <details key={tracker.id} className="group/tracker-row overflow-hidden rounded-md border border-line bg-paper">
                    <summary className="focus-ring flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 hover:bg-surface [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ink">{tracker.title}</span>
                        <span className="block truncate text-xs text-graphite">tracker.{tracker.key} · {tracker._count.entries} Einträge</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-graphite">
                        <span className="h-4 w-4 rounded-full border border-line" style={{ backgroundColor: tracker.color }} />
                        <span className="group-open/tracker-row:hidden">aufklappen</span>
                        <span className="hidden group-open/tracker-row:inline">einklappen</span>
                      </span>
                    </summary>
                    <form action={saveTracker} className="space-y-4 border-t border-line p-4">
                      <input type="hidden" name="id" value={tracker.id} />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Titel"><input className={inputClass} name="title" defaultValue={tracker.title} required /></Field>
                        <Field label="Key"><input className={inputClass} value={tracker.key} readOnly /></Field>
                      </div>
                      <Field label="Beschreibung"><textarea className={inputClass} name="description" rows={3} defaultValue={tracker.description || ""} /></Field>
                      <Field label="Farbe"><input className={inputClass} name="color" type="color" defaultValue={tracker.color} /></Field>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="flex items-center gap-2 rounded-md border border-line bg-surface p-3 text-sm"><input name="enabled" type="checkbox" defaultChecked={tracker.enabled} className="h-4 w-4 accent-redbrand" /> Tracker aktiv</label>
                        <label className="flex items-center gap-2 rounded-md border border-line bg-surface p-3 text-sm"><input name="featureEnabled" type="checkbox" defaultChecked={featureEnabled.has(`tracker.${tracker.key}`) || !featureKnown.has(`tracker.${tracker.key}`)} className="h-4 w-4 accent-redbrand" /> Auf Seite sichtbar</label>
                        <label className="flex items-center gap-2 rounded-md border border-line bg-surface p-3 text-sm"><input name="autoCloseOpenSession" type="checkbox" defaultChecked={tracker.autoCloseOpenSession} className="h-4 w-4 accent-redbrand" /> Offene automatisch schließen</label>
                      </div>
                      <input type="hidden" name="allowOpenSession" value="on" />
                      <SubmitButton pendingLabel="Tracker wird gespeichert..."><Save className="h-4 w-4" /> Tracker speichern</SubmitButton>
                    </form>
                  </details>
                ))}
                {!trackers.length ? <p className="text-sm text-graphite">Noch kein Tracker angelegt.</p> : null}
              </div>
            </details>
          </Panel>
        </div>
        <PageGuide title="Konfigurierbare Tracker">
          Tracker-Typen bilden die gemeinsame Basis für Segufix, KG und weitere Themen. „Auf Seite sichtbar“ schaltet den jeweiligen Tracker für diese Seite frei; „Tracker aktiv“ deaktiviert den Typ selbst, ohne vorhandene Einträge zu löschen.
        </PageGuide>
      </div>
    </AppShell>
  );
}
