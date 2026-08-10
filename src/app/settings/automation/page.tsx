import { redirect } from "next/navigation";
import { Activity, Cpu, FlaskConical, Plus, RadioTower } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { Field, inputClass, PageGuide, PageHeader, Panel } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";
import { createAutomationRule, describeAutomationRule, simulateAutomationRule, upsertAutomationCapability, upsertAutomationDevice } from "@/lib/session-automation";

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
  redirect("/settings/automation?saved=bridge");
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
      actions: parseJson(formData.get("actionsJson"), []),
      events: parseJson(formData.get("eventsJson"), []),
      conditions: parseJson(formData.get("conditionsJson"), []),
      parameters: parseJson(formData.get("parametersJson"), {}),
      ui: parseJson(formData.get("uiJson"), {})
    });
  }
  redirect("/settings/automation?saved=device");
}

async function saveRule(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  requireAdmin(user);
  await requireFeature("automation");
  await createAutomationRule({
    user,
    name: String(formData.get("name") || "").trim(),
    description: String(formData.get("description") || "").trim() || null,
    active: formData.get("active") === "on",
    mode: String(formData.get("mode") || "ONCE"),
    triggerType: String(formData.get("triggerType") || "session_started"),
    triggerJson: parseJson(formData.get("triggerJson"), {}),
    conditionJson: parseJson(formData.get("conditionJson"), []),
    timingJson: parseJson(formData.get("timingJson"), {}),
    actionJson: parseJson(formData.get("actionJson"), [])
  });
  redirect("/settings/automation?saved=rule");
}

