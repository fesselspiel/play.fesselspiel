import Link from "next/link";
import { redirect } from "next/navigation";
import { RefreshCw, Save } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Button, Field, inputClass, PageGuide, PageHeader, Panel, selectClass } from "@/components/ui";
import { currentSessionContext } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { formatDateTime } from "@/lib/dates";
import { requireFeature } from "@/lib/features";
import { logAction, userDisplayName } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { normalizeShopDomain, syncShopifyProducts, tokenPreview } from "@/lib/shopify";

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
  const token = String(formData.get("accessToken") || "").trim();
  const existing = await prisma.shopifyIntegration.findUnique({ where: { tenantId: tenant.id } });
  const shopDomain = normalizeShopDomain(String(formData.get("shopDomain") || "").trim());
  const productTag = String(formData.get("productTag") || "").trim();
  if (!shopDomain || !productTag) redirect("/settings/shopify?error=missing");
  await prisma.shopifyIntegration.upsert({
    where: { tenantId: tenant.id },
    update: {
      shopDomain,
      productTag,
      enabled: formData.get("enabled") === "on",
      ...(token ? { accessTokenEnc: encryptSecret(token) } : {})
    },
    create: {
      tenantId: tenant.id,
      shopDomain,
      productTag,
      enabled: formData.get("enabled") === "on",
      accessTokenEnc: encryptSecret(token)
    }
  });
  await logAction({
    actorId: actor.id,
    action: "shopify_settings_updated",
    entityType: "tenant",
    entityId: tenant.id,
    title: `${userDisplayName(actor)} hat Shopify für das Bondage-System gespeichert`,
    href: "/settings/shopify",
    details: { hadToken: Boolean(existing?.accessTokenEnc || token), productTag }
  });
  redirect("/settings/shopify?saved=1");
}

async function runSync() {
  "use server";
  const { actor, tenant } = await requireShopifyAdmin();
  try {
    const result = await syncShopifyProducts(tenant.id);
    await logAction({
      actorId: actor.id,
      action: "shopify_sync_completed",
      entityType: "tenant",
      entityId: tenant.id,
      title: `Shopify-Sync abgeschlossen: ${result.count} Produkte`,
      href: "/settings/shopify"
    });
    redirect(`/settings/shopify?synced=${result.count}`);
  } catch (error) {
    await prisma.shopifyIntegration.updateMany({
      where: { tenantId: tenant.id },
      data: { lastSyncAt: new Date(), lastSyncStatus: "ERROR", lastSyncMessage: (error as Error).message }
    });
    redirect(`/settings/shopify?error=${encodeURIComponent((error as Error).message)}`);
  }
}

async function saveItem(formData: FormData) {
  "use server";
  const { actor, tenant } = await requireShopifyAdmin();
  const id = String(formData.get("id") || "");
  const visibility = String(formData.get("visibility") || "PRIVATE") as "PRIVATE" | "PARTNER" | "SHARED";
  const targetUserId = String(formData.get("targetUserId") || "") || null;
  const targetCircleId = String(formData.get("targetCircleId") || "") || null;
  const item = await prisma.bondageSystemItem.findFirst({ where: { id, tenantId: tenant.id }, include: { product: true } });
  if (!item) redirect("/settings/shopify?error=item");
  await prisma.bondageSystemItem.update({
    where: { id: item.id },
    data: {
      visible: formData.get("visible") === "on",
      visibility,
      targetUserId: visibility === "PRIVATE" ? targetUserId : null,
      targetCircleId: visibility === "PARTNER" ? targetCircleId : null,
      showExternalLink: formData.get("showExternalLink") === "on"
    }
  });
  await logAction({
    actorId: actor.id,
    action: "bondage_system_item_updated",
    entityType: "bondageSystemItem",
    entityId: item.id,
    title: `${userDisplayName(actor)} hat ${item.product.title} im Bondage-System bearbeitet`,
    href: "/settings/shopify"
  });
  redirect("/settings/shopify?saved=1#products");
}

