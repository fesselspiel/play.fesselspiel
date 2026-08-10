import { redirect } from "next/navigation";
import { Activity, BookOpen, Cpu, FlaskConical, RadioTower } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AutomationCapabilityManager, AutomationDeviceManager } from "@/components/automation-device-manager";
import { AutomationRuleEditor } from "@/components/automation-rule-editor";
import { SubmitButton } from "@/components/submit-button";
import { Field, inputClass, PageGuide, PageHeader, Panel } from "@/components/ui";
import { actionLabels, automationRuleFlow, automationRuleSummary, labelAutomationValue, ruleFormFromStored, validateAutomationRulePayload, type AutomationActionKey } from "@/lib/automation-rule-model";
import { currentUser } from "@/lib/auth";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";
import { rotateMqttCredentials, writeMosquittoRuntimeFiles } from "@/lib/mqtt-bridge";
import { createAutomationRule, recordAutomationEvent, upsertAutomationCapability, upsertAutomationDevice } from "@/lib/session-automation";

function requireAdmin(user: { role?: string }) {
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/");
}

function parseJson(value: FormDataEntryValue | null, fallback: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function parseList(value: FormDataEntryValue | null) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function jsonRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberField(formData: FormData, name: string, fallback: number) {
  const value = Number(formData.get(name));
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
}

function stringField(formData: FormData, name: string, fallback = "") {
  return String(formData.get(name) || fallback).trim();
}

function capabilityParametersFromForm(formData: FormData, kind: string, current: Record<string, unknown> = {}) {
  if (kind === "Camera") {
    return {
      dataPoint: stringField(formData, "dataPoint", String(current.dataPoint || "")) || null,
      timeoutSeconds: numberField(formData, "timeoutSeconds", Number(current.timeoutSeconds || 20)),
      lastImageMaxAgeSeconds: numberField(formData, "lastImageMaxAgeSeconds", Number(current.lastImageMaxAgeSeconds || 60)),
      bootDelaySeconds: numberField(formData, "bootDelaySeconds", Number(current.bootDelaySeconds || 20))
    };
  }
  if (kind === "Switch") {
    return {
      dataPoint: stringField(formData, "dataPoint", String(current.dataPoint || "")) || null,
      onValue: stringField(formData, "onValue", String(current.onValue || "true")) || "true",
      offValue: stringField(formData, "offValue", String(current.offValue || "false")) || "false"
    };
  }
  if (kind === "Voice") {
    return {
      dataPoint: stringField(formData, "dataPoint", String(current.dataPoint || "")) || null,
      prefix: stringField(formData, "voicePrefix", String(current.prefix || "")) || null
    };
  }
  return current;
}

function displayUserName(user: { name?: string | null; username?: string | null; email?: string | null; profile?: { displayName?: string | null } | null } | null) {
  if (!user) return "";
  return user.profile?.displayName || user.name || user.username || user.email || "Unbekannter Benutzer";
}

function formatAutomationEventTime(date: Date) {
  return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatAutomationEventDate(date: Date) {
  return date.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}

function automationEventTitle(event: { type: string; title: string }) {
  const label = labelAutomationValue("eventTypes", event.type);
  return label === event.type ? event.title : label;
}

function automationActionTitle(type: string) {
  return actionLabels[type as AutomationActionKey] || type;
}

function humanDetailValue(value: unknown) {
  if (value instanceof Date) return formatAutomationEventDate(value);
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return formatAutomationEventDate(date);
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}

function humanAutomationDetailEntries(details: Record<string, unknown>) {
  const labels: Record<string, string> = {
    version: "Regelversion",
    descriptionText: "Beschreibung",
    name: "Name",
    title: "Titel",
    reason: "Grund",
    status: "Status",
    state: "Zustand",
    health: "Verbindung",
    dueAt: "Fällig",
    pendingEndAt: "Vorgemerkter Endzeitpunkt",
    resolvedDelayMinutes: "Berechnete Wartezeit",
    delayMinutes: "Wartezeit",
    minMinutes: "Minimale Wartezeit",
    maxMinutes: "Maximale Wartezeit",
    timeoutSeconds: "Timeout",
    maxRetries: "Wiederholungen",
    bootDelaySeconds: "Boot-Wartezeit",
    actionCount: "Anzahl Aktionen",
    capabilities: "Anzahl Fähigkeiten",
    requestId: "Bildanforderung",
    actionTitle: "Aktion",
    error: "Fehler"
  };
  return Object.entries(details)
    .filter(([key]) => labels[key])
    .map(([key, value]) => {
      const statusValue = key === "status" ? labelAutomationValue("actionStatuses", String(value || "")) : null;
      const stateValue = key === "state" ? labelAutomationValue("states", String(value || "")) : null;
      const healthValue = key === "health" ? labelAutomationValue("health", String(value || "")) : null;
      return [labels[key], statusValue || stateValue || healthValue || humanDetailValue(value)] as const;
    });
}

async function saveBridge(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  requireAdmin(user);
  await requireFeature("automation");
  if (!user.tenantId) redirect("/settings/automation?error=tenant");
  await prisma.automationBridge.upsert({
    where: { tenantId: user.tenantId },
    update: {
      enabled: formData.get("enabled") === "on",
      mqttBaseTopic: String(formData.get("mqttBaseTopic") || "playplaner/v1"),
      mqttClientId: String(formData.get("mqttClientId") || "") || null,
      mqttUsername: String(formData.get("mqttUsername") || "") || null,
      health: String(formData.get("health") || "UNKNOWN")
    },
    create: {
      tenantId: user.tenantId,
      enabled: formData.get("enabled") === "on",
      mqttBaseTopic: String(formData.get("mqttBaseTopic") || "playplaner/v1"),
      mqttClientId: String(formData.get("mqttClientId") || "") || null,
      mqttUsername: String(formData.get("mqttUsername") || "") || null,
      health: String(formData.get("health") || "UNKNOWN")
    }
  });
  await writeMosquittoRuntimeFiles();
  redirect("/settings/automation?saved=bridge");
}

async function rotateMqtt(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  requireAdmin(user);
  await requireFeature("automation");
  if (!user.tenantId) redirect("/settings/automation?error=tenant");
  const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { slug: true } });
  const username = String(formData.get("mqttUsername") || "").trim();
  const baseTopic = String(formData.get("mqttBaseTopic") || "").trim();
  const result = await rotateMqttCredentials({
    tenantId: user.tenantId,
    tenantSlug: tenant?.slug,
    username: username || null,
    baseTopic: baseTopic || null
  });
  redirect(`/settings/automation?mqttPassword=${encodeURIComponent(result.password)}&mqttUser=${encodeURIComponent(result.bridge.mqttUsername || "")}`);
}