export default async function AutomationSettingsPage() {
  await requireFeature("automation");
  const user = await currentUser();
  if (!user) redirect("/login");
  requireAdmin(user);
  if (!user.tenantId) redirect("/");
  const [bridge, devices, rules, events] = await Promise.all([
    prisma.automationBridge.findUnique({ where: { tenantId: user.tenantId } }),
    prisma.automationDevice.findMany({ where: { tenantId: user.tenantId }, include: { capabilities: true }, orderBy: { name: "asc" } }),
    prisma.automationRule.findMany({ where: { tenantId: user.tenantId }, include: { versions: { orderBy: { version: "desc" }, take: 3 } }, orderBy: { updatedAt: "desc" } }),
    prisma.automationEvent.findMany({ where: { tenantId: user.tenantId }, orderBy: { createdAt: "desc" }, take: 60 })
  ]);
  const simulation = simulateAutomationRule({ triggerType: "session_started", timingJson: { type: "fixed_delay", minutes: 15 }, actionJson: [{ type: "camera_request_image" }] });

  return (
    <AppShell>
      <PageHeader title="Automation" />
      <PageGuide title="Regeln, Geräte und ioBroker">
        Hier verwaltest du die serverseitige Automatisierung. Das Portal bleibt die Quelle für Timing, Regeln, Tracker-Kopplung und Protokoll; ioBroker und MQTT sind nur die Brücke zu Geräten.
      </PageGuide>
      <div className="space-y-4">
        <details open className="rounded-lg border border-line bg-surface p-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-ink [&::-webkit-details-marker]:hidden"><RadioTower className="h-4 w-4" /> Bridge</summary>
          <form action={saveBridge} className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 rounded-md border border-line bg-paper p-3 text-sm"><input name="enabled" type="checkbox" defaultChecked={bridge?.enabled} /> Aktiv</label>
            <Field label="Health"><input name="health" className={inputClass} defaultValue={bridge?.health || "UNKNOWN"} /></Field>
            <Field label="MQTT Base Topic"><input name="mqttBaseTopic" className={inputClass} defaultValue={bridge?.mqttBaseTopic || "playplaner/v1"} /></Field>
            <Field label="MQTT Client ID"><input name="mqttClientId" className={inputClass} defaultValue={bridge?.mqttClientId || ""} /></Field>
            <Field label="MQTT Benutzer"><input name="mqttUsername" className={inputClass} defaultValue={bridge?.mqttUsername || ""} /></Field>
            <div className="flex items-end"><SubmitButton pendingLabel="Speichert...">Bridge speichern</SubmitButton></div>
          </form>
        </details>

        <details className="rounded-lg border border-line bg-surface p-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-ink [&::-webkit-details-marker]:hidden"><Cpu className="h-4 w-4" /> Geräte und Fähigkeiten</summary>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Panel>
              <h2 className="text-base font-semibold text-ink">Gerät hinzufügen oder synchronisieren</h2>
              <form action={saveDevice} className="mt-3 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Logische ID"><input name="logicalId" className={inputClass} required placeholder="camera-bedroom" /></Field>
                  <Field label="Name"><input name="name" className={inputClass} required placeholder="Kamera Schlafzimmer" /></Field>
                  <Field label="Integration"><input name="integration" className={inputClass} defaultValue="IOBROKER" /></Field>
                  <Field label="Health"><input name="health" className={inputClass} defaultValue="UNKNOWN" /></Field>
                </div>
                <Field label="Capability Key"><input name="capabilityKey" className={inputClass} placeholder="camera" /></Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Capability Typ"><select name="capabilityKind" className={inputClass}><option>Camera</option><option>Switch</option><option>Voice</option></select></Field>
                  <Field label="Capability Titel"><input name="capabilityTitle" className={inputClass} placeholder="Bild anfordern" /></Field>
                  <Field label="State"><input name="capabilityState" className={inputClass} defaultValue="UNKNOWN" /></Field>
                </div>
                <Field label="Actions JSON"><textarea name="actionsJson" className={inputClass} rows={2} defaultValue={'["request_image"]'} /></Field>
                <SubmitButton pendingLabel="Speichert..."><Plus className="h-4 w-4" /> Gerät speichern</SubmitButton>
              </form>
            </Panel>
            <Panel>
              <h2 className="text-base font-semibold text-ink">Aktive Geräte</h2>
              <div className="mt-3 space-y-2">
                {devices.map((device) => (
                  <details key={device.id} className="rounded-md border border-line bg-paper p-3">
                    <summary className="cursor-pointer list-none font-semibold text-ink [&::-webkit-details-marker]:hidden">{device.name} · {device.health}</summary>
                    <div className="mt-2 space-y-1 text-sm text-graphite">
                      <p>{device.integration} · {device.logicalId}</p>
                      {device.capabilities.map((capability) => <p key={capability.id}>{capability.kind}: {capability.title} · {capability.state}</p>)}
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
                  <Field label="Modus"><select name="mode" className={inputClass}><option>ONCE</option><option>REPEAT</option></select></Field>
                  <Field label="Trigger"><input name="triggerType" className={inputClass} defaultValue="session_started" /></Field>
                </div>
                <Field label="Bedingungen JSON"><textarea name="conditionJson" className={inputClass} rows={3} defaultValue="[]" /></Field>
                <Field label="Zeitlogik JSON"><textarea name="timingJson" className={inputClass} rows={3} defaultValue={'{"type":"fixed_delay","minutes":15}'} /></Field>
                <Field label="Actions JSON"><textarea name="actionJson" className={inputClass} rows={4} defaultValue={'[{"type":"camera_request_image"}]'} /></Field>
                <SubmitButton pendingLabel="Speichert...">Regel speichern</SubmitButton>
              </form>
            </Panel>
            <Panel>
              <h2 className="text-base font-semibold text-ink">Bestehende Regeln</h2>
              <div className="mt-3 space-y-2">
                {rules.map((rule) => (
                  <details key={rule.id} className="rounded-md border border-line bg-paper p-3">
                    <summary className="cursor-pointer list-none font-semibold text-ink [&::-webkit-details-marker]:hidden">{rule.name}</summary>
                    <p className="mt-2 text-sm text-graphite">{rule.descriptionText || describeAutomationRule(rule)}</p>
                    <p className="mt-1 text-xs text-graphite">Version {rule.currentVersion} · {rule.active ? "aktiv" : "inaktiv"}</p>
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
              <h2 className="text-base font-semibold text-ink">Beispiel-Simulation</h2>
              <div className="mt-3 space-y-2">
                {simulation.timeline.map((item) => (
                  <div key={`${item.kind}-${item.at}`} className="rounded-md border border-line bg-paper p-3 text-sm">
                    <div className="font-semibold text-ink">{item.title}</div>
                    <div className="text-graphite">{item.at}</div>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel>
              <h2 className="text-base font-semibold text-ink">Letzte Automation-Ereignisse</h2>
              <div className="mt-3 max-h-96 space-y-2 overflow-auto">
                {events.map((event) => (
                  <details key={event.id} className="rounded-md border border-line bg-paper p-3">
                    <summary className="cursor-pointer list-none text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">{event.title}</summary>
                    <pre className="mt-2 overflow-auto rounded bg-surface p-2 text-xs text-graphite">{JSON.stringify({ type: event.type, details: event.detailsJson }, null, 2)}</pre>
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