export default async function ShopifySettingsPage({ searchParams }: { searchParams?: { saved?: string; synced?: string; error?: string } }) {
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
          {searchParams?.error ? <Panel className="text-sm text-redbrand">{searchParams.error}</Panel> : null}
          <Panel>
            <h2 className="mb-4 text-lg font-semibold text-ink">Verbindung</h2>
            <form action={saveIntegration} className="space-y-4">
              <label className="flex items-center gap-3 rounded-md bg-paper p-3 text-sm font-medium text-ink">
                <input name="enabled" type="checkbox" defaultChecked={integration?.enabled ?? true} className="h-4 w-4 accent-redbrand" />
                Shopify-Sync aktiv
              </label>
              <Field label="Shopify-Shop-Domain"><input className={inputClass} name="shopDomain" placeholder="meinshop.myshopify.com" defaultValue={integration?.shopDomain || ""} required /></Field>
              <Field label="Admin API Access Token">
                <input className={inputClass} name="accessToken" type="password" placeholder={integration?.accessTokenEnc ? `Gespeichert · endet auf ${tokenPreview(integration.accessTokenEnc)}` : "shpat_..."} />
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
            </p>
            <form action={runSync}>
              <SubmitButton pendingLabel="Produkte werden eingelesen..."><RefreshCw className="h-4 w-4" /> Produkte einlesen</SubmitButton>
            </form>
          </Panel>
          <Panel id="products">
            <h2 className="mb-4 text-lg font-semibold text-ink">Importierte Produkte</h2>
            <div className="space-y-3">
              {products.map((item) => (
                <form key={item.id} action={saveItem} className="rounded-lg border border-line bg-paper p-4">
                  <input type="hidden" name="id" value={item.id} />
                  <div className="grid gap-4 lg:grid-cols-[120px_1fr]">
                    <div className="aspect-square overflow-hidden rounded-md bg-surface">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.product.imageUrl || "/toy-placeholder.svg"} alt="" className="h-full w-full object-cover" />
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
                        <input name="visible" type="checkbox" defaultChecked={item.visible} className="h-4 w-4 accent-redbrand" />
                        Im Bondage-System anzeigen
                      </label>
                      <label className="flex items-center gap-3 text-sm font-medium text-ink">
                        <input name="showExternalLink" type="checkbox" defaultChecked={item.showExternalLink} className="h-4 w-4 accent-redbrand" />
                        Shopify-Link anzeigen
                      </label>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Field label="Sichtbarkeit">
                          <select className={selectClass} name="visibility" defaultValue={item.visibility}>
                            <option value="PRIVATE">Nur Benutzer</option>
                            <option value="PARTNER">Zirkel</option>
                            <option value="SHARED">Alle auf dieser Seite</option>
                          </select>
                        </Field>
                        <Field label="Zielbenutzer">
                          <select className={selectClass} name="targetUserId" defaultValue={item.targetUserId || ""}>
                            <option value="">Keiner</option>
                            {users.map((user) => <option key={user.id} value={user.id}>{user.profile?.displayName || user.name || user.username || user.email}</option>)}
                          </select>
                        </Field>
                        <Field label="Zielzirkel">
                          <select className={selectClass} name="targetCircleId" defaultValue={item.targetCircleId || ""}>
                            <option value="">Keiner</option>
                            {circles.map((circle) => <option key={circle.id} value={circle.id}>{circle.name}</option>)}
                          </select>
                        </Field>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <SubmitButton pendingLabel="Produkt wird gespeichert...">Produkt speichern</SubmitButton>
                        {item.visible ? <Link href={`/bondage-system/${item.product.slug}`} className="inline-flex min-h-10 items-center justify-center rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">Öffnen</Link> : null}
                      </div>
                    </div>
                  </div>
                </form>
              ))}
              {!products.length ? <p className="rounded-md border border-dashed border-line bg-paper p-4 text-sm text-graphite">Noch keine Produkte eingelesen.</p> : null}
            </div>
          </Panel>
        </div>
        <Panel className="h-fit text-sm leading-6 text-graphite">
          <h2 className="mb-2 text-base font-semibold text-ink">Shopify App</h2>
          <p>Lege in Shopify eine Custom App mit Admin-API-Zugriff auf Produkte an. Für v1 reichen Leserechte auf Produkte. Der Sync liest nur Produkte mit dem hier konfigurierten Tag.</p>
        </Panel>
      </div>
    </AppShell>
  );
}
