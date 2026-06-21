import Link from "next/link";
import { redirect } from "next/navigation";
import { Eye, EyeOff, RefreshCw, Save } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ShopifyBulkVisibilityToggle } from "@/components/shopify-bulk-visibility-toggle";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Button, Field, inputClass, PageGuide, PageHeader, Panel, selectClass } from "@/components/ui";
import { currentSessionContext } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { formatDateTime } from "@/lib/dates";
import { requireFeature } from "@/lib/features";
import { logAction, userDisplayName } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { normalizeShopDomain, normalizeShopifyApiVersion, refreshShopifyAccessToken, secretPreview, syncShopifyProducts, tokenPreview } from "@/lib/shopify";

async function requireShopifyAdmin() {
  const { actor, tenant } = await currentSessionContext();
  if (!actor) redirect("/login");
  if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") redirect("/");
  if (!tenant) redirect("/");
  await requireFeature("shopifyBondageSystem");
  return { actor, tenant };
}

async function saveIntegration(formData: FormData) {
  "use server";
  const { actor, tenant } = await requireShopifyAdmin();
  const clientId = String(formData.get("clientId") || "").trim();
  const clientSecret = String(formData.get("clientSecret") || "").trim();
  const existing = await prisma.shopifyIntegration.findUnique({ where: { tenantId: tenant.id } });
  const shopDomain = normalizeShopDomain(String(formData.get("shopDomain") || "").trim());
  const apiVersion = normalizeShopifyApiVersion(String(formData.get("apiVersion") || "").trim());
  const productTag = String(formData.get("productTag") || "").trim();
  if (!shopDomain || !productTag || (!existing?.clientIdEnc && !clientId) || (!existing?.clientSecretEnc && !clientSecret)) redirect("/settings/shopify?error=missing");
  await prisma.shopifyIntegration.upsert({
    where: { tenantId: tenant.id },
    update: {
      shopDomain,
      apiVersion,
      productTag,
      enabled: formData.get("enabled") === "on",
      ...(clientId ? { clientIdEnc: encryptSecret(clientId), accessTokenEnc: null, accessTokenExpiresAt: null, accessTokenScope: null } : {}),
      ...(clientSecret ? { clientSecretEnc: encryptSecret(clientSecret), accessTokenEnc: null, accessTokenExpiresAt: null, accessTokenScope: null } : {})
    },
    create: {
      tenantId: tenant.id,
      shopDomain,
      apiVersion,
      productTag,
      enabled: formData.get("enabled") === "on",
      clientIdEnc: encryptSecret(clientId),
      clientSecretEnc: encryptSecret(clientSecret)
    }
  });
  await logAction({
    actorId: actor.id,
    action: "shopify_settings_updated",
    entityType: "tenant",
    entityId: tenant.id,
    title: `${userDisplayName(actor)} hat Shopify für das Bondage-System gespeichert`,
    href: "/settings/shopify",
    details: { hasClientId: Boolean(existing?.clientIdEnc || clientId), hasClientSecret: Boolean(existing?.clientSecretEnc || clientSecret), productTag, apiVersion }
  });
  redirect("/settings/shopify?saved=1");
}

async function runSync() {
  "use server";
  const { actor, tenant } = await requireShopifyAdmin();
  let count = 0;
  try {
    const result = await syncShopifyProducts(tenant.id);
    count = result.count;
    await logAction({
      actorId: actor.id,
      action: "shopify_sync_completed",
      entityType: "tenant",
      entityId: tenant.id,
      title: `Shopify-Sync abgeschlossen: ${result.count} Produkte`,
      href: "/settings/shopify"
    });
  } catch (error) {
    await prisma.shopifyIntegration.updateMany({
      where: { tenantId: tenant.id },
      data: { lastSyncAt: new Date(), lastSyncStatus: "ERROR", lastSyncMessage: (error as Error).message }
    });
    redirect(`/settings/shopify?error=${encodeURIComponent((error as Error).message)}`);
  }
  redirect(`/settings/shopify?synced=${count}`);
}

