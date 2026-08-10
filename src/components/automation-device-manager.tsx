"use client";

import { useMemo, useState } from "react";
import { Camera, Plus, Trash2, ToggleLeft, Volume2 } from "lucide-react";
import { inputClass } from "@/components/ui";

type CapabilityKind = "Camera" | "Switch" | "Voice";

const capabilityPresets: Record<CapabilityKind, { label: string; icon: JSX.Element; actions: string; events: string; conditions: string; visibleActions: string[]; visibleEvents: string[]; visibleConditions: string[] }> = {
  Camera: {
    label: "Kamera",
    icon: <Camera className="h-4 w-4" />,
    actions: "request_image, health_check",
    events: "image_uploaded, camera_offline, camera_online",
    conditions: "is_online, last_image_younger_than",
    visibleActions: ["Bild anfordern", "Verbindung prüfen"],
    visibleEvents: ["Bild empfangen", "Kamera nicht erreichbar", "Kamera verbunden"],
    visibleConditions: ["Kamera ist verbunden", "Letztes Bild ist jünger als Vorgabe"]
  },
  Switch: {
    label: "Schalter",
    icon: <ToggleLeft className="h-4 w-4" />,
    actions: "switch_on, switch_off, switch_toggle",
    events: "switched_on, switched_off, switch_error",
    conditions: "is_on, is_off",
    visibleActions: ["Einschalten", "Ausschalten", "Umschalten"],
    visibleEvents: ["Wurde eingeschaltet", "Wurde ausgeschaltet", "Schaltfehler"],
    visibleConditions: ["Ist eingeschaltet", "Ist ausgeschaltet"]
  },
  Voice: {
    label: "Sprachausgabe",
    icon: <Volume2 className="h-4 w-4" />,
    actions: "speak",
    events: "speech_started, speech_finished, voice_error",
    conditions: "is_online",
    visibleActions: ["Text sprechen"],
    visibleEvents: ["Ansage gestartet", "Ansage beendet", "Ansage fehlgeschlagen"],
    visibleConditions: ["Sprachausgabe ist verbunden"]
  }
};

function slug(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "geraet";
}

type CapabilityDraft = {
  id: string;
  kind: CapabilityKind;
  title: string;
};

function defaultTitle(kind: CapabilityKind) {
  if (kind === "Camera") return "Bild anfordern";
  if (kind === "Switch") return "Strom schalten";
  return "Ansage sprechen";
}

export function AutomationDeviceManager() {
  const [name, setName] = useState("");
  const [integration, setIntegration] = useState("IOBROKER");
  const [capabilities, setCapabilities] = useState<CapabilityDraft[]>([{ id: "cap-1", kind: "Camera", title: "Bild anfordern" }]);
  const logicalId = useMemo(() => `${integration.toLowerCase()}-${slug(name)}`, [integration, name]);

  function updateCapability(id: string, next: Partial<CapabilityDraft>) {
    setCapabilities((current) => current.map((item) => item.id === id ? { ...item, ...next } : item));
  }

  function addCapability(kind: CapabilityKind) {
    setCapabilities((current) => [...current, { id: `cap-${Date.now()}-${current.length}`, kind, title: defaultTitle(kind) }]);
  }

  function removeCapability(id: string) {
    setCapabilities((current) => current.length > 1 ? current.filter((item) => item.id !== id) : current);
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="logicalId" value={logicalId} />
      <input type="hidden" name="integration" value={integration} />
      <input type="hidden" name="health" value="UNKNOWN" />
      {capabilities.map((capability, index) => {
        const preset = capabilityPresets[capability.kind];
        const key = `${capability.kind.toLowerCase()}-${slug(capability.title)}-${index + 1}`;
        return (
          <div key={`${capability.id}-hidden`}>
            <input type="hidden" name="capabilityKey" value={key} />
            <input type="hidden" name="capabilityKind" value={capability.kind} />
            <input type="hidden" name="capabilityTitle" value={capability.title} />
            <input type="hidden" name="capabilityState" value="UNKNOWN" />
            <input type="hidden" name="actionsList" value={preset.actions} />
            <input type="hidden" name="eventsList" value={preset.events} />
            <input type="hidden" name="conditionsList" value={preset.conditions} />
          </div>
        );
      })}

      <label className="block text-sm font-medium text-graphite">Gerätename
        <input name="name" className={`${inputClass} mt-1`} required value={name} onChange={(event) => setName(event.target.value)} placeholder="Kamera Schlafzimmer" />
      </label>
      <label className="block text-sm font-medium text-graphite">Integration
        <select className={`${inputClass} mt-1`} value={integration} onChange={(event) => setIntegration(event.target.value)}>
          <option value="IOBROKER">ioBroker</option>
          <option value="MQTT">MQTT</option>
          <option value="MANUAL">Manuell</option>
        </select>
      </label>
      <div className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(capabilityPresets) as CapabilityKind[]).map((kind) => (
          <button key={kind} type="button" onClick={() => addCapability(kind)} className="rounded-md border border-line bg-paper p-3 text-left text-sm text-graphite hover:border-redbrand hover:bg-redbrand/10 hover:text-ink">
            <span className="flex items-center gap-2 font-semibold">{capabilityPresets[kind].icon}{capabilityPresets[kind].label} hinzufügen</span>
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {capabilities.map((capability, index) => {
          const preset = capabilityPresets[capability.kind];
          const capabilityKey = `${capability.kind.toLowerCase()}-${slug(capability.title)}-${index + 1}`;
          return (
            <div key={capability.id} className="rounded-md border border-line bg-surface p-3 text-sm text-graphite">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-semibold text-ink">{preset.icon}{preset.label}</div>
                  <p className="mt-1 text-xs">Diese Fähigkeit stellt passende Aktionen, Ereignisse und Bedingungen im Rule-Editor bereit.</p>
                </div>
                <button type="button" onClick={() => removeCapability(capability.id)} disabled={capabilities.length <= 1} className="inline-flex min-h-9 items-center rounded-md border border-line bg-paper px-3 py-1 text-xs font-semibold text-graphite disabled:opacity-40">
                  <Trash2 className="mr-1 h-3 w-3" /> Entfernen
                </button>
              </div>
              <label className="mt-3 block font-medium">Name der Fähigkeit
                <input className={`${inputClass} mt-1`} required value={capability.title} onChange={(event) => updateCapability(capability.id, { title: event.target.value })} />
              </label>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <div><span className="font-semibold text-ink">Aktionen:</span> {preset.visibleActions.join(", ")}</div>
                <div><span className="font-semibold text-ink">Ereignisse:</span> {preset.visibleEvents.join(", ")}</div>
                <div><span className="font-semibold text-ink">Bedingungen:</span> {preset.visibleConditions.join(", ")}</div>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer font-semibold text-ink">Technische Details</summary>
                <div className="mt-1">Logische ID: <code>{logicalId}</code></div>
                <div>Capability-Key: <code>{capabilityKey}</code></div>
              </details>
            </div>
          );
        })}
      </div>
      <button className="inline-flex min-h-11 items-center rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white shadow-soft hover:bg-redbrand/90" type="submit">
        <Plus className="mr-2 h-4 w-4" /> Gerät speichern
      </button>
    </div>
  );
}
