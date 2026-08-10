import { redirect } from "next/navigation";
import { Activity, BookOpen, Cpu, FlaskConical, RadioTower } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AutomationDeviceManager } from "@/components/automation-device-manager";
import { AutomationRuleEditor } from "@/components/automation-rule-editor";
import { SubmitButton } from "@/components/submit-button";
import { Field, inputClass, PageGuide, PageHeader, Panel } from "@/components/ui";
import { automationRuleFlow, automationRuleSummary, labelAutomationValue, ruleFormFromStored, validateAutomationRulePayload } from "@/lib/automation-rule-model";
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
  const capabilityKey = String(formData.get("capabilityKey") || "").trim();
  if (capabilityKey) {
    await upsertAutomationCapability({
      tenantId: user.tenantId,
      deviceId: device.id,
      key: capabilityKey,
      kind: String(formData.get("capabilityKind") || "Camera"),
      title: String(formData.get("capabilityTitle") || capabilityKey),
      state: String(formData.get("capabilityState") || "UNKNOWN"),
      actions: parseList(formData.get("actionsList")),
      events: parseList(formData.get("eventsList")),
      conditions: parseList(formData.get("conditionsList")),
      parameters: {},
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
      state: String(formData.get("state") || capability.state)
    }
  });
  redirect("/settings/automation?saved=capability");
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
      include: { actor: { include: { profile: true } }, rule: true, device: true, capability: true, parentEvent: true },
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
                      {device.capabilities.map((capability) => (
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
                            <div className="flex items-end"><SubmitButton pendingLabel="Speichert...">Fähigkeit speichern</SubmitButton></div>
                          </form>
                        </details>
                      ))}
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
                {events.map((event) => (
                  <details key={event.id} className="rounded-md border border-line bg-paper p-3">
                    <summary className="cursor-pointer list-none text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
                      {labelAutomationValue("eventTypes", event.type) === event.type ? event.title : labelAutomationValue("eventTypes", event.type)}
                    </summary>
                    <div className="mt-2 space-y-1 text-sm text-graphite">
                      <p>Quelle: {labelAutomationValue("sources", event.source)} · Rolle: {labelAutomationValue("roles", event.role)}</p>
                      {event.actor ? <p>Ausgelöst von: {event.actor.profile?.displayName || event.actor.name || event.actor.username || event.actor.email}</p> : null}
                      {event.rule ? <p>Regel: {event.rule.name}</p> : null}
                      {event.device ? <p>Gerät: {event.device.name}</p> : null}
                      {event.capability ? <p>Fähigkeit: {event.capability.title}</p> : null}
                      {event.parentEvent ? <p>Auslöser: {labelAutomationValue("eventTypes", event.parentEvent.type) === event.parentEvent.type ? event.parentEvent.title : labelAutomationValue("eventTypes", event.parentEvent.type)}</p> : null}
                      <p>Zeit: {event.createdAt.toLocaleString("de-DE")}</p>
                    </div>
                    <details className="mt-2 rounded bg-surface p-2">
                      <summary className="cursor-pointer list-none text-xs font-semibold text-ink [&::-webkit-details-marker]:hidden">Technische Details</summary>
                      <pre className="mt-2 overflow-auto text-xs text-graphite">{JSON.stringify({ type: event.type, correlationId: event.correlationId, details: event.detailsJson, raw: event.rawJson }, null, 2)}</pre>
                    </details>
                  </details>
                ))}
              </div>
            </Panel>
          </div>
        </details>
      </div>
    </AppShell>
  );
}
