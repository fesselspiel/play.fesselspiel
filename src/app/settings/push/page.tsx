import Link from "next/link";
import { redirect } from "next/navigation";
import { BellRing, ChevronDown, Clock3, Save, Send, Smartphone, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Button, Field, inputClass, PageGuide, PageHeader, Panel, selectClass } from "@/components/ui";
import { currentSessionContext } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { formatDateTime } from "@/lib/dates";
import { logAction, userDisplayName } from "@/lib/audit";
import { actionLabel, notificationActionOptions } from "@/lib/notification-actions";
import { nativePushSounds, sendNativeTestPush, testNativePushNotificationRule } from "@/lib/native-push-notifications";
import { prisma } from "@/lib/prisma";

function secretPreview(value?: string | null) {
  return value ? "gespeichert" : "nicht gespeichert";
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

function targetTypeFor(rule: { targetAll?: boolean; targetUserId?: string | null; targetCircleId?: string | null }) {
  if (rule.targetAll) return "all";
  if (rule.targetUserId) return "user";
  if (rule.targetCircleId) return "circle";
  return "none";
}

function targetLabel(rule: { targetAll?: boolean; targetUser?: Parameters<typeof userLabel>[0] | null; targetCircle?: { name: string } | null }) {
  if (rule.targetAll) return "Alle auf dieser Seite";
  if (rule.targetUser) return userLabel(rule.targetUser);
  if (rule.targetCircle) return `Kreis ${rule.targetCircle.name}`;
  return "-";
}

function pushTargetFields({
  users,
  circles,
  targetType = "none",
  targetUserId = "",
  targetCircleId = ""
}: {
  users: { id: string; label: string }[];
  circles: { id: string; name: string }[];
  targetType?: string;
  targetUserId?: string | null;
  targetCircleId?: string | null;
}) {
  return (
    <>
      <Field label="Ziel">
        <select className={selectClass} name="targetType" defaultValue={targetType}>
          <option value="none">Bitte auswählen</option>
          <option value="all">Alle auf dieser Seite</option>
          <option value="user">Ein Benutzer</option>
          <option value="circle">Ganzer Kreis</option>
        </select>
      </Field>
      <Field label="Ziel-Benutzer">
        <select className={selectClass} name="targetUserId" defaultValue={targetUserId || ""}>
          <option value="">nur bei Benutzer-Ziel</option>
          {users.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
        </select>
      </Field>
      <Field label="Ziel-Kreis">
        <select className={selectClass} name="targetCircleId" defaultValue={targetCircleId || ""}>
          <option value="">nur bei Kreis-Ziel</option>
          {circles.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </Field>
    </>
  );
}

function dateKey(date: Date) {
  return new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function hourKey(date: Date) {
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit" }).format(date);
}

function groupDeliveries<T extends { createdAt: Date }>(entries: T[]) {
  const days = new Map<string, { key: string; label: string; count: number; hours: Map<string, T[]> }>();
  for (const entry of entries) {
    const day = dateKey(entry.createdAt);
    const hour = `${hourKey(entry.createdAt)} Uhr`;
    if (!days.has(day)) days.set(day, { key: day, label: day, count: 0, hours: new Map() });
    const group = days.get(day)!;
    group.count += 1;
    group.hours.set(hour, [...(group.hours.get(hour) || []), entry]);
  }
  return Array.from(days.values()).map((day) => ({ ...day, hours: Array.from(day.hours.entries()) }));
}

async function requirePushAdmin() {
  const { actor, tenant } = await currentSessionContext();
  if (!actor) redirect("/login");
  if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") redirect("/");
  if (!tenant) redirect("/");
  return { actor, tenant };
}

function targetData(formData: FormData) {
  const targetType = String(formData.get("targetType") || "none");
  return {
    targetAll: targetType === "all",
    targetUserId: targetType === "user" ? String(formData.get("targetUserId") || "") || null : null,
    targetCircleId: targetType === "circle" ? String(formData.get("targetCircleId") || "") || null : null
  };
}

function soundValue(formData: FormData) {
  const value = String(formData.get("sound") || "playplaner_chime.caf");
  return nativePushSounds.some((sound) => sound.value === value) ? value : "playplaner_chime.caf";
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
    body: String(formData.get("body") || ""),
    sound: soundValue(formData)
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
  const params = new URLSearchParams({ test: result.error || "done", sent: String(result.sent), failed: String(result.failed), devices: String(result.devices) });
  redirect(`/settings/push?${params.toString()}#test`);
}

async function createPushNotificationRule(formData: FormData) {
  "use server";
  const { tenant } = await requirePushAdmin();
  const action = String(formData.get("action") || "").trim();
  const titleTemplate = String(formData.get("titleTemplate") || "{event}").trim() || "{event}";
  const bodyTemplate = String(formData.get("bodyTemplate") || "{title}").trim() || "{title}";
  const target = targetData(formData);
  if (!action || (!target.targetAll && !target.targetUserId && !target.targetCircleId)) redirect("/settings/push#notifications");
  await prisma.nativePushNotificationRule.create({ data: { tenantId: tenant.id, action, titleTemplate, bodyTemplate, sound: soundValue(formData), ...target } });
  redirect("/settings/push#notifications");
}

async function updatePushNotificationRule(formData: FormData) {
  "use server";
  const { tenant } = await requirePushAdmin();
  const id = String(formData.get("ruleId") || "");
  const action = String(formData.get("action") || "").trim();
  const target = targetData(formData);
  if (!id || !action || (!target.targetAll && !target.targetUserId && !target.targetCircleId)) redirect("/settings/push#notifications");
  await prisma.nativePushNotificationRule.updateMany({
    where: { id, tenantId: tenant.id },
    data: {
      action,
      titleTemplate: String(formData.get("titleTemplate") || "{event}").trim() || "{event}",
      bodyTemplate: String(formData.get("bodyTemplate") || "{title}").trim() || "{title}",
      sound: soundValue(formData),
      active: formData.get("active") === "on",
      ...target
    }
  });
  redirect("/settings/push#notifications");
}

async function deletePushNotificationRule(formData: FormData) {
  "use server";
  const { tenant } = await requirePushAdmin();
  await prisma.nativePushNotificationRule.deleteMany({ where: { id: String(formData.get("ruleId") || ""), tenantId: tenant.id } });
  redirect("/settings/push#notifications");
}

async function testPushNotificationRule(formData: FormData) {
  "use server";
  const { actor, tenant } = await requirePushAdmin();
  const rule = await prisma.nativePushNotificationRule.findFirst({ where: { id: String(formData.get("ruleId") || ""), tenantId: tenant.id }, select: { id: true } });
  if (!rule) redirect("/settings/push#notifications");
  const result = await testNativePushNotificationRule(rule.id, actor.id);
  redirect(`/settings/push?ruleTest=${result.error || "done"}&ruleSent=${result.sent}&ruleFailed=${result.failed}&ruleDevices=${result.devices}#notifications`);
}

export default async function PushSettingsPage({ searchParams }: { searchParams: { saved?: string; test?: string; sent?: string; failed?: string; devices?: string; action?: string; ruleTest?: string; ruleSent?: string; ruleFailed?: string; ruleDevices?: string; logLimit?: string } }) {
  const { tenant } = await requirePushAdmin();
  const requestedAction = String(searchParams.action || "").trim();
  const logLimit = Math.min(500, Math.max(120, Number(searchParams.logLimit || 120)));
  const [settings, memberships, circles, devices, deliveries, rules, auditActions] = await Promise.all([
    prisma.nativePushSettings.findUnique({ where: { tenantId: tenant.id } }),
    prisma.tenantMembership.findMany({ where: { tenantId: tenant.id, active: true, user: { active: true } }, include: { user: { include: { profile: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.circle.findMany({ where: { tenantId: tenant.id }, orderBy: { name: "asc" } }),
    prisma.nativePushDevice.findMany({ where: { tenantId: tenant.id }, include: { user: { include: { profile: true } } }, orderBy: [{ disabledAt: "asc" }, { lastSeenAt: "desc" }], take: 80 }),
    prisma.nativePushDelivery.findMany({ where: { tenantId: tenant.id }, include: { user: { include: { profile: true } }, device: true }, orderBy: { createdAt: "desc" }, take: logLimit }),
    prisma.nativePushNotificationRule.findMany({ where: { tenantId: tenant.id }, include: { targetUser: { include: { profile: true } }, targetCircle: true }, orderBy: [{ active: "desc" }, { updatedAt: "desc" }] }),
    prisma.auditLog.findMany({ where: { actor: { tenantId: tenant.id } }, distinct: ["action"], select: { action: true }, take: 300, orderBy: { createdAt: "desc" } })
  ]);
  const users = memberships.map((membership) => membership.user);
  const targetUsers = users.map((user) => ({ id: user.id, label: userLabel(user) }));
  const actionOptions = await notificationActionOptions({ tenantId: tenant.id, auditActions: [...auditActions.map((entry) => entry.action), ...rules.map((rule) => rule.action)], requestedAction });
  const testText = searchParams.test
    ? searchParams.test === "missing_config"
      ? "Test nicht gesendet: Push ist nicht aktiv oder APNs-Daten sind unvollständig."
      : searchParams.test === "missing_targets"
        ? "Test nicht gesendet: kein Ziel ausgewählt."
        : searchParams.test === "missing_devices"
          ? "Test nicht gesendet: für dieses Ziel ist kein aktives Gerät registriert."
          : `Test abgeschlossen: ${searchParams.sent || 0} gesendet, ${searchParams.failed || 0} fehlgeschlagen, ${searchParams.devices || 0} Geräte.`
    : "";
  const ruleTestText = searchParams.ruleTest
    ? searchParams.ruleTest === "missing_config"
      ? "Regeltest nicht gesendet: Push ist nicht aktiv oder APNs-Daten sind unvollständig."
      : searchParams.ruleTest === "missing_targets"
        ? "Regeltest nicht gesendet: kein Ziel ausgewählt."
        : searchParams.ruleTest === "missing_devices"
          ? "Regeltest nicht gesendet: für dieses Ziel ist kein aktives Gerät registriert."
          : `Regeltest abgeschlossen: ${searchParams.ruleSent || 0} gesendet, ${searchParams.ruleFailed || 0} fehlgeschlagen, ${searchParams.ruleDevices || 0} Geräte.`
    : "";
  const deliveryGroups = groupDeliveries(deliveries);

  return (
    <AppShell>
      <PageHeader title="Push" subtitle="Native Pushnachrichten für die mobile App dieser Seite." />
      <PageGuide title="Native Pushnachrichten">
        APNs-Daten werden pro Seite verschlüsselt gespeichert. Aktionsregeln entscheiden, welches Event an welchen Benutzer, Kreis oder alle Geräte gepusht wird.
      </PageGuide>
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-6">
        <Panel className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-paper text-redbrand"><BellRing className="h-5 w-5" /></span>
            <div>
              <h2 className="font-semibold text-ink">Push-Zentrale</h2>
              <p className="text-sm text-graphite">{devices.length} registrierte Geräte · {rules.length} Aktionsregeln · {deliveries.length} geladene Zustellversuche</p>
            </div>
          </div>
          <Badge tone={settings?.enabled ? "green" : "neutral"}>{settings?.enabled ? "aktiv" : "inaktiv"}</Badge>
        </Panel>

        <Panel className="p-0">
          <details open>
            <summary className="focus-ring flex min-h-14 cursor-pointer list-none items-center gap-2 px-5 py-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
              <ChevronDown className="h-5 w-5 text-redbrand" /> APNs-Konfiguration
            </summary>
            <div className="space-y-5 border-t border-line p-5">
              {searchParams.saved ? <p className="rounded-md border border-line bg-paper p-3 text-sm text-graphite">Push-Einstellungen gespeichert.</p> : null}
              <form action={savePushSettings} className="space-y-5">
                <label className="flex items-start gap-3 rounded-lg border border-line bg-paper p-4 text-sm text-graphite">
                  <input name="enabled" type="checkbox" defaultChecked={settings?.enabled || false} className="mt-1 h-4 w-4 accent-redbrand" />
                  <span><strong className="block text-ink">Native Pushnachrichten aktivieren</strong><span>Wenn diese Option aus ist oder Daten fehlen, werden Geräte registriert, aber es wird nichts an APNs gesendet.</span></span>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Apple Team ID"><input className={inputClass} name="teamId" defaultValue={settings?.teamId || ""} /></Field>
                  <Field label="Key ID"><input className={inputClass} name="keyId" defaultValue={settings?.keyId || ""} /></Field>
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
                <SubmitButton pendingLabel="Push wird gespeichert..."><Save className="h-4 w-4" /> Push speichern</SubmitButton>
              </form>
            </div>
          </details>
        </Panel>

        <Panel className="p-0" id="test">
          <details>
            <summary className="focus-ring flex min-h-14 cursor-pointer list-none items-center gap-2 px-5 py-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
              <ChevronDown className="h-5 w-5 text-redbrand" /> Test-Push senden
            </summary>
            <div className="space-y-4 border-t border-line p-5">
              {testText ? <p className="rounded-md border border-line bg-paper p-3 text-sm font-semibold text-graphite">{testText}</p> : null}
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
                  <Field label="Ton">
                    <select className={selectClass} name="sound" defaultValue="playplaner_chime.caf">
                      {nativePushSounds.map((sound) => <option key={sound.value} value={sound.value}>{sound.label}</option>)}
                    </select>
                  </Field>
                </div>
                <SubmitButton pendingLabel="Test wird gesendet..."><Send className="h-4 w-4" /> Test-Push senden</SubmitButton>
              </form>
            </div>
          </details>
        </Panel>

        <Panel className="p-0" id="notifications">
          <details open={Boolean(requestedAction)}>
            <summary className="focus-ring flex min-h-14 cursor-pointer list-none items-center gap-2 px-5 py-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
              <ChevronDown className="h-5 w-5 text-redbrand" /> Aktions-Pushnachrichten
            </summary>
            <div className="space-y-4 border-t border-line p-5">
              <p className="text-sm leading-6 text-graphite">Sende bei protokollierten Aktionen automatisch native Pushnachrichten an einen Benutzer, einen Kreis oder alle Benutzer dieser Seite.</p>
              {ruleTestText ? <p className="rounded-md border border-line bg-paper p-3 text-sm font-semibold text-graphite">{ruleTestText}</p> : null}
              <form action={createPushNotificationRule} className="space-y-4 rounded-md border border-line bg-paper p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Aktion">
                    <select className={selectClass} name="action" defaultValue={requestedAction || actionOptions[0]?.action || ""} required>
                      {actionOptions.map((option) => <option key={option.action} value={option.action}>{option.label}</option>)}
                    </select>
                  </Field>
                  {pushTargetFields({ users: targetUsers, circles, targetType: "none" })}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Push-Titel"><input className={inputClass} name="titleTemplate" defaultValue="{event}" /></Field>
                  <Field label="Push-Text"><input className={inputClass} name="bodyTemplate" defaultValue="{title}" /></Field>
                  <Field label="Ton">
                    <select className={selectClass} name="sound" defaultValue="playplaner_chime.caf">
                      {nativePushSounds.map((sound) => <option key={sound.value} value={sound.value}>{sound.label}</option>)}
                    </select>
                  </Field>
                </div>
                <p className="text-xs text-graphite">Variablen: {"{title}"}, {"{actor}"}, {"{event}"}, {"{action}"}, {"{url}"}, {"{entityType}"}, {"{entityId}"}, {"{details}"}</p>
                <SubmitButton pendingLabel="Regel wird gespeichert..."><Save className="h-4 w-4" /> Regel anlegen</SubmitButton>
              </form>
              <div className="space-y-3">
                {rules.map((rule) => (
                  <details key={rule.id} className="rounded-md border border-line bg-paper p-3">
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0">
                        <strong className="block truncate">{actionLabel(rule.action)}</strong>
                        <span className="mt-1 block text-sm text-graphite">Ziel: {targetLabel(rule)}</span>
                        <span className="mt-1 block text-sm text-graphite">Titel: {rule.titleTemplate} · Text: {rule.bodyTemplate}</span>
                        <span className="mt-1 block text-sm text-graphite">Ton: {nativePushSounds.find((sound) => sound.value === rule.sound)?.label || rule.sound}</span>
                      </span>
                      <Badge tone={rule.active ? "green" : "neutral"}>{rule.active ? "aktiv" : "inaktiv"}</Badge>
                    </summary>
                    <form action={updatePushNotificationRule} className="mt-4 space-y-4 border-t border-line pt-4">
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Aktion">
                          <select className={selectClass} name="action" defaultValue={rule.action} required>
                            {actionOptions.map((option) => <option key={option.action} value={option.action}>{option.label}</option>)}
                          </select>
                        </Field>
                        {pushTargetFields({ users: targetUsers, circles, targetType: targetTypeFor(rule), targetUserId: rule.targetUserId, targetCircleId: rule.targetCircleId })}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Push-Titel"><input className={inputClass} name="titleTemplate" defaultValue={rule.titleTemplate} /></Field>
                        <Field label="Push-Text"><input className={inputClass} name="bodyTemplate" defaultValue={rule.bodyTemplate} /></Field>
                        <Field label="Ton">
                          <select className={selectClass} name="sound" defaultValue={rule.sound || "playplaner_chime.caf"}>
                            {nativePushSounds.map((sound) => <option key={sound.value} value={sound.value}>{sound.label}</option>)}
                          </select>
                        </Field>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-graphite">
                        <input name="active" type="checkbox" defaultChecked={rule.active} className="h-4 w-4 accent-redbrand" />
                        aktiv
                      </label>
                      <SubmitButton pendingLabel="Regel wird gespeichert..."><Save className="h-4 w-4" /> Regel speichern</SubmitButton>
                    </form>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <form action={testPushNotificationRule}>
                        <input type="hidden" name="ruleId" value={rule.id} />
                        <Button><Send className="h-4 w-4" /> Test senden</Button>
                      </form>
                      <form action={deletePushNotificationRule}>
                        <input type="hidden" name="ruleId" value={rule.id} />
                        <Button variant="danger"><Trash2 className="h-4 w-4" /> Regel löschen</Button>
                      </form>
                    </div>
                  </details>
                ))}
                {!rules.length ? <p className="rounded-md border border-dashed border-line bg-paper p-4 text-sm text-graphite">Noch keine aktionsbasierten Push-Regeln angelegt.</p> : null}
              </div>
            </div>
          </details>
        </Panel>
        </div>

        <div className="space-y-6">
        <Panel className="p-0">
          <details>
            <summary className="focus-ring flex min-h-14 cursor-pointer list-none items-center gap-2 px-5 py-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
              <Smartphone className="h-5 w-5 text-redbrand" /> Registrierte Geräte
            </summary>
            <div className="space-y-3 border-t border-line p-5">
              {devices.map((device) => (
                <div key={device.id} className="rounded-md border border-line bg-paper p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div><strong className="block text-ink">{device.deviceName || "iOS-Gerät"}</strong><span className="text-graphite">{userLabel(device.user)} · {device.environment} · Token endet auf {device.deviceToken.slice(-6)}</span></div>
                    <Badge tone={device.disabledAt ? "red" : "green"}>{device.disabledAt ? "deaktiviert" : "aktiv"}</Badge>
                  </div>
                  <div className="mt-2 text-xs text-graphite">Letzter Kontakt: {formatDateTime(device.lastSeenAt)} · App: {device.appVersion || "-"}</div>
                </div>
              ))}
              {!devices.length ? <p className="rounded-md border border-dashed border-line bg-paper p-4 text-sm text-graphite">Noch kein iPhone oder iPad registriert.</p> : null}
            </div>
          </details>
        </Panel>

        <Panel className="p-0" id="deliveries">
          <details open>
            <summary className="focus-ring flex min-h-14 cursor-pointer list-none items-center gap-2 px-5 py-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
              <Clock3 className="h-5 w-5 text-redbrand" /> Zustellprotokoll
            </summary>
            <div className="space-y-4 border-t border-line p-5">
              {deliveryGroups.map((day, dayIndex) => (
                <details key={day.key} open={dayIndex === 0} className="overflow-hidden rounded-lg border border-line bg-surface">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-paper px-4 py-3 font-semibold text-ink [&::-webkit-details-marker]:hidden">
                    <span>{day.label}</span><span className="text-sm font-medium text-graphite">{day.count} Einträge</span>
                  </summary>
                  <div className="divide-y divide-line">
                    {day.hours.map(([hour, hourEntries], hourIndex) => (
                      <details key={hour} open={dayIndex === 0 && hourIndex === 0}>
                        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-graphite hover:bg-paper [&::-webkit-details-marker]:hidden">
                          <Clock3 className="h-4 w-4 text-redbrand" /> {hour}<span className="ml-auto text-xs font-medium">{hourEntries.length}</span>
                        </summary>
                        <div className="space-y-2 bg-canvas/40 px-3 pb-3">
                          {hourEntries.map((delivery) => (
                            <details key={delivery.id} className="rounded-md border border-line bg-paper p-3 text-sm">
                              <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
                                <span><strong className="block text-ink">{actionLabel(delivery.action)}</strong><span className="text-graphite">{userLabel(delivery.user)} · {formatDateTime(delivery.createdAt)} · HTTP {delivery.statusCode || "-"}</span></span>
                                <Badge tone={deliveryTone(delivery.status)}>{delivery.status}</Badge>
                              </summary>
                              <div className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-graphite">
                                <div>APNs-ID: {delivery.apnsId || "-"}</div>
                                <div>Gerät: {delivery.device?.deviceName || "-"} · {delivery.device?.environment || "-"}</div>
                                {delivery.error ? <pre className="mt-2 whitespace-pre-wrap rounded-md bg-surface p-3 text-xs text-ink">{delivery.error}</pre> : null}
                              </div>
                            </details>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                </details>
              ))}
              {!deliveries.length ? <p className="rounded-md border border-dashed border-line bg-paper p-4 text-sm text-graphite">Noch keine Zustellversuche protokolliert.</p> : null}
              {deliveries.length >= logLimit && logLimit < 500 ? (
                <Link href={`/settings/push?logLimit=${Math.min(500, logLimit + 120)}#deliveries`} className="focus-ring inline-flex min-h-10 items-center justify-center rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-paper">
                  Mehr laden
                </Link>
              ) : null}
            </div>
          </details>
        </Panel>

        </div>
      </div>
    </AppShell>
  );
}