async function saveDevice(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  requireAdmin(user);
  await requireFeature("automation");
  if (!user.tenantId) redirect("/settings/automation?error=tenant");
  const device = await upsertAutomationDevice({
    tenantId: user.tenantId,
    logicalId: String(formData.get("logicalId") || "").trim(),
    name: String(formData.get("name") || "").trim(),
    integration: String(formData.get("integration") || "IOBROKER"),
    health: String(formData.get("health") || "UNKNOWN"),
    metadata: parseJson(formData.get("metadataJson"), {})
  });
  const capabilityKeys = formData.getAll("capabilityKey").map((item) => String(item || "").trim()).filter(Boolean);
  const capabilityKinds = formData.getAll("capabilityKind").map((item) => String(item || "").trim());
  const capabilityTitles = formData.getAll("capabilityTitle").map((item) => String(item || "").trim());
  const capabilityStates = formData.getAll("capabilityState").map((item) => String(item || "").trim());
  const actionsLists = formData.getAll("actionsList");
  const eventsLists = formData.getAll("eventsList");
  const conditionsLists = formData.getAll("conditionsList");
  const parametersJsons = formData.getAll("parametersJson");
  for (const [index, capabilityKey] of capabilityKeys.entries()) {
    await upsertAutomationCapability({
      tenantId: user.tenantId,
      deviceId: device.id,
      key: capabilityKey,
      kind: capabilityKinds[index] || "Camera",
      title: capabilityTitles[index] || capabilityKey,
      state: capabilityStates[index] || "UNKNOWN",
      actions: parseList(actionsLists[index] || null),
      events: parseList(eventsLists[index] || null),
      conditions: parseList(conditionsLists[index] || null),
      parameters: parseJson(parametersJsons[index] || null, {}),
      ui: {}
    });
  }
  redirect("/settings/automation?saved=device");
}

async function updateDevice(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  requireAdmin(user);
  await requireFeature("automation");
  if (!user.tenantId) redirect("/settings/automation?error=tenant");
  const deviceId = String(formData.get("deviceId") || "");
  const device = await prisma.automationDevice.findFirst({ where: { id: deviceId, tenantId: user.tenantId } });
  if (!device) redirect("/settings/automation?error=Gerät nicht gefunden");
  await prisma.automationDevice.update({
    where: { id: device.id },
    data: {
      name: String(formData.get("name") || device.name).trim() || device.name,
      integration: String(formData.get("integration") || device.integration),
      health: String(formData.get("health") || device.health)
    }
  });
  redirect("/settings/automation?saved=device");
}

async function deleteDevice(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  requireAdmin(user);
  await requireFeature("automation");
  if (!user.tenantId) redirect("/settings/automation?error=tenant");
  const deviceId = String(formData.get("deviceId") || "");
  const device = await prisma.automationDevice.findFirst({
    where: { id: deviceId, tenantId: user.tenantId },
    include: { capabilities: { select: { id: true } } }
  });
  if (!device) redirect("/settings/automation?error=Gerät nicht gefunden");
  await prisma.automationDevice.delete({ where: { id: device.id } });
  await recordAutomationEvent({
    tenantId: user.tenantId,
    actorId: user.id,
    type: "device_deleted",
    title: `Gerät gelöscht: ${device.name}`,
    source: "WEB",
    role: "OWNER",
    details: { deviceId: device.id, name: device.name, capabilities: device.capabilities.length }
  });
  redirect("/settings/automation?saved=device-deleted");
}

async function updateCapability(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  requireAdmin(user);
  await requireFeature("automation");
  if (!user.tenantId) redirect("/settings/automation?error=tenant");
  const capabilityId = String(formData.get("capabilityId") || "");
  const capability = await prisma.automationCapability.findFirst({ where: { id: capabilityId, tenantId: user.tenantId } });
  if (!capability) redirect("/settings/automation?error=Fähigkeit nicht gefunden");
  await prisma.automationCapability.update({
    where: { id: capability.id },
    data: {
      title: String(formData.get("title") || capability.title).trim() || capability.title,
      state: String(formData.get("state") || capability.state),
      parametersJson: capabilityParametersFromForm(formData, capability.kind, jsonRecord(capability.parametersJson)) as never
    }
  });
  redirect("/settings/automation?saved=capability");
}