async function refreshToken() {
  "use server";
  const { actor, tenant } = await requireShopifyAdmin();
  try {
    const result = await refreshShopifyAccessToken(tenant.id);
    await logAction({
      actorId: actor.id,
      action: "shopify_token_refreshed",
      entityType: "tenant",
      entityId: tenant.id,
      title: `${userDisplayName(actor)} hat den Shopify-Token erneuert`,
      href: "/settings/shopify",
      details: { expiresAt: result.expiresAt, hasScope: Boolean(result.scope) }
    });
  } catch (error) {
    await prisma.shopifyIntegration.updateMany({
      where: { tenantId: tenant.id },
      data: { lastSyncAt: new Date(), lastSyncStatus: "ERROR", lastSyncMessage: (error as Error).message }
    });
    redirect(`/settings/shopify?error=${encodeURIComponent((error as Error).message)}`);
  }
  redirect("/settings/shopify?token=refreshed");
}

async function saveAllItems(formData: FormData) {
  "use server";
  const { actor, tenant } = await requireShopifyAdmin();
  const ids = formData.getAll("itemId").map(String).filter(Boolean);
  const items = ids.length ? await prisma.bondageSystemItem.findMany({ where: { id: { in: ids }, tenantId: tenant.id }, include: { product: true } }) : [];
  if (items.length !== ids.length) redirect("/settings/shopify?error=item");
  await prisma.$transaction(items.map((item) => {
    const visibility = String(formData.get(`visibility:${item.id}`) || "PRIVATE") as "PRIVATE" | "PARTNER" | "SHARED";
    const targetUserId = String(formData.get(`targetUserId:${item.id}`) || "") || null;
    const targetCircleId = String(formData.get(`targetCircleId:${item.id}`) || "") || null;
    return prisma.bondageSystemItem.update({
      where: { id: item.id },
      data: {
        visible: formData.get(`visible:${item.id}`) === "on",
        visibility,
        targetUserId: visibility === "PRIVATE" ? targetUserId : null,
        targetCircleId: visibility === "PARTNER" ? targetCircleId : null,
        showExternalLink: formData.get(`showExternalLink:${item.id}`) === "on"
      }
    });
  }));
  await logAction({
    actorId: actor.id,
    action: "bondage_system_items_updated",
    entityType: "tenant",
    entityId: tenant.id,
    title: `${userDisplayName(actor)} hat ${items.length} Bondage-System-Produkte gespeichert`,
    href: "/settings/shopify",
    details: { count: items.length }
  });
  redirect("/settings/shopify?saved=1#products");
}

async function setAllItemsVisibility(formData: FormData) {
  "use server";
  const { actor, tenant } = await requireShopifyAdmin();
  const visible = String(formData.get("visible") || "") === "true";
  const result = await prisma.bondageSystemItem.updateMany({
    where: { tenantId: tenant.id },
    data: { visible }
  });
  await logAction({
    actorId: actor.id,
    action: "bondage_system_items_bulk_visibility_updated",
    entityType: "tenant",
    entityId: tenant.id,
    title: `${userDisplayName(actor)} hat ${result.count} Bondage-System-Produkte ${visible ? "sichtbar geschaltet" : "verborgen"}`,
    href: "/settings/shopify",
    details: { visible, count: result.count }
  });
  redirect("/settings/shopify?saved=1#products");
}

