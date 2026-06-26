import { redirect } from "next/navigation";
import { BellRing, Send, Smartphone, Save } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Field, inputClass, PageGuide, PageHeader, Panel, selectClass } from "@/components/ui";
import { currentSessionContext } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { formatDateTime } from "@/lib/dates";
import { logAction, userDisplayName } from "@/lib/audit";
import { sendNativeTestPush } from "@/lib/native-push-notifications";
import { prisma } from "@/lib/prisma";

function secretPreview(value?: string | null) {
  if (!value) return "nicht gespeichert";
  return `gespeichert`;
}

function normalizePrivateKey(value: string) {
  return value.trim().replace(/\\n/g, "\n");
}

function userLabel(user: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null }) {
  return user.profile?.displayName || user.name || user.username || user.email || "Unbekannter Benutzer";
}

function deliveryTone(status: string) {
  return status === "SENT" ? "green" : status === "FAILED" ? "red" : "neutral";
}

async function requirePushAdmin() {
  const { actor, tenant } = await currentSessionContext();
  if (!actor) redirect("/login");
  if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") redirect("/");
  if (!tenant) redirect("/");
  return { actor, tenant };
}

async function savePushSettings(formData: FormData) {
  "use server";
  const { actor, tenant } = await requirePushAdmin();
  const existing = await prisma.nativePushSettings.findUnique({ where: { tenantId: tenant.id } });
  const privateKey = normalizePrivateKey(String(formData.get("privateKey") || ""));
  const teamId = String(formData.get("teamId") || "").trim();
  const keyId = String(formData.get("keyId") || "").trim();
  const bundleId = String(formData.get("bundleId") || "fspiel.playplaner").trim() || "fspiel.playplaner";
  const environment = String(formData.get("environment") || "production") === "sandbox" ? "sandbox" : "production";

  await prisma.nativePushSettings.upsert({
    where: { tenantId: tenant.id },
    update: {
      enabled: formData.get("enabled") === "on",
      teamId,
      keyId,
      bundleId,
      environment,
      ...(privateKey ? { privateKeyEnc: encryptSecret(privateKey) } : {})
    },
    create: {
      tenantId: tenant.id,
      enabled: formData.get("enabled") === "on",
      teamId,
      keyId,
      bundleId,
      environment,
      privateKeyEnc: encryptSecret(privateKey)
    }
  });

  await logAction({
    actorId: actor.id,
    action: "native_push_settings_updated",
    entityType: "tenant",
    entityId: tenant.id,
    title: `${userDisplayName(actor)} hat native Pushnachrichten gespeichert`,
    href: "/settings/push",
    details: {
      enabled: formData.get("enabled") === "on",
      hasTeamId: Boolean(teamId),
      hasKeyId: Boolean(keyId),
      hasBundleId: Boolean(bundleId),
      hasPrivateKey: Boolean(privateKey || existing?.privateKeyEnc),
      environment
    }
  });
  redirect("/settings/push?saved=1");
}

async function sendTestPush(formData: FormData) {
  "use server";
  const { actor, tenant } = await requirePushAdmin();
  const targetType = String(formData.get("targetType") || "self");
  const targetUserId = String(formData.get("targetUserId") || "");
  const targetCircleId = String(formData.get("targetCircleId") || "");
  let targetUserIds: string[] = [];
  if (targetType === "all") {
    const memberships = await prisma.tenantMembership.findMany({ where: { tenantId: tenant.id, active: true, user: { active: true } }, select: { userId: true } });
    targetUserIds = memberships.map((membership) => membership.userId);
  } else if (targetType === "circle" && targetCircleId) {
    const memberships = await prisma.tenantMembership.findMany({ where: { tenantId: tenant.id, circleId: targetCircleId, active: true, user: { active: true } }, select: { userId: true } });
    targetUserIds = memberships.map((membership) => membership.userId);
  } else if (targetType === "user" && targetUserId) {
    const membership = await prisma.tenantMembership.findFirst({ where: { tenantId: tenant.id, userId: targetUserId, active: true, user: { active: true } }, select: { userId: true } });
    targetUserIds = membership ? [membership.userId] : [];
  } else {
    targetUserIds = [actor.id];
  }
  const result = await sendNativeTestPush({
    tenantId: tenant.id,
    actorId: actor.id,
    targetUserIds,
    title: String(formData.get("title") || ""),
    body: String(formData.get("body") || "")
  });
  await logAction({
    actorId: actor.id,
    action: "native_push_test",
    entityType: "tenant",
    entityId: tenant.id,
    title: `${userDisplayName(actor)} hat einen Native-Push-Test ausgelöst`,
    href: "/settings/push",
    details: { targetType, targetUserCount: targetUserIds.length, ...result }
  });
  const params = new URLSearchParams({
    test: result.error || "done",
    sent: String(result.sent),
    failed: String(result.failed),
    devices: String(result.devices)
  });
  redirect(`/settings/push?${params.toString()}#test`);
}

