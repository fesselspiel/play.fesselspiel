import { redirect } from "next/navigation";
import { ChevronDown, CopyPlus, Globe2, Plus, Save, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { TenantCatalogCopyPicker, type CatalogCopySource } from "@/components/tenant-catalog-copy-picker";
import { Button, Field, inputClass, PageGuide, PageHeader, Panel, selectClass } from "@/components/ui";
import { featureCatalog } from "@/lib/features";
import { currentSessionContext } from "@/lib/auth";
import { logAction, userDisplayName } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { DEFAULT_TENANT_SLUG, normalizeHostname } from "@/lib/tenancy";
import { slugify } from "@/lib/slug";
import { copyCatalogBetweenTenants, type TenantCatalogCopyMode } from "@/lib/tenant-catalog-copy";

const defaultDisabledText =
  "Dieses Feature ist auf dieser Seite momentan nicht eingeschaltet. Falls du es erwartest, sprich kurz mit der Person, die diese Seite verwaltet. Eure vorhandenen Daten bleiben dabei erhalten.";

async function requireSuperAdmin() {
  const { actor } = await currentSessionContext();
  if (!actor) redirect("/login");
  if (actor.role !== "SUPER_ADMIN") redirect("/");
  return actor;
}

function formText(formData: FormData, key: string, fallback = "") {
  return String(formData.get(key) || fallback).trim();
}

async function createSite(formData: FormData) {
  "use server";
  const actor = await requireSuperAdmin();
  const name = formText(formData, "name");
  const slug = slugify(formText(formData, "slug", name));
  const hostname = normalizeHostname(formText(formData, "hostname"));
  if (!name || !slug) redirect("/settings/sites?error=missing");
  const existingSlug = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (existingSlug) redirect("/settings/sites?error=slug-exists");
  const existingDomain = hostname ? await prisma.tenantDomain.findUnique({ where: { hostname }, select: { id: true } }) : null;
  const tenant = await prisma.tenant.create({
    data: {
      name,
      slug,
      headline: formText(formData, "headline"),
      description: formText(formData, "description"),
      ...(hostname && !existingDomain ? { domains: { create: { hostname, primary: true, active: true } } } : {}),
      features: { create: featureCatalog.map((feature) => ({ key: feature.key, enabled: true })) }
    }
  });
  await logAction({
    actorId: actor.id,
    action: "site_created",
    entityType: "tenant",
    entityId: tenant.id,
    title: `${userDisplayName(actor)} hat die Seite ${tenant.name} angelegt`,
    href: "/settings/sites"
  });
  redirect(existingDomain ? "/settings/sites?saved=1&domainSkipped=1" : "/settings/sites?saved=1");
}

async function saveSite(formData: FormData) {
  "use server";
  const actor = await requireSuperAdmin();
  const tenantId = formText(formData, "tenantId");
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) redirect("/settings/sites?error=missing-site");
  const name = formText(formData, "name", tenant.name);
  const slug = slugify(formText(formData, "slug", tenant.slug));
  const status = tenant.slug === DEFAULT_TENANT_SLUG ? "ACTIVE" : formText(formData, "status", tenant.status);
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      name,
      slug,
      status: status === "DISABLED" ? "DISABLED" : "ACTIVE",
      headline: formText(formData, "headline"),
      description: formText(formData, "description"),
      disabledTitle: formText(formData, "disabledTitle", "Dieser Bereich macht gerade Pause"),
      disabledText: formText(formData, "disabledText", defaultDisabledText),
      disabledButtonText: formText(formData, "disabledButtonText", "Zur Startseite"),
      disabledButtonHref: formText(formData, "disabledButtonHref", "/")
    }
  });
  const featureKeys = Array.from(new Set(formData.getAll("featureKey").map(String).filter(Boolean)));
  for (const featureKey of featureKeys) {
    await prisma.tenantFeature.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: featureKey } },
      update: { enabled: formData.get(`feature:${featureKey}`) === "on" },
      create: { tenantId: tenant.id, key: featureKey, enabled: formData.get(`feature:${featureKey}`) === "on" }
    });
  }
  await logAction({
    actorId: actor.id,
    action: "site_updated",
    entityType: "tenant",
    entityId: tenant.id,
    title: `${userDisplayName(actor)} hat die Seite ${name} bearbeitet`,
    href: "/settings/sites"
  });
  redirect("/settings/sites?saved=1");
}