export default async function ShopifySettingsPage({ searchParams }: { searchParams?: { saved?: string; synced?: string; token?: string; error?: string } }) {
  const { tenant } = await requireShopifyAdmin();
  const [integration, products, users, circles] = await Promise.all([
    prisma.shopifyIntegration.findUnique({ where: { tenantId: tenant.id } }),
    prisma.bondageSystemItem.findMany({
      where: { tenantId: tenant.id },
      include: { product: true, targetUser: { include: { profile: true } }, targetCircle: true },
      orderBy: [{ sortOrder: "asc" }, { product: { title: "asc" } }]
    }),
    prisma.user.findMany({ where: { tenantId: tenant.id, active: true }, include: { profile: true }, orderBy: [{ name: "asc" }, { username: "asc" }] }),
    prisma.circle.findMany({ where: { tenantId: tenant.id }, orderBy: { name: "asc" } })
  ]);
  return (
    <AppShell>
      <PageHeader title="Shopify" />
      <PageGuide title="Shopify-Produkte als Bondage-System">
        Verbinde hier Shopify, lies Produkte anhand eines Tags ein und entscheide danach einzeln, welche Produkte im Bondage-System sichtbar sind.
      </PageGuide>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {searchParams?.saved ? <Panel className="text-sm text-graphite">Gespeichert.</Panel> : null}
          {searchParams?.synced ? <Panel className="text-sm text-graphite">{searchParams.synced} Produkte eingelesen.</Panel> : null}
          {searchParams?.token === "refreshed" ? <Panel className="text-sm text-graphite">Shopify-Token wurde erneuert.</Panel> : null}
          {searchParams?.error ? <Panel className="text-sm text-redbrand">{searchParams.error}</Panel> : null}
          <Panel>
            <h2 className="mb-4 text-lg font-semibold text-ink">Verbindung</h2>
            <form action={saveIntegration} className="space-y-4">
              <label className="flex items-center gap-3 rounded-md bg-paper p-3 text-sm font-medium text-ink">
                <input name="enabled" type="checkbox" defaultChecked={integration?.enabled ?? true} className="h-4 w-4 accent-redbrand" />
                Shopify-Sync aktiv
              </label>
              <Field label="Shopify-Shop-Domain"><input className={inputClass} name="shopDomain" placeholder="meinshop.myshopify.com" defaultValue={integration?.shopDomain || ""} required /></Field>
              <Field label="Client ID">
                <input className={inputClass} name="clientId" type="password" placeholder={integration?.clientIdEnc ? `Gespeichert · endet auf ${secretPreview(integration.clientIdEnc)}` : "Client ID aus dem Shopify Dev Dashboard"} />
              </Field>
              <Field label="Client Secret">
                <input className={inputClass} name="clientSecret" type="password" placeholder={integration?.clientSecretEnc ? `Gespeichert · endet auf ${secretPreview(integration.clientSecretEnc)}` : "Client Secret aus dem Shopify Dev Dashboard"} />
              </Field>
              <Field label="Admin API-Version">
                <input className={inputClass} name="apiVersion" placeholder="2026-04" defaultValue={normalizeShopifyApiVersion(integration?.apiVersion)} required />
              </Field>
              <Field label="Produkt-Tag-Filter"><input className={inputClass} name="productTag" placeholder="bondage-system" defaultValue={integration?.productTag || ""} required /></Field>
              <SubmitButton pendingLabel="Shopify wird gespeichert..."><Save className="h-4 w-4" /> Verbindung speichern</SubmitButton>
            </form>
          </Panel>
          <Panel>
            <h2 className="mb-4 text-lg font-semibold text-ink">Sync</h2>
            <p className="mb-4 text-sm leading-6 text-graphite">
              Letzter Sync: {integration?.lastSyncAt ? formatDateTime(integration.lastSyncAt) : "noch nie"} · {integration?.lastSyncStatus || "kein Status"}
              {integration?.lastSyncMessage ? <><br />{integration.lastSyncMessage}</> : null}
              {integration?.accessTokenExpiresAt ? <><br />Shopify-Token gültig bis: {formatDateTime(integration.accessTokenExpiresAt)}{integration.accessTokenEnc ? ` · endet auf ${tokenPreview(integration.accessTokenEnc)}` : ""}</> : null}
              {integration?.accessTokenScope ? <><br />Scopes: {integration.accessTokenScope}</> : null}
            </p>
            <div className="flex flex-wrap gap-3">
              <form action={runSync}>
                <SubmitButton pendingLabel="Produkte werden eingelesen..."><RefreshCw className="h-4 w-4" /> Produkte einlesen</SubmitButton>
              </form>
              <form action={refreshToken}>
                <SubmitButton pendingLabel="Token wird erneuert..."><RefreshCw className="h-4 w-4" /> Shopify-Token erneuern</SubmitButton>
              </form>
            </div>
          </Panel>
          <Panel id="products">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold text-ink">Importierte Produkte</h2>
              {products.length ? (
                <div className="flex flex-wrap gap-2">
                  <form action={setAllItemsVisibility}>
                    <input type="hidden" name="visible" value="true" />
                    <SubmitButton pendingLabel="Alle werden sichtbar geschaltet..."><Eye className="h-4 w-4" /> Alle anzeigen</SubmitButton>
                  </form>
                  <form action={setAllItemsVisibility}>
                    <input type="hidden" name="visible" value="false" />
                    <SubmitButton pendingLabel="Alle werden verborgen..."><EyeOff className="h-4 w-4" /> Alle verbergen</SubmitButton>
                  </form>
                </div>
              ) : null}
            </div>
            <form action={saveAllItems} className="space-y-3">
              {products.length ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <ShopifyBulkVisibilityToggle total={products.length} />
                  <SubmitButton pendingLabel="Änderungen werden gespeichert..."><Save className="h-4 w-4" /> Alle Änderungen speichern</SubmitButton>
                </div>
              ) : null}
              {products.map((item) => (
                <div key={item.id} className="rounded-lg border border-line bg-paper p-4">
                  <input type="hidden" name="itemId" value={item.id} />
                  <div className="grid grid-cols-[84px_1fr] gap-4 sm:grid-cols-[120px_1fr]">
                    <div className="h-20 w-20 overflow-hidden rounded-md bg-surface sm:h-28 sm:w-28">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.product.imageUrl || "/toy-placeholder.svg"} alt="" className="block h-full w-full max-w-full object-contain" />
                    </div>
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-ink">{item.product.title}</h3>
                          <p className="text-xs text-graphite">{item.product.vendor || "Shopify"} · /bondage-system/{item.product.slug}</p>
                        </div>
                        <Badge tone={item.visible ? "green" : "neutral"}>{item.visible ? "sichtbar" : "verborgen"}</Badge>
                      </div>
                      <label className="flex items-center gap-3 text-sm font-medium text-ink">
                        <input name={`visible:${item.id}`} type="checkbox" defaultChecked={item.visible} data-shopify-visible-checkbox="true" className="h-4 w-4 accent-redbrand" />
                        Im Bondage-System anzeigen
                      </label>
                      <label className="flex items-center gap-3 text-sm font-medium text-ink">
                        <input name={`showExternalLink:${item.id}`} type="checkbox" defaultChecked={item.showExternalLink} className="h-4 w-4 accent-redbrand" />
                        Shopify-Link anzeigen
                      </label>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Field label="Sichtbarkeit">
                          <select className={selectClass} name={`visibility:${item.id}`} defaultValue={item.visibility}>
                            <option value="PRIVATE">Nur Benutzer</option>
                            <option value="PARTNER">Zirkel</option>
                            <option value="SHARED">Alle auf dieser Seite</option>
                          </select>
                        </Field>
                        <Field label="Zielbenutzer">
                          <select className={selectClass} name={`targetUserId:${item.id}`} defaultValue={item.targetUserId || ""}>
                            <option value="">Keiner</option>
                            {users.map((user) => <option key={user.id} value={user.id}>{user.profile?.displayName || user.name || user.username || user.email}</option>)}
                          </select>
                        </Field>
                        <Field label="Zielzirkel">
                          <select className={selectClass} name={`targetCircleId:${item.id}`} defaultValue={item.targetCircleId || ""}>
                            <option value="">Keiner</option>
                            {circles.map((circle) => <option key={circle.id} value={circle.id}>{circle.name}</option>)}
                          </select>
                        </Field>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {item.visible ? <Link href={`/bondage-system/${item.product.slug}`} className="inline-flex min-h-10 items-center justify-center rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">Öffnen</Link> : null}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {!products.length ? <p className="rounded-md border border-dashed border-line bg-paper p-4 text-sm text-graphite">Noch keine Produkte eingelesen.</p> : null}
            </form>
          </Panel>
        </div>
        <Panel className="h-fit text-sm leading-6 text-graphite">
          <h2 className="mb-2 text-base font-semibold text-ink">Shopify App</h2>
          <p>Lege im Shopify Dev Dashboard eine App mit Admin-API-Zugriff auf Produkte an. Für v1 reichen Leserechte auf Produkte. Trage hier einmal Client ID und Client Secret ein; die App erzeugt daraus automatisch kurzlebige Access Tokens und erneuert sie vor dem Sync.</p>
          <p className="mt-3">Für diesen Client-Credentials-Flow wird keine echte OAuth-Callback-URL genutzt. Falls Shopify eine URL verlangt, verwende `https://playplaner.com/settings/shopify`.</p>
        </Panel>
      </div>
    </AppShell>
  );
}
