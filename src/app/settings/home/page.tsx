import { redirect } from "next/navigation";
import { Save } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { Field, inputClass, PageGuide, PageHeader, Panel } from "@/components/ui";
import { currentSessionContext } from "@/lib/auth";
import { logAction, userDisplayName } from "@/lib/audit";
import { homeSections, normalizeHomeLayout } from "@/lib/home-layout";
import { prisma } from "@/lib/prisma";

async function saveHomeLayout(formData: FormData) {
  "use server";
  const { actor, tenant } = await currentSessionContext();
  if (!actor || !tenant) redirect("/login");
  if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") redirect("/");
  const ordered = homeSections
    .map((section, index) => ({
      key: section.key,
      position: Number(formData.get(`position:${section.key}`) || index + 1)
    }))
    .sort((a, b) => a.position - b.position)
    .map((entry) => entry.key);
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { homeLayout: normalizeHomeLayout(ordered) }
  });
  await logAction({
    actorId: actor.id,
    action: "home_layout_updated",
    entityType: "tenant",
    entityId: tenant.id,
    title: `${userDisplayName(actor)} hat die Startseite sortiert`,
    href: "/settings/home"
  });
  redirect("/settings/home?saved=1");
}

export default async function HomeSettingsPage({ searchParams }: { searchParams: { saved?: string } }) {
  const { actor, tenant } = await currentSessionContext();
  if (!actor) redirect("/login");
  if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") redirect("/");
  if (!tenant) redirect("/");
  const layout = normalizeHomeLayout((tenant as { homeLayout?: unknown }).homeLayout);
  const orderByKey = new Map(layout.map((key, index) => [key, index + 1]));
  return (
    <AppShell>
      <PageHeader title="Startseite" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel>
          {searchParams.saved ? <p className="mb-4 rounded-md border border-line bg-paper p-3 text-sm text-graphite">Startseite gespeichert.</p> : null}
          <form action={saveHomeLayout} className="space-y-4">
            <div className="grid gap-3">
              {homeSections.map((section) => (
                <div key={section.key} className="grid gap-3 rounded-md border border-line bg-paper p-3 sm:grid-cols-[1fr_110px] sm:items-end">
                  <div>
                    <div className="font-semibold text-ink">{section.label}</div>
                    <div className="mt-1 text-xs text-graphite">{section.key}</div>
                  </div>
                  <Field label="Position">
                    <input className={inputClass} name={`position:${section.key}`} type="number" min={1} max={homeSections.length} defaultValue={orderByKey.get(section.key) || 1} />
                  </Field>
                </div>
              ))}
            </div>
            <SubmitButton pendingLabel="Startseite wird gespeichert..."><Save className="h-4 w-4" /> Reihenfolge speichern</SubmitButton>
          </form>
        </Panel>
        <PageGuide title="Startseite sortieren">
          Gib den Bereichen eine Position. Gleiche Zahlen sind erlaubt; dann bleibt die interne Standardreihenfolge erhalten. Sichtbar werden nur Bereiche, deren Feature auf dieser Seite aktiv ist und für die Daten vorhanden sind.
        </PageGuide>
      </div>
    </AppShell>
  );
}