async function addCapabilityToDevice(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  requireAdmin(user);
  await requireFeature("automation");
  if (!user.tenantId) redirect("/settings/automation?error=tenant");
  const deviceId = String(formData.get("deviceId") || "");
  const device = await prisma.automationDevice.findFirst({ where: { id: deviceId, tenantId: user.tenantId } });
  if (!device) redirect("/settings/automation?error=Gerät nicht gefunden");
  const capabilityKey = String(formData.get("capabilityKey") || "").trim();
  const capabilityTitle = String(formData.get("capabilityTitle") || capabilityKey).trim();
  if (!capabilityKey || !capabilityTitle) redirect("/settings/automation?error=Fähigkeit ist unvollständig");
  const capability = await upsertAutomationCapability({
    tenantId: user.tenantId,
    deviceId: device.id,
    key: capabilityKey,
    kind: String(formData.get("capabilityKind") || "Camera"),
    title: capabilityTitle,
    state: String(formData.get("capabilityState") || "UNKNOWN"),
    actions: parseList(formData.get("actionsList")),
    events: parseList(formData.get("eventsList")),
    conditions: parseList(formData.get("conditionsList")),
    parameters: parseJson(formData.get("parametersJson"), {}),
    ui: {}
  });
  await recordAutomationEvent({
    tenantId: user.tenantId,
    actorId: user.id,
    deviceId: device.id,
    capabilityId: capability.id,
    type: "capability_added",
    title: `Fähigkeit hinzugefügt: ${device.name} · ${capability.title}`,
    source: "WEB",
    role: "OWNER",
    details: { capabilityId: capability.id, deviceId: device.id, kind: capability.kind, title: capability.title }
  });
  redirect("/settings/automation?saved=capability-added");
}

async function deleteCapability(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  requireAdmin(user);
  await requireFeature("automation");
  if (!user.tenantId) redirect("/settings/automation?error=tenant");
  const capabilityId = String(formData.get("capabilityId") || "");
  const capability = await prisma.automationCapability.findFirst({
    where: { id: capabilityId, tenantId: user.tenantId },
    include: { device: { select: { name: true } } }
  });
  if (!capability) redirect("/settings/automation?error=Fähigkeit nicht gefunden");
  await prisma.automationCapability.delete({ where: { id: capability.id } });
  await recordAutomationEvent({
    tenantId: user.tenantId,
    actorId: user.id,
    deviceId: capability.deviceId,
    type: "capability_deleted",
    title: `Fähigkeit gelöscht: ${capability.device.name} · ${capability.title}`,
    source: "WEB",
    role: "OWNER",
    details: { capabilityId: capability.id, deviceId: capability.deviceId, kind: capability.kind, title: capability.title }
  });
  redirect("/settings/automation?saved=capability-deleted");
}

async function saveRule(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  requireAdmin(user);
  await requireFeature("automation");
  const ruleId = String(formData.get("ruleId") || "");
  const next = {
    name: String(formData.get("name") || "").trim(),
    description: String(formData.get("description") || "").trim() || null,
    active: formData.get("active") === "on",
    mode: String(formData.get("mode") || "ONCE"),
    triggerType: String(formData.get("triggerType") || "session_started"),
    triggerJson: parseJson(formData.get("triggerJson"), {}),
    conditionJson: parseJson(formData.get("conditionJson"), []),
    timingJson: parseJson(formData.get("timingJson"), {}),
    actionJson: parseJson(formData.get("actionJson"), [])
  };
  if (!user.tenantId) redirect("/settings/automation?error=tenant");
  const [capabilities, devices, trackerTypes] = await Promise.all([
    prisma.automationCapability.findMany({
      where: { tenantId: user.tenantId },
      select: { id: true, kind: true, title: true, state: true, deviceId: true, device: { select: { name: true } } }
    }),
    prisma.automationDevice.findMany({
      where: { tenantId: user.tenantId },
      select: { id: true, name: true, health: true }
    }),
    prisma.trackerType.findMany({
      where: { tenantId: user.tenantId, enabled: true },
      select: { id: true, title: true, color: true }
    })
  ]);
  const validation = validateAutomationRulePayload(next, capabilities.map((capability) => ({
    id: capability.id,
    kind: capability.kind as "Camera" | "Switch" | "Voice",
    title: capability.title,
    deviceName: capability.device.name,
    deviceId: capability.deviceId,
    state: capability.state
  })), devices, trackerTypes);
  if (!validation.ok) {
    redirect(`/settings/automation?error=${encodeURIComponent(validation.errors[0] || "Regel ist ungültig")}`);
  }
  const ruleContext = {
    capabilities: capabilities.map((capability) => ({
      id: capability.id,
      kind: capability.kind as "Camera" | "Switch" | "Voice",
      title: capability.title,
      deviceName: capability.device.name,
      deviceId: capability.deviceId,
      state: capability.state
    })),
    devices,
    trackers: trackerTypes
  };
  if (ruleId) {
    const current = await prisma.automationRule.findFirst({ where: { id: ruleId, tenantId: user.tenantId } });
    if (!current) redirect("/settings/automation?error=rule");
    const version = current.currentVersion + 1;
    const descriptionText = automationRuleSummary(next, ruleContext);
    await prisma.automationRule.update({
      where: { id: current.id },
      data: {
        ...next,
        descriptionText,
        currentVersion: version,
        versions: {
          create: {
            tenantId: user.tenantId,
            version,
            name: next.name,
            mode: next.mode,
            triggerType: next.triggerType,
            triggerJson: next.triggerJson as never,
            conditionJson: next.conditionJson as never,
            timingJson: next.timingJson as never,
            actionJson: next.actionJson as never,
            descriptionText
          }
        }
      }
    });
    await recordAutomationEvent({ tenantId: user.tenantId, ruleId, actorId: user.id, type: "rule_updated", title: `Regel geändert: ${next.name}`, source: "WEB", role: "OWNER", details: { version, descriptionText } });
  } else {
    await createAutomationRule({ user, ...next, descriptionText: automationRuleSummary(next, ruleContext) });
  }
  redirect("/settings/automation?saved=rule");
}