async function addDomain(formData: FormData) {
  "use server";
  const actor = await requireSuperAdmin();
  const tenantId = formText(formData, "tenantId");
  const hostname = normalizeHostname(formText(formData, "hostname"));
  if (!tenantId || !hostname) redirect("/settings/sites?error=domain");
  const existingDomain = await prisma.tenantDomain.findUnique({ where: { hostname }, select: { id: true } });
  if (existingDomain) redirect("/settings/sites?error=domain-exists");
  await prisma.tenantDomain.create({ data: { tenantId, hostname, active: true, primary: false } });
  await logAction({
    actorId: actor.id,
    action: "site_domain_added",
    entityType: "tenant",
    entityId: tenantId,
    title: `${userDisplayName(actor)} hat die Domain ${hostname} ergänzt`,
    href: "/settings/sites"
  });
  redirect("/settings/sites?saved=1");
}

async function setPrimaryDomain(formData: FormData) {
  "use server";
  const actor = await requireSuperAdmin();
  const domainId = formText(formData, "domainId");
  const domain = await prisma.tenantDomain.findUnique({ where: { id: domainId }, include: { tenant: true } });
  if (!domain) redirect("/settings/sites?error=domain");
  await prisma.$transaction([
    prisma.tenantDomain.updateMany({ where: { tenantId: domain.tenantId }, data: { primary: false } }),
    prisma.tenantDomain.update({ where: { id: domain.id }, data: { primary: true, active: true } })
  ]);
  await logAction({
    actorId: actor.id,
    action: "site_domain_primary",
    entityType: "tenant",
    entityId: domain.tenantId,
    title: `${userDisplayName(actor)} hat ${domain.hostname} als Hauptdomain gesetzt`,
    href: "/settings/sites"
  });
  redirect("/settings/sites?saved=1");
}

async function removeDomain(formData: FormData) {
  "use server";
  const actor = await requireSuperAdmin();
  const domainId = formText(formData, "domainId");
  const domain = await prisma.tenantDomain.findUnique({ where: { id: domainId }, include: { tenant: { include: { domains: true } } } });
  if (!domain) redirect("/settings/sites?error=domain");
  const activeDomains = domain.tenant.domains.filter((entry) => entry.active);
  if (domain.tenant.slug === DEFAULT_TENANT_SLUG && activeDomains.length <= 1) redirect("/settings/sites?error=main-domain");
  if (domain.primary && activeDomains.length > 1) {
    const next = activeDomains.find((entry) => entry.id !== domain.id);
    if (next) await prisma.tenantDomain.update({ where: { id: next.id }, data: { primary: true } });
  }
  await prisma.tenantDomain.delete({ where: { id: domain.id } });
  await logAction({
    actorId: actor.id,
    action: "site_domain_removed",
    entityType: "tenant",
    entityId: domain.tenantId,
    title: `${userDisplayName(actor)} hat die Domain ${domain.hostname} entfernt`,
    href: "/settings/sites"
  });
  redirect("/settings/sites?saved=1");
}

async function deleteSite(formData: FormData) {
  "use server";
  const actor = await requireSuperAdmin();
  const tenantId = formText(formData, "tenantId");
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { _count: { select: { users: true, circles: true, trackerTypes: true } } } });
  if (!tenant || tenant.slug === DEFAULT_TENANT_SLUG) redirect("/settings/sites?error=protected");
  if (tenant._count.users || tenant._count.circles || tenant._count.trackerTypes) {
    await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "DISABLED" } });
    redirect("/settings/sites?disabled=1");
  }
  await prisma.tenant.delete({ where: { id: tenant.id } });
  await logAction({
    actorId: actor.id,
    action: "site_deleted",
    entityType: "tenant",
    entityId: tenant.id,
    title: `${userDisplayName(actor)} hat die Seite ${tenant.name} gelöscht`,
    href: "/settings/sites"
  });
  redirect("/settings/sites?deleted=1");
}

