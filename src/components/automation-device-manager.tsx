"use client";

import { useMemo, useState } from "react";
import { Camera, Plus, ToggleLeft, Volume2 } from "lucide-react";
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

export function AutomationDeviceManager() {
  const [name, setName] = useState("");
  const [integration, setIntegration] = useState("IOBROKER");
  const [capabilityKind, setCapabilityKind] = useState<CapabilityKind>("Camera");
  const [capabilityTitle, setCapabilityTitle] = useState("Bild anfordern");
  const logicalId = useMemo(() => `${integration.toLowerCase()}-${slug(name)}`, [integration, name]);
  const capabilityKey = useMemo(() => `${capabilityKind.toLowerCase()}-${slug(capabilityTitle)}`, [capabilityKind, capabilityTitle]);
  const preset = capabilityPresets[capabilityKind];

  return (
    <div className="space-y-3">
      <input type="hidden" name="logicalId" value={logicalId} />
      <input type="hidden" name="integration" value={integration} />
      <input type="hidden" name="health" value="UNKNOWN" />
      <input type="hidden" name="capabilityKey" value={capabilityKey} />
      <input type="hidden" name="capabilityKind" value={capabilityKind} />
      <input type="hidden" name="actionsList" value={preset.actions} />
      <input type="hidden" name="eventsList" value={preset.events} />
      <input type="hidden" name="conditionsList" value={preset.conditions} />

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
          <button key={kind} type="button" onClick={() => { setCapabilityKind(kind); setCapabilityTitle(capabilityPresets[kind].label === "Kamera" ? "Bild anfordern" : capabilityPresets[kind].label); }} className={`rounded-md border p-3 text-left text-sm ${capabilityKind === kind ? "border-redbrand bg-redbrand/10 text-ink" : "border-line bg-paper text-graphite"}`}>
            <span className="flex items-center gap-2 font-semibold">{capabilityPresets[kind].icon}{capabilityPresets[kind].label}</span>
          </button>
        ))}
      </div>
      <label className="block text-sm font-medium text-graphite">Fähigkeit
        <input name="capabilityTitle" className={`${inputClass} mt-1`} required value={capabilityTitle} onChange={(event) => setCapabilityTitle(event.target.value)} />
      </label>
      <div className="rounded-md border border-line bg-surface p-3 text-sm text-graphite">
        <div className="font-semibold text-ink">Wird eingerichtet</div>
        <div>Aktionen: {preset.visibleActions.join(", ")}</div>
        <div>Ereignisse: {preset.visibleEvents.join(", ")}</div>
        <div>Bedingungen: {preset.visibleConditions.join(", ")}</div>
        <details className="mt-2">
          <summary className="cursor-pointer font-semibold text-ink">Technische Details</summary>
          <div className="mt-1">Logische ID: <code>{logicalId}</code></div>
          <div>Capability-Key: <code>{capabilityKey}</code></div>
        </details>
      </div>
      <button className="inline-flex min-h-11 items-center rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white shadow-soft hover:bg-redbrand/90" type="submit">
        <Plus className="mr-2 h-4 w-4" /> Gerät speichern
      </button>
    </div>
  );
}