export default async function PushSettingsPage({ searchParams }: { searchParams: { saved?: string; test?: string; sent?: string; failed?: string; devices?: string } }) {
  const { tenant } = await requirePushAdmin();
  const [settings, memberships, circles, devices, deliveries] = await Promise.all([
    prisma.nativePushSettings.findUnique({ where: { tenantId: tenant.id } }),
    prisma.tenantMembership.findMany({ where: { tenantId: tenant.id, active: true, user: { active: true } }, include: { user: { include: { profile: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.circle.findMany({ where: { tenantId: tenant.id }, orderBy: { name: "asc" } }),
    prisma.nativePushDevice.findMany({ where: { tenantId: tenant.id }, include: { user: { include: { profile: true } } }, orderBy: [{ disabledAt: "asc" }, { lastSeenAt: "desc" }], take: 80 }),
    prisma.nativePushDelivery.findMany({ where: { tenantId: tenant.id }, include: { user: { include: { profile: true } }, device: true }, orderBy: { createdAt: "desc" }, take: 50 })
  ]);
  const users = memberships.map((membership) => membership.user);
  const testText = searchParams.test
    ? searchParams.test === "missing_config"
      ? "Test nicht gesendet: Push ist nicht aktiv oder APNs-Daten sind unvollständig."
      : searchParams.test === "missing_targets"
        ? "Test nicht gesendet: kein Ziel ausgewählt."
        : searchParams.test === "missing_devices"
          ? "Test nicht gesendet: für dieses Ziel ist kein aktives Gerät registriert."
          : `Test abgeschlossen: ${searchParams.sent || 0} gesendet, ${searchParams.failed || 0} fehlgeschlagen, ${searchParams.devices || 0} Geräte.`
    : "";
  return (
    <AppShell>
      <PageHeader title="Push" subtitle="Native Pushnachrichten für die mobile App dieser Seite." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel>
          {searchParams.saved ? <p className="mb-4 rounded-md border border-line bg-paper p-3 text-sm text-graphite">Push-Einstellungen gespeichert.</p> : null}
          <form action={savePushSettings} className="space-y-5">
            <label className="flex items-start gap-3 rounded-lg border border-line bg-paper p-4 text-sm text-graphite">
              <input name="enabled" type="checkbox" defaultChecked={settings?.enabled || false} className="mt-1 h-4 w-4 accent-redbrand" />
              <span>
                <strong className="block text-ink">Native Pushnachrichten aktivieren</strong>
                <span>Wenn diese Option aus ist oder Daten fehlen, werden Geräte weiter registriert, aber es wird nichts an APNs gesendet.</span>
              </span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Apple Team ID"><input className={inputClass} name="teamId" defaultValue={settings?.teamId || ""} /></Field>
              <Field label="Key ID"><input className={inputClass} name="keyId" defaultValue={settings?.keyId || ""} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Bundle ID"><input className={inputClass} name="bundleId" defaultValue={settings?.bundleId || "fspiel.playplaner"} /></Field>
              <Field label="APNs Umgebung">
                <select className={selectClass} name="environment" defaultValue={settings?.environment || "production"}>
                  <option value="production">Production</option>
                  <option value="sandbox">Sandbox</option>
                </select>
              </Field>
            </div>
            <Field label={`APNs Private Key (${secretPreview(settings?.privateKeyEnc)})`}>
              <textarea className={inputClass} name="privateKey" rows={8} placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----" />
            </Field>
            <p className="text-xs leading-5 text-graphite">Das Private-Key-Feld darf leer bleiben, wenn bereits ein Key gespeichert ist. Ein neuer Key überschreibt den alten verschlüsselt in der Datenbank.</p>
            <SubmitButton pendingLabel="Push wird gespeichert..."><Save className="h-4 w-4" /> Push speichern</SubmitButton>
          </form>
        </Panel>
        <Panel id="test">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-ink"><Send className="h-5 w-5" /> Test-Push senden</h2>
          {testText ? <p className="mb-4 rounded-md border border-line bg-paper p-3 text-sm font-semibold text-graphite">{testText}</p> : null}
          <form action={sendTestPush} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Ziel">
                <select className={selectClass} name="targetType" defaultValue="self">
                  <option value="self">Mein Benutzer</option>
                  <option value="user">Benutzer</option>
                  <option value="circle">Kreis</option>
                  <option value="all">Alle auf dieser Seite</option>
                </select>
              </Field>
              <Field label="Benutzer">
                <select className={selectClass} name="targetUserId" defaultValue="">
                  <option value="">auswählen</option>
                  {users.map((user) => <option key={user.id} value={user.id}>{userLabel(user)}</option>)}
                </select>
              </Field>
              <Field label="Kreis">
                <select className={selectClass} name="targetCircleId" defaultValue="">
                  <option value="">auswählen</option>
                  {circles.map((circle) => <option key={circle.id} value={circle.id}>{circle.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Titel"><input className={inputClass} name="title" defaultValue="Playplaner Test" /></Field>
              <Field label="Nachricht"><input className={inputClass} name="body" defaultValue="Wenn du das siehst, ist native Push eingerichtet." /></Field>
            </div>
            <SubmitButton pendingLabel="Test wird gesendet..."><Send className="h-4 w-4" /> Test-Push senden</SubmitButton>
          </form>
        </Panel>
        <Panel>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-ink"><Smartphone className="h-5 w-5" /> Registrierte Geräte</h2>
          <div className="space-y-3">
            {devices.map((device) => (
              <div key={device.id} className="rounded-md border border-line bg-paper p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <strong className="block text-ink">{device.deviceName || "iOS-Gerät"}</strong>
                    <span className="text-graphite">{userLabel(device.user)} · {device.environment} · Token endet auf {device.deviceToken.slice(-6)}</span>
                  </div>
                  <Badge tone={device.disabledAt ? "red" : "green"}>{device.disabledAt ? "deaktiviert" : "aktiv"}</Badge>
                </div>
                <div className="mt-2 text-xs text-graphite">Letzter Kontakt: {formatDateTime(device.lastSeenAt)} · App: {device.appVersion || "-"}</div>
              </div>
            ))}
            {!devices.length ? <p className="rounded-md border border-dashed border-line bg-paper p-4 text-sm text-graphite">Noch kein iPhone oder iPad registriert. Die App muss Push erlauben und sich einmal beim Backend melden.</p> : null}
          </div>
        </Panel>
        <Panel>
          <h2 className="mb-3 text-lg font-semibold text-ink">Letzte Zustellversuche</h2>
          <div className="space-y-3">
            {deliveries.map((delivery) => (
              <details key={delivery.id} className="rounded-md border border-line bg-paper p-3 text-sm">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
                  <span>
                    <strong className="block text-ink">{delivery.action}</strong>
                    <span className="text-graphite">{userLabel(delivery.user)} · {formatDateTime(delivery.createdAt)} · HTTP {delivery.statusCode || "-"}</span>
                  </span>
                  <Badge tone={deliveryTone(delivery.status)}>{delivery.status}</Badge>
                </summary>
                <div className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-graphite">
                  <div>APNs-ID: {delivery.apnsId || "-"}</div>
                  <div>Gerät: {delivery.device?.deviceName || "-"} · {delivery.device?.environment || "-"}</div>
                  {delivery.error ? <pre className="mt-2 whitespace-pre-wrap rounded-md bg-surface p-3 text-xs text-ink">{delivery.error}</pre> : null}
                </div>
              </details>
            ))}
            {!deliveries.length ? <p className="rounded-md border border-dashed border-line bg-paper p-4 text-sm text-graphite">Noch keine Zustellversuche protokolliert.</p> : null}
          </div>
        </Panel>
        <PageGuide title="Native Pushnachrichten">
          <span className="inline-flex items-center gap-2"><BellRing className="h-4 w-4" /> Hier hinterlegst du die APNs-Daten aus Apple Developer für diese Seite. Diese Werte werden nicht als Start-Umgebungsvariablen verwendet, sondern kontrolliert im Backend gespeichert.</span>
        </PageGuide>
      </div>
    </AppShell>
  );
}