async function copyCatalogToSite(formData: FormData) {
  "use server";
  const actor = await requireSuperAdmin();
  const sourceTenantId = formText(formData, "sourceTenantId");
  const targetTenantId = formText(formData, "targetTenantId");
  const toyIds = formData.getAll("toyIds").map(String);
  const positionIds = formData.getAll("positionIds").map(String);
  const modeValue = formText(formData, "copyMode", "missing");
  const mode: TenantCatalogCopyMode = modeValue === "refresh" || modeValue === "duplicate" ? modeValue : "missing";
  if (!sourceTenantId || !targetTenantId || sourceTenantId === targetTenantId || (!toyIds.length && !positionIds.length)) {
    redirect("/settings/sites?error=catalog-copy");
  }
  try {
    const result = await copyCatalogBetweenTenants({ actorId: actor.id, sourceTenantId, targetTenantId, toyIds, positionIds, mode });
    const copied = result.copiedToys + result.copiedPositions + result.updatedToys + result.updatedPositions;
    const skipped = result.skippedToys + result.skippedPositions;
    redirect(`/settings/sites?catalogCopied=${copied}&catalogSkipped=${skipped}`);
  } catch (error) {
    console.error("tenant catalog copy failed", error);
    redirect("/settings/sites?error=catalog-copy");
  }
}