async function deleteRule(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  requireAdmin(user);
  await requireFeature("automation");
  if (!user.tenantId) redirect("/settings/automation?error=tenant");
  const ruleId = String(formData.get("ruleId") || "");
  const rule = await prisma.automationRule.findFirst({ where: { id: ruleId, tenantId: user.tenantId } });
  if (!rule) redirect("/settings/automation?error=Regel nicht gefunden");
  await prisma.automationRule.delete({ where: { id: rule.id } });
  await recordAutomationEvent({
    tenantId: user.tenantId,
    actorId: user.id,
    type: "rule_deleted",
    title: `Regel gelöscht: ${rule.name}`,
    source: "WEB",
    role: "OWNER",
    details: { ruleId: rule.id, name: rule.name, version: rule.currentVersion }
  });
  redirect("/settings/automation?saved=rule-deleted");
}

export default async function AutomationSettingsPage(props: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  await requireFeature("automation");
  const searchParams = await props.searchParams;
  const user = await currentUser();
  if (!user) redirect("/login");
  requireAdmin(user);
  if (!user.tenantId) redirect("/");
  const [bridge, devices, trackerTypes, rules, events] = await Promise.all([
    prisma.automationBridge.findUnique({ where: { tenantId: user.tenantId } }),
    prisma.automationDevice.findMany({ where: { tenantId: user.tenantId }, include: { capabilities: true }, orderBy: { name: "asc" } }),
    prisma.trackerType.findMany({ where: { tenantId: user.tenantId, enabled: true }, orderBy: { title: "asc" } }),
    prisma.automationRule.findMany({ where: { tenantId: user.tenantId }, include: { versions: { orderBy: { version: "desc" }, take: 3 } }, orderBy: { updatedAt: "desc" } }),
    prisma.automationEvent.findMany({
      where: { tenantId: user.tenantId },
      include: {
        actor: { include: { profile: true } },
        session: { select: { id: true, slug: true, title: true, state: true } },
        rule: true,
        ruleVersion: { select: { id: true, version: true, descriptionText: true } },
        action: { select: { id: true, type: true, status: true, dueAt: true, startedAt: true, finishedAt: true, error: true } },
        context: { select: { id: true, parentContextId: true, variablesJson: true, conditionsJson: true, policyJson: true, timingJson: true } },
        device: true,
        capability: true,
        parentEvent: { select: { id: true, type: true, title: true, createdAt: true } },
        childEvents: { select: { id: true, type: true, title: true, createdAt: true }, orderBy: { createdAt: "asc" }, take: 5 }
      },
      orderBy: { createdAt: "desc" },
      take: 60
    })
  ]);
  const mqttPassword = typeof searchParams?.mqttPassword === "string" ? searchParams.mqttPassword : "";
  const mqttUser = typeof searchParams?.mqttUser === "string" ? searchParams.mqttUser : "";
  const error = typeof searchParams?.error === "string" ? searchParams.error : "";
  const capabilities = devices.flatMap((device) => device.capabilities.map((capability) => ({
    id: capability.id,
    kind: capability.kind as "Camera" | "Switch" | "Voice",
    title: capability.title,
    deviceId: device.id,
    deviceName: device.name,
    state: capability.state
  })));
  const deviceOptions = devices.map((device) => ({ id: device.id, name: device.name, health: device.health }));
  const trackerOptions = trackerTypes.map((tracker) => ({ id: tracker.id, title: tracker.title, color: tracker.color }));

  return (
    <AppShell>
      <PageHeader title="Automation" />
      <PageGuide title="Regeln, Geräte und ioBroker">
        Hier verwaltest du die serverseitige Automatisierung. Das Portal bleibt die Quelle für Timing, Regeln, Tracker-Kopplung und Protokoll; ioBroker und MQTT sind nur die Brücke zu Geräten.
      </PageGuide>
      {error ? <div className="mb-4 rounded-lg border border-redbrand/30 bg-redbrand/10 p-3 text-sm font-semibold text-ink">{error}</div> : null}
      <div className="space-y-4">
        <details open className="rounded-lg border border-line bg-surface p-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-ink [&::-webkit-details-marker]:hidden"><RadioTower className="h-4 w-4" /> Bridge</summary>
          <form action={saveBridge} className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 rounded-md border border-line bg-paper p-3 text-sm"><input name="enabled" type="checkbox" defaultChecked={bridge?.enabled} /> Aktiv</label>
            <Field label="Verbindungszustand">
              <select name="health" className={inputClass} defaultValue={bridge?.health || "UNKNOWN"}>
                <option value="UNKNOWN">Nicht verbunden</option>
                <option value="ONLINE">Verbunden</option>
                <option value="OFFLINE">Nicht erreichbar</option>
                <option value="ERROR">Fehler</option>
              </select>
            </Field>
            <Field label="MQTT-Themenbereich"><input name="mqttBaseTopic" className={inputClass} defaultValue={bridge?.mqttBaseTopic || "playplaner/v1"} /></Field>
            <Field label="MQTT-Client"><input name="mqttClientId" className={inputClass} defaultValue={bridge?.mqttClientId || ""} /></Field>
            <Field label="MQTT Benutzer"><input name="mqttUsername" className={inputClass} defaultValue={bridge?.mqttUsername || ""} /></Field>
            <div className="flex items-end"><SubmitButton pendingLabel="Speichert...">Bridge speichern</SubmitButton></div>
          </form>
          <form action={rotateMqtt} className="mt-4 rounded-lg border border-line bg-paper p-4">
            <div className="text-sm font-semibold text-ink">MQTT-Zugang erzeugen oder rotieren</div>
            <p className="mt-1 text-sm text-graphite">Das Passwort wird nur einmal angezeigt und danach verschlüsselt gespeichert. Mosquitto bekommt daraus beim Start eine eigene Passwortdatei.</p>
            <input type="hidden" name="mqttUsername" value={bridge?.mqttUsername || ""} />
            <input type="hidden" name="mqttBaseTopic" value={bridge?.mqttBaseTopic || ""} />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <SubmitButton pendingLabel="Erzeuge...">MQTT-Zugang rotieren</SubmitButton>
              {bridge?.mqttUsername ? <span className="text-sm text-graphite">Benutzer: <code>{bridge.mqttUsername}</code></span> : null}
            </div>
            {mqttPassword ? (
              <div className="mt-3 rounded-md border border-redbrand/30 bg-redbrand/10 p-3 text-sm text-ink">
                <div className="font-semibold">Einmaliges MQTT-Passwort für {mqttUser || "den Adapter"}</div>
                <code className="mt-2 block overflow-auto rounded bg-surface p-2">{mqttPassword}</code>
              </div>
            ) : null}
          </form>
          <div className="mt-4 rounded-lg border border-line bg-paper p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink"><BookOpen className="h-4 w-4" /> Adapter-Contract</div>
            <p className="mt-2 text-sm text-graphite">
              Der spätere ioBroker-Adapter nutzt normale API-Tokens und ruft nur Portal-Endpunkte auf. Die Bridge-Logik bleibt dadurch mandantenfähig und vollständig protokolliert.
            </p>
            <div className="mt-3 grid gap-2 text-xs text-graphite md:grid-cols-2">
              <code className="rounded border border-line bg-surface p-2">POST /api/external/automation/adapter/heartbeat</code>
              <code className="rounded border border-line bg-surface p-2">GET /api/external/automation/adapter/commands</code>
              <code className="rounded border border-line bg-surface p-2">POST /api/external/automation/adapter/commands/{"{id}"}/result</code>
              <code className="rounded border border-line bg-surface p-2">POST /api/external/automation/events</code>
              <code className="rounded border border-line bg-surface p-2">POST /api/external/automation/devices</code>
              <code className="rounded border border-line bg-surface p-2">POST /api/external/automation/image-requests/{"{requestId}"}/upload</code>
            </div>
            <a className="mt-3 inline-flex text-sm font-semibold text-redbrand hover:underline" href="/docs/iobroker-adapter-contract.md">
              Contract-Dokument öffnen
            </a>
          </div>
        </details>

        <details className="rounded-lg border border-line bg-surface p-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-ink [&::-webkit-details-marker]:hidden"><Cpu className="h-4 w-4" /> Geräte und Fähigkeiten</summary>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Panel>
              <h2 className="text-base font-semibold text-ink">Gerät hinzufügen</h2>
              <form action={saveDevice} className="mt-3">
                <AutomationDeviceManager />
              </form>
            </Panel>
            <Panel>
              <h2 className="text-base font-semibold text-ink">Aktive Geräte</h2>
              <div className="mt-3 space-y-2">
                {devices.map((device) => (
                  <details key={device.id} className="rounded-md border border-line bg-paper p-3">
                    <summary className="cursor-pointer list-none font-semibold text-ink [&::-webkit-details-marker]:hidden">{device.name} · {labelAutomationValue("health", device.health)}</summary>
                    <div className="mt-2 space-y-1 text-sm text-graphite">
                      <p>{labelAutomationValue("integrations", device.integration)}</p>
                      {device.capabilities.map((capability) => <p key={capability.id}>{capability.title} · {labelAutomationValue("health", capability.state)}</p>)}
                      <details className="mt-3 rounded border border-line bg-surface p-3">
                        <summary className="cursor-pointer list-none font-semibold text-ink [&::-webkit-details-marker]:hidden">Gerät bearbeiten</summary>
                        <form action={updateDevice} className="mt-3 grid gap-3 sm:grid-cols-2">
                          <input type="hidden" name="deviceId" value={device.id} />
                          <Field label="Name"><input name="name" className={inputClass} defaultValue={device.name} /></Field>
                          <Field label="Integration">
                            <select name="integration" className={inputClass} defaultValue={device.integration}>
                              <option value="IOBROKER">ioBroker</option>
                              <option value="MQTT">MQTT</option>
                              <option value="MANUAL">Manuell</option>
                            </select>
                          </Field>
                          <Field label="Verbindungszustand">
                            <select name="health" className={inputClass} defaultValue={device.health}>
                              <option value="UNKNOWN">Nicht verbunden</option>
                              <option value="ONLINE">Verbunden</option>
                              <option value="OFFLINE">Nicht erreichbar</option>
                              <option value="ERROR">Fehler</option>
                              <option value="BOOTING">Startet</option>
                            </select>
                          </Field>
                          <div className="flex items-end"><SubmitButton pendingLabel="Speichert...">Gerät speichern</SubmitButton></div>
                        </form>
                      </details>
                      <details className="mt-2 rounded border border-redbrand/30 bg-redbrand/5 p-3">
                        <summary className="cursor-pointer list-none font-semibold text-ink [&::-webkit-details-marker]:hidden">Gerät entfernen</summary>
                        <p className="mt-2 text-sm text-graphite">
                          Entfernt das Gerät und seine Fähigkeiten aus der Automation. Historische Protokolleinträge bleiben nachvollziehbar erhalten.
                        </p>
                        <form action={deleteDevice} className="mt-3">
                          <input type="hidden" name="deviceId" value={device.id} />
                          <SubmitButton pendingLabel="Löscht...">Gerät löschen</SubmitButton>
                        </form>
                      </details>
                      <details className="mt-2 rounded border border-line bg-surface p-3">
                        <summary className="cursor-pointer list-none font-semibold text-ink [&::-webkit-details-marker]:hidden">Fähigkeit hinzufügen</summary>
                        <p className="mt-2 text-sm text-graphite">
                          Ergänzt dieses Gerät um eine weitere fachliche Fähigkeit. Die passenden Aktionen, Ereignisse und Bedingungen erscheinen danach automatisch im Rule-Editor.
                        </p>
                        <form action={addCapabilityToDevice} className="mt-3 space-y-3">
                          <input type="hidden" name="deviceId" value={device.id} />
                          <AutomationCapabilityManager />
                          <SubmitButton pendingLabel="Speichert...">Fähigkeit hinzufügen</SubmitButton>
                        </form>
                      </details>
                      {device.capabilities.map((capability) => {
                        const parameters = jsonRecord(capability.parametersJson);
                        return (
                          <details key={`${capability.id}-edit`} className="mt-2 rounded border border-line bg-surface p-3">
                            <summary className="cursor-pointer list-none font-semibold text-ink [&::-webkit-details-marker]:hidden">Fähigkeit bearbeiten: {capability.title}</summary>
                            <form action={updateCapability} className="mt-3 grid gap-3 sm:grid-cols-2">
                              <input type="hidden" name="capabilityId" value={capability.id} />
                              <Field label="Name"><input name="title" className={inputClass} defaultValue={capability.title} /></Field>
                              <Field label="Zustand">
                                <select name="state" className={inputClass} defaultValue={capability.state}>
                                  <option value="UNKNOWN">Nicht verbunden</option>
                                  <option value="ONLINE">Verbunden</option>
                                  <option value="OFFLINE">Nicht erreichbar</option>
                                  <option value="ERROR">Fehler</option>
                                  <option value="BOOTING">Startet</option>
                                </select>
                              </Field>
                              <Field label="ioBroker-/MQTT-Datenpunkt">
                                <input name="dataPoint" className={inputClass} defaultValue={String(parameters.dataPoint || "")} placeholder="z.B. alias.0.schlafzimmer.kamera" />
                              </Field>
                              {capability.kind === "Camera" ? (
                                <>
                                  <Field label="Timeout in Sekunden">
                                    <input name="timeoutSeconds" className={inputClass} type="number" min={1} defaultValue={String(parameters.timeoutSeconds || 20)} />
                                  </Field>
                                  <Field label="Maximales Bildalter in Sekunden">
                                    <input name="lastImageMaxAgeSeconds" className={inputClass} type="number" min={1} defaultValue={String(parameters.lastImageMaxAgeSeconds || 60)} />
                                  </Field>
                                  <Field label="Boot-Wartezeit in Sekunden">
                                    <input name="bootDelaySeconds" className={inputClass} type="number" min={0} defaultValue={String(parameters.bootDelaySeconds || 20)} />
                                  </Field>
                                </>
                              ) : null}
                              {capability.kind === "Switch" ? (
                                <>
                                  <Field label="Wert für ein">
                                    <input name="onValue" className={inputClass} defaultValue={String(parameters.onValue || "true")} />
                                  </Field>
                                  <Field label="Wert für aus">
                                    <input name="offValue" className={inputClass} defaultValue={String(parameters.offValue || "false")} />
                                  </Field>
                                </>
                              ) : null}
                              {capability.kind === "Voice" ? (
                                <Field label="Optionaler Ansage-Präfix">
                                  <input name="voicePrefix" className={inputClass} defaultValue={String(parameters.prefix || "")} placeholder="z.B. Playplaner sagt:" />
                                </Field>
                              ) : null}
                              <div className="flex items-end"><SubmitButton pendingLabel="Speichert...">Fähigkeit speichern</SubmitButton></div>
                            </form>
                            <div className="mt-3 rounded border border-redbrand/30 bg-redbrand/5 p-3">
                              <p className="text-sm text-graphite">
                                Entfernt nur diese Fähigkeit. Das Gerät selbst bleibt bestehen.
                              </p>
                              <form action={deleteCapability} className="mt-3">
                                <input type="hidden" name="capabilityId" value={capability.id} />
                                <SubmitButton pendingLabel="Löscht...">Fähigkeit löschen</SubmitButton>
                              </form>
                            </div>
                          </details>
                        );
                      })}
                      <details className="mt-2 rounded border border-line bg-surface p-2">
                        <summary className="cursor-pointer list-none font-semibold text-ink [&::-webkit-details-marker]:hidden">Technische Details</summary>
                        <pre className="mt-2 overflow-auto text-xs">{JSON.stringify({ logicalId: device.logicalId, integration: device.integration, capabilities: device.capabilities.map((capability) => ({ key: capability.key, kind: capability.kind, state: capability.state })) }, null, 2)}</pre>
                      </details>
                    </div>
                  </details>
                ))}
              </div>
            </Panel>
          </div>
        </details>

        <details open className="rounded-lg border border-line bg-surface p-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-ink [&::-webkit-details-marker]:hidden"><Activity className="h-4 w-4" /> Regeln</summary>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Panel>
              <h2 className="text-base font-semibold text-ink">Regel anlegen</h2>
              <form action={saveRule} className="mt-3 space-y-3">
                <Field label="Name"><input name="name" className={inputClass} required /></Field>
                <Field label="Beschreibung"><input name="description" className={inputClass} /></Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="flex items-center gap-2 rounded-md border border-line bg-paper p-3 text-sm"><input name="active" type="checkbox" defaultChecked /> Aktiv</label>
                </div>
                <AutomationRuleEditor capabilities={capabilities} devices={deviceOptions} trackers={trackerOptions} />
                <SubmitButton pendingLabel="Speichert...">Regel speichern</SubmitButton>
              </form>
            </Panel>
            <Panel>
              <h2 className="text-base font-semibold text-ink">Bestehende Regeln</h2>
              <div className="mt-3 space-y-2">
                {rules.map((rule) => (
                  <details key={rule.id} className="rounded-md border border-line bg-paper p-3">
                    <summary className="cursor-pointer list-none font-semibold text-ink [&::-webkit-details-marker]:hidden">{rule.name}</summary>
                    <p className="mt-2 text-sm text-graphite">{rule.descriptionText || automationRuleSummary(rule, { capabilities, devices: deviceOptions, trackers: trackerOptions })}</p>
                    <div className="mt-3 flex flex-col items-start gap-2">
                      {automationRuleFlow(rule, { capabilities, devices: deviceOptions, trackers: trackerOptions }).map((step, index) => (
                        <div key={`${rule.id}-${step}-${index}`} className="rounded-md border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink">{step}</div>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-graphite">Version {rule.currentVersion} · {rule.active ? "aktiv" : "inaktiv"}</p>
                    <details className="mt-3 rounded-md border border-line bg-surface p-3">
                      <summary className="cursor-pointer list-none text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">Regel bearbeiten</summary>
                      <form action={saveRule} className="mt-3 space-y-3">
                        <Field label="Name"><input name="name" className={inputClass} required defaultValue={rule.name} /></Field>
                        <Field label="Beschreibung"><input name="description" className={inputClass} defaultValue={rule.description || ""} /></Field>
                        <label className="flex items-center gap-2 rounded-md border border-line bg-paper p-3 text-sm"><input name="active" type="checkbox" defaultChecked={rule.active} /> Aktiv</label>
                        <AutomationRuleEditor ruleId={rule.id} capabilities={capabilities} devices={deviceOptions} trackers={trackerOptions} initial={JSON.stringify(ruleFormFromStored(rule))} />
                        <SubmitButton pendingLabel="Speichert...">Änderungen speichern</SubmitButton>
                      </form>
                    </details>
                    <details className="mt-2 rounded-md border border-redbrand/30 bg-redbrand/5 p-3">
                      <summary className="cursor-pointer list-none text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">Regel löschen</summary>
                      <p className="mt-2 text-sm text-graphite">
                        Löscht die Regel für zukünftige Ausführungen. Bereits protokollierte Ereignisse und geplante Historie bleiben erhalten.
                      </p>
                      <form action={deleteRule} className="mt-3">
                        <input type="hidden" name="ruleId" value={rule.id} />
                        <SubmitButton pendingLabel="Löscht...">Regel löschen</SubmitButton>
                      </form>
                    </details>
                  </details>
                ))}
              </div>
            </Panel>
          </div>
        </details>

        <details className="rounded-lg border border-line bg-surface p-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-ink [&::-webkit-details-marker]:hidden"><FlaskConical className="h-4 w-4" /> Simulation und Protokoll</summary>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Panel>
              <h2 className="text-base font-semibold text-ink">Simulation</h2>
              <p className="mt-2 text-sm text-graphite">Die Simulation findet direkt im Regel-Editor der jeweiligen Regel statt und erzeugt keine echten Aktionen.</p>
              <div className="mt-3 space-y-2">
                {rules.slice(0, 5).map((rule) => <div key={rule.id} className="rounded-md border border-line bg-paper p-3 text-sm text-graphite">{rule.name}: {rule.descriptionText || automationRuleSummary(rule, { capabilities, devices: deviceOptions, trackers: trackerOptions })}</div>)}
              </div>
            </Panel>
            <Panel>
              <h2 className="text-base font-semibold text-ink">Letzte Automation-Ereignisse</h2>
              <div className="mt-3 max-h-96 space-y-2 overflow-auto">
                {events.map((event) => {
                  const details = jsonRecord(event.detailsJson);
                  const detailEntries = humanAutomationDetailEntries(details);
                  const policy = jsonRecord(event.context?.policyJson);
                  const timing = jsonRecord(event.context?.timingJson);
                  return (
                    <details key={event.id} className="rounded-md border border-line bg-paper p-3">
                      <summary className="cursor-pointer list-none text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
                        {formatAutomationEventTime(event.createdAt)} · {automationEventTitle(event)}
                      </summary>
                      <div className="mt-3 space-y-2 text-sm text-graphite">
                        <div className="rounded-md border border-line bg-surface p-3">
                          <div className="font-semibold text-ink">{event.title}</div>
                          <div className="mt-1">Quelle: {labelAutomationValue("sources", event.source)} · Rolle: {labelAutomationValue("roles", event.role)}</div>
                          {event.actor ? <div>Ausgelöst von: {displayUserName(event.actor)}</div> : null}
                          <div>Zeitpunkt: {formatAutomationEventDate(event.createdAt)}</div>
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                          {event.session ? (
                            <div className="rounded-md border border-line bg-surface p-3">
                              <div className="text-xs uppercase text-graphite">Session</div>
                              <div className="mt-1 font-semibold text-ink">{event.session.title}</div>
                              <div>Status: {labelAutomationValue("states", event.session.state)}</div>
                            </div>
                          ) : null}
                          {event.rule ? (
                            <div className="rounded-md border border-line bg-surface p-3">
                              <div className="text-xs uppercase text-graphite">Regel</div>
                              <div className="mt-1 font-semibold text-ink">{event.rule.name}</div>
                              {event.ruleVersion ? <div>Version {event.ruleVersion.version}</div> : null}
                              {event.ruleVersion?.descriptionText ? <div className="mt-1">{event.ruleVersion.descriptionText}</div> : null}
                            </div>
                          ) : null}
                          {event.action ? (
                            <div className="rounded-md border border-line bg-surface p-3">
                              <div className="text-xs uppercase text-graphite">Aktion</div>
                              <div className="mt-1 font-semibold text-ink">{automationActionTitle(event.action.type)}</div>
                              <div>Status: {labelAutomationValue("actionStatuses", event.action.status)}</div>
                              {event.action.dueAt ? <div>Fällig: {formatAutomationEventDate(event.action.dueAt)}</div> : null}
                              {event.action.error ? <div>Fehler: {event.action.error}</div> : null}
                            </div>
                          ) : null}
                          {event.device || event.capability ? (
                            <div className="rounded-md border border-line bg-surface p-3">
                              <div className="text-xs uppercase text-graphite">Gerät</div>
                              {event.device ? <div className="mt-1 font-semibold text-ink">{event.device.name}</div> : null}
                              {event.capability ? <div>{event.capability.title} · {labelAutomationValue("capabilityKinds", event.capability.kind)} · {labelAutomationValue("health", event.capability.state)}</div> : null}
                            </div>
                          ) : null}
                        </div>
                        {detailEntries.length ? (
                          <div className="rounded-md border border-line bg-surface p-3">
                            <div className="text-xs uppercase text-graphite">Details</div>
                            <div className="mt-2 grid gap-1">
                              {detailEntries.slice(0, 6).map(([label, value]) => (
                                <div key={label} className="grid gap-1 sm:grid-cols-[180px_1fr]">
                                  <span className="font-medium text-ink">{label}</span>
                                  <span>{humanDetailValue(value)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {event.parentEvent || event.childEvents.length ? (
                          <div className="rounded-md border border-line bg-surface p-3">
                            <div className="text-xs uppercase text-graphite">Ursache und Folge</div>
                            {event.parentEvent ? <div className="mt-1">Ausgelöst durch: {formatAutomationEventTime(event.parentEvent.createdAt)} · {automationEventTitle(event.parentEvent)}</div> : null}
                            {event.childEvents.map((child) => <div key={child.id}>Folge: {formatAutomationEventTime(child.createdAt)} · {automationEventTitle(child)}</div>)}
                          </div>
                        ) : null}
                        {event.context ? (
                          <div className="rounded-md border border-line bg-surface p-3">
                            <div className="text-xs uppercase text-graphite">Entscheidung</div>
                            {policy.decision ? <div>Policy: {humanDetailValue(policy.decision)}{policy.reason ? ` · ${humanDetailValue(policy.reason)}` : ""}</div> : null}
                            {timing.dueAt ? <div>Geplante Ausführung: {humanDetailValue(timing.dueAt)}</div> : null}
                          </div>
                        ) : null}
                      </div>
                      <details className="mt-2 rounded bg-surface p-2">
                        <summary className="cursor-pointer list-none text-xs font-semibold text-ink [&::-webkit-details-marker]:hidden">Technische Details</summary>
                        <pre className="mt-2 overflow-auto text-xs text-graphite">{JSON.stringify({
                          eventId: event.id,
                          type: event.type,
                          source: event.source,
                          role: event.role,
                          correlationId: event.correlationId,
                          sessionId: event.sessionId,
                          ruleId: event.ruleId,
                          ruleVersionId: event.ruleVersionId,
                          actionId: event.actionId,
                          contextId: event.contextId,
                          parentEventId: event.parentEventId,
                          deviceId: event.deviceId,
                          capabilityId: event.capabilityId,
                          details: event.detailsJson,
                          raw: event.rawJson,
                          executionContext: event.context ? {
                            variables: event.context.variablesJson,
                            conditions: event.context.conditionsJson,
                            policy: event.context.policyJson,
                            timing: event.context.timingJson,
                            parentContextId: event.context.parentContextId
                          } : null
                        }, null, 2)}</pre>
                      </details>
                    </details>
                  );
                })}
              </div>
            </Panel>
          </div>
        </details>
      </div>
    </AppShell>
  );
}
