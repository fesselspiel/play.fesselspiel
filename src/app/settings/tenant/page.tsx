import { redirect } from "next/navigation";
import { Save } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { Field, inputClass, PageGuide, PageHeader, Panel } from "@/components/ui";
import { featureCatalog } from "@/lib/features";
import { currentSessionContext } from "@/lib/auth";
import { logAction, userDisplayName } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

async function saveTenantSettings(formData: FormData) {
  "use server";
  const { actor, tenant } = await currentSessionContext();
  if (!actor || !tenant) redirect("/login");
  if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") redirect("/");
  const name = String(formData.get("name") || tenant.name).trim();
  const headline = String(formData.get("headline") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const disabledTitle = String(formData.get("disabledTitle") || "").trim() || "Dieser Bereich macht gerade Pause";
  const disabledText = String(formData.get("disabledText") || "").trim() || "Dieses Feature ist auf dieser Seite momentan nicht eingeschaltet. Falls du es erwartest, sprich kurz mit der Person, die diese Seite verwaltet. Eure vorhandenen Daten bleiben dabei erhalten.";
  const disabledButtonText = String(formData.get("disabledButtonText") || "").trim() || "Zur Startseite";
  const disabledButtonHref = String(formData.get("disabledButtonHref") || "").trim() || "/";
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { name, headline, description, disabledTitle, disabledText, disabledButtonText, disabledButtonHref }
  });
  for (const feature of featureCatalog) {
    await prisma.tenantFeature.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: feature.key } },
      update: { enabled: formData.get(`feature:${feature.key}`) === "on" },
      create: { tenantId: tenant.id, key: feature.key, enabled: formData.get(`feature:${feature.key}`) === "on" }
    });
  }
  await logAction({
    actorId: actor.id,
    action: "tenant_settings_updated",
    entityType: "tenant",
    entityId: tenant.id,
    title: `${userDisplayName(actor)} hat die Seite ${name} bearbeitet`,
    href: "/settings/tenant"
  });
  redirect("/settings/tenant?saved=1");
}

export default async function TenantSettingsPage({ searchParams }: { searchParams: { saved?: string } }) {
  const { actor, tenant } = await currentSessionContext();
  if (!actor) redirect("/login");
  if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") redirect("/");
  if (!tenant) redirect("/");
  const enabled = new Set(tenant.features.filter((feature) => feature.enabled).map((feature) => feature.key));
  return (
    <AppShell>
      <PageHeader title="Seite" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel>
          {searchParams.saved ? <p className="mb-4 rounded-md border border-line bg-paper p-3 text-sm text-graphite">Seite gespeichert.</p> : null}
          <form action={saveTenantSettings} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name"><input className={inputClass} name="name" defaultValue={tenant.name} required /></Field>
              <Field label="Überschrift"><input className={inputClass} name="headline" defaultValue={tenant.headline || ""} /></Field>
            </div>
            <Field label="Beschreibung"><textarea className={inputClass} name="description" rows={3} defaultValue={tenant.description || ""} /></Field>
            <details className="rounded-lg border border-line bg-paper p-4">
              <summary className="cursor-pointer text-lg font-semibold text-ink">Sperrseite</summary>
              <div className="mt-4 space-y-4">
                <Field label="Titel"><input className={inputClass} name="disabledTitle" defaultValue={tenant.disabledTitle} /></Field>
                <Field label="Text"><textarea className={inputClass} name="disabledText" rows={4} defaultValue={tenant.disabledText} /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Button-Text"><input className={inputClass} name="disabledButtonText" defaultValue={tenant.disabledButtonText} /></Field>
                  <Field label="Button-Ziel"><input className={inputClass} name="disabledButtonHref" defaultValue={tenant.disabledButtonHref} /></Field>
                </div>
              </div>
            </details>
            <div>
              <h2 className="mb-3 text-lg font-semibold">Features</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {featureCatalog.map((feature) => (
                  <label key={feature.key} className="flex items-center justify-between gap-3 rounded-md border border-line bg-paper p-3 text-sm">
                    <span>
                      <strong className="block text-ink">{feature.label}</strong>
                      <span className="text-xs text-graphite">{feature.key}</span>
                    </span>
                    <input name={`feature:${feature.key}`} type="checkbox" defaultChecked={enabled.has(feature.key) || !tenant.features.some((entry) => entry.key === feature.key)} className="h-5 w-5 accent-redbrand" />
                  </label>
                ))}
              </div>
            </div>
            <SubmitButton pendingLabel="Seite wird gespeichert..."><Save className="h-4 w-4" /> Seite speichern</SubmitButton>
          </form>
        </Panel>
        <PageGuide title="Seiten-Features">
          Hier steuerst du, welche Module diese Seite nutzt. Deaktivierte Features werden im Menü ausgeblendet und serverseitig auf eine freundliche Sperrseite geleitet. Daten werden dabei nicht gelöscht.
        </PageGuide>
      </div>
    </AppShell>
  );
}