export default async function SitesPage({ searchParams }: { searchParams: { saved?: string; deleted?: string; disabled?: string; domainSkipped?: string; catalogCopied?: string; catalogSkipped?: string; error?: string } }) {
  await requireSuperAdmin();
  const sites = await prisma.tenant.findMany({
    include: {
      domains: { orderBy: [{ primary: "desc" }, { hostname: "asc" }] },
      features: true,
      trackerTypes: { orderBy: { title: "asc" } },
      toys: { include: { category: true }, orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { title: "asc" }] },
      positions: { include: { category: true, tools: { select: { id: true } } }, orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }] },
      _count: { select: { users: true, circles: true, trackerTypes: true, toys: true, positions: true } }
    },
    orderBy: [{ slug: "asc" }, { name: "asc" }]
  });
  const catalogSources: CatalogCopySource[] = sites.map((site) => ({
    id: site.id,
    name: site.name,
    toyCount: site._count.toys,
    positionCount: site._count.positions,
    toys: site.toys.map((toy) => ({ id: toy.id, title: toy.title, categoryName: toy.category?.name || "Allgemein" })),
    positions: site.positions.map((position) => ({
      id: position.id,
      name: position.name,
      categoryName: position.category?.name || "Allgemein",
      toolCount: position.tools.length
    }))
  }));
  return (
    <AppShell>
      <PageHeader title="Seiten" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {searchParams.saved ? <Panel className="text-sm text-graphite">Gespeichert.</Panel> : null}
          {searchParams.domainSkipped ? <Panel className="text-sm text-graphite">Die Domain ist bereits einer anderen Seite zugeordnet. Die neue Seite wurde ohne eigene Domain angelegt und ist über die Fallback-Route erreichbar.</Panel> : null}
          {searchParams.deleted ? <Panel className="text-sm text-graphite">Leere Seite gelöscht.</Panel> : null}
          {searchParams.disabled ? <Panel className="text-sm text-graphite">Die Seite enthält noch Daten und wurde deshalb deaktiviert.</Panel> : null}
          {searchParams.catalogCopied ? <Panel className="text-sm text-graphite">Katalog übernommen: {searchParams.catalogCopied} kopiert, {searchParams.catalogSkipped || "0"} vorhandene Einträge übersprungen.</Panel> : null}
          {searchParams.error ? (
            <Panel className="text-sm text-redbrand">
              {searchParams.error === "domain-exists"
                ? "Diese Domain ist bereits einer anderen Seite zugeordnet."
                : searchParams.error === "slug-exists"
                  ? "Dieser Kurzname wird bereits verwendet."
                  : searchParams.error === "missing"
                    ? "Bitte mindestens Name und Kurzname angeben."
                    : searchParams.error === "catalog-copy"
                      ? "Der Katalog konnte nicht übernommen werden. Bitte Quelle, Ziel und Auswahl prüfen."
                    : `Die Aktion konnte nicht ausgeführt werden: ${searchParams.error}`}
            </Panel>
          ) : null}

          <Panel>
            <details className="group/site-create">
              <summary className="focus-ring flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-1 text-lg font-semibold text-ink hover:text-redbrand [&::-webkit-details-marker]:hidden">
                Neue Seite anlegen
                <ChevronDown className="h-5 w-5 shrink-0 text-graphite transition group-open/site-create:rotate-180" />
              </summary>
              <form action={createSite} className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Name"><input className={inputClass} name="name" required /></Field>
                  <Field label="Kurzname"><input className={inputClass} name="slug" placeholder="meine-seite" /></Field>
                </div>
                <Field label="Hauptdomain"><input className={inputClass} name="hostname" placeholder="Optional: seite.example.com" /></Field>
                <Field label="Überschrift"><input className={inputClass} name="headline" /></Field>
                <Field label="Beschreibung"><textarea className={inputClass} name="description" rows={2} /></Field>
                <SubmitButton pendingLabel="Seite wird angelegt..."><Plus className="h-4 w-4" /> Seite anlegen</SubmitButton>
              </form>
            </details>
          </Panel>

          <Panel>
            <details className="group/sites-list" open>
              <summary className="focus-ring flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-1 text-lg font-semibold text-ink hover:text-redbrand [&::-webkit-details-marker]:hidden">
                Vorhandene Seiten
                <ChevronDown className="h-5 w-5 shrink-0 text-graphite transition group-open/sites-list:rotate-180" />
              </summary>
              <div className="mt-4 space-y-4">
                {sites.map((site) => {
                  const enabled = new Set(site.features.filter((feature) => feature.enabled).map((feature) => feature.key));
                  const staticFeatureKeys = new Set<string>(featureCatalog.map((feature) => feature.key));
                  const features = [
                    ...featureCatalog,
                    ...site.trackerTypes
                      .map((tracker) => ({ key: `tracker.${tracker.key}`, label: tracker.title }))
                      .filter((feature) => !staticFeatureKeys.has(feature.key))
                  ];
                  const isMain = site.slug === DEFAULT_TENANT_SLUG;
                  return (
                    <div key={site.id} className="rounded-lg border border-line bg-surface p-4">
                <details className="group/site-row">
                  <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-ink">{site.name}</h2>
                        <p className="text-sm text-graphite">
                          {site.domains.find((domain) => domain.primary)?.hostname || site.domains[0]?.hostname || `/seite/${site.slug}`} · {site.status === "ACTIVE" ? "aktiv" : "deaktiviert"} · {site._count.users} Benutzer
                        </p>
                        <p className="mt-1 text-xs text-graphite">Fallback: /seite/{site.slug} · {site._count.positions} Szenen · {site._count.toys} Spielsachen</p>
                      </div>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-paper px-3 py-1 text-xs font-semibold text-graphite">{site.slug}</span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-graphite transition group-open/site-row:rotate-180" />
                      </span>
                    </div>
                  </summary>

                  <div className="mt-5 space-y-5 border-t border-line pt-5">
                    <form action={saveSite} className="space-y-4">
                      <input type="hidden" name="tenantId" value={site.id} />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Name"><input className={inputClass} name="name" defaultValue={site.name} required /></Field>
                        <Field label="Kurzname"><input className={inputClass} name="slug" defaultValue={site.slug} required disabled={isMain} /></Field>
                      </div>
                      <Field label="Status">
                        <select className={selectClass} name="status" defaultValue={site.status} disabled={isMain}>
                          <option value="ACTIVE">Aktiv</option>
                          <option value="DISABLED">Deaktiviert</option>
                        </select>
                      </Field>
                      <Field label="Überschrift"><input className={inputClass} name="headline" defaultValue={site.headline || ""} /></Field>
                      <Field label="Beschreibung"><textarea className={inputClass} name="description" rows={2} defaultValue={site.description || ""} /></Field>

                      <details className="rounded-md border border-line bg-paper p-4">
                        <summary className="cursor-pointer font-semibold text-ink">Sperrseite</summary>
                        <div className="mt-4 space-y-4">
                          <Field label="Titel"><input className={inputClass} name="disabledTitle" defaultValue={site.disabledTitle} /></Field>
                          <Field label="Text"><textarea className={inputClass} name="disabledText" rows={4} defaultValue={site.disabledText} /></Field>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Button-Text"><input className={inputClass} name="disabledButtonText" defaultValue={site.disabledButtonText} /></Field>
                            <Field label="Button-Ziel"><input className={inputClass} name="disabledButtonHref" defaultValue={site.disabledButtonHref} /></Field>
                          </div>
                        </div>
                      </details>

                      <details className="rounded-md border border-line bg-paper p-4">
                        <summary className="cursor-pointer font-semibold text-ink">Features</summary>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {features.map((feature) => (
                            <label key={feature.key} className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface p-3 text-sm">
                              <input type="hidden" name="featureKey" value={feature.key} />
                              <span>
                                <strong className="block text-ink">{feature.label}</strong>
                                <span className="text-xs text-graphite">{feature.key}</span>
                              </span>
                              <input name={`feature:${feature.key}`} type="checkbox" defaultChecked={enabled.has(feature.key) || !site.features.some((entry) => entry.key === feature.key)} className="h-5 w-5 accent-redbrand" />
                            </label>
                          ))}
                        </div>
                      </details>
                      <SubmitButton pendingLabel="Seite wird gespeichert..."><Save className="h-4 w-4" /> Seite speichern</SubmitButton>
                    </form>

                    <details className="rounded-md border border-line bg-paper p-4">
                      <summary className="cursor-pointer font-semibold text-ink">Katalog aus anderer Seite übernehmen</summary>
                      <form action={copyCatalogToSite} className="mt-4 space-y-4">
                        <input type="hidden" name="targetTenantId" value={site.id} />
                        <p className="text-sm leading-6 text-graphite">
                          Erstellt echte Kopien in dieser Seite. Kategorien, Bilder und Verknüpfungen werden übernommen; spätere Änderungen bleiben auf dieser Seite isoliert.
                        </p>
                        <TenantCatalogCopyPicker sources={catalogSources.filter((sourceSite) => sourceSite.id !== site.id)} />
                        <SubmitButton pendingLabel="Katalog wird übernommen..."><CopyPlus className="h-4 w-4" /> Katalog übernehmen</SubmitButton>
                      </form>
                    </details>

                    <div className="rounded-md border border-line bg-paper p-4">
                      <h3 className="mb-3 flex items-center gap-2 font-semibold text-ink"><Globe2 className="h-4 w-4" /> Domains</h3>
                      <div className="space-y-2">
                        {site.domains.map((domain) => (
                          <div key={domain.id} className="flex flex-col gap-2 rounded-md border border-line bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="font-medium text-ink">{domain.hostname}</div>
                              <div className="text-xs text-graphite">{domain.primary ? "Hauptdomain" : "Alias"} · {domain.active ? "aktiv" : "inaktiv"}</div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {!domain.primary ? (
                                <form action={setPrimaryDomain}>
                                  <input type="hidden" name="domainId" value={domain.id} />
                                  <Button variant="secondary">Als Hauptdomain</Button>
                                </form>
                              ) : null}
                              <form action={removeDomain}>
                                <input type="hidden" name="domainId" value={domain.id} />
                                <Button variant="danger"><Trash2 className="h-4 w-4" /> Entfernen</Button>
                              </form>
                            </div>
                          </div>
                        ))}
                      </div>
                      <form action={addDomain} className="mt-4 flex flex-col gap-3 sm:flex-row">
                        <input type="hidden" name="tenantId" value={site.id} />
                        <input className={inputClass} name="hostname" placeholder="weitere-domain.example" required />
                        <SubmitButton pendingLabel="Domain wird ergänzt..." className="sm:w-auto"><Plus className="h-4 w-4" /> Domain ergänzen</SubmitButton>
                      </form>
                    </div>

                    {!isMain ? (
                      <form action={deleteSite} className="rounded-md border border-redbrand/30 bg-redbrand/5 p-4">
                        <input type="hidden" name="tenantId" value={site.id} />
                        <p className="mb-3 text-sm text-graphite">
                          Leere Seiten können gelöscht werden. Seiten mit Benutzern, Kreisen oder Trackern werden aus Sicherheitsgründen nur deaktiviert.
                        </p>
                        <Button variant="danger"><Trash2 className="h-4 w-4" /> Seite löschen oder deaktivieren</Button>
                      </form>
                    ) : null}
                  </div>
                </details>
                    </div>
                  );
                })}
              </div>
            </details>
          </Panel>
        </div>
        <PageGuide title="Seiten verwalten">
          Seiten sind getrennte Bereiche mit eigenen Domains, Benutzern, Kreisen, Telegram-Einstellungen und Features. Die Hauptseite bleibt geschützt; weitere Seiten kannst du deaktivieren oder löschen, solange dabei keine Daten verloren gehen.
        </PageGuide>
      </div>
    </AppShell>
  );
}
