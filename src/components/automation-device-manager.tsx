"use client";

import { useMemo, useState } from "react";
import { Camera, Plus, Trash2, ToggleLeft, Volume2 } from "lucide-react";
import { inputClass } from "@/components/ui";

type CapabilityKind = "Camera" | "Switch" | "Voice";

const capabilityPresets: Record<CapabilityKind, { label: string; icon: JSX.Element; actions: string; events: string; conditions: string; visibleActions: string[]; visibleEvents: string[]; visibleConditions: string[] }> = {
  Camera: {
    label: "Kamera",
    icon: <Camera className="h-4 w-4" />,
    actions: "camera_request_image, camera_health_check",
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
    conditions: "is_on, is_off, switch_state_for",
    visibleActions: ["Einschalten", "Ausschalten", "Umschalten"],
    visibleEvents: ["Wurde eingeschaltet", "Wurde ausgeschaltet", "Schaltfehler"],
    visibleConditions: ["Ist eingeschaltet", "Ist ausgeschaltet", "Ist seit einer Zeit ein oder aus"]
  },
  Voice: {
    label: "Sprachausgabe",
    icon: <Volume2 className="h-4 w-4" />,
    actions: "voice_speak",
    events: "speech_started, speech_finished, voice_error",
    conditions: "is_online",
    visibleActions: ["Text sprechen"],
    visibleEvents: ["Ansage gestartet", "Ansage beendet", "Sprachausgabe nicht erreichbar"],
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
  dataPoint: string;
  onValue: string;
  offValue: string;
  timeoutSeconds: number;
  maxAgeSeconds: number;
  bootDelaySeconds: number;
  voicePrefix: string;
};

function defaultTitle(kind: CapabilityKind) {
  if (kind === "Camera") return "Bild anfordern";
  if (kind === "Switch") return "Strom schalten";
  return "Ansage sprechen";
}

function defaultState(kind: CapabilityKind) {
  if (kind === "Switch") return "OFF";
  return "UNKNOWN";
}

function defaultCapability(kind: CapabilityKind, id: string): CapabilityDraft {
  return {
    id,
    kind,
    title: defaultTitle(kind),
    dataPoint: "",
    onValue: "true",
    offValue: "false",
    timeoutSeconds: kind === "Camera" ? 20 : 10,
    maxAgeSeconds: kind === "Camera" ? 60 : 0,
    bootDelaySeconds: kind === "Camera" ? 20 : 0,
    voicePrefix: ""
  };
}

function parametersFor(capability: CapabilityDraft) {
  if (capability.kind === "Camera") {
    return {
      dataPoint: capability.dataPoint || null,
      timeoutSeconds: capability.timeoutSeconds,
      lastImageMaxAgeSeconds: capability.maxAgeSeconds,
      bootDelaySeconds: capability.bootDelaySeconds
    };
  }
  if (capability.kind === "Switch") {
    return {
      dataPoint: capability.dataPoint || null,
      onValue: capability.onValue || "true",
      offValue: capability.offValue || "false"
    };
  }
  return {
    dataPoint: capability.dataPoint || null,
    prefix: capability.voicePrefix || null
  };
}

function capabilityKeyFor(capability: CapabilityDraft, index = 0) {
  return `${capability.kind.toLowerCase()}-${slug(capability.title)}-${slug(capability.id)}-${index + 1}`;
}

function CapabilityHiddenFields({ capability, index = 0 }: { capability: CapabilityDraft; index?: number }) {
  const preset = capabilityPresets[capability.kind];
  return (
    <div>
      <input type="hidden" name="capabilityKey" value={capabilityKeyFor(capability, index)} />
      <input type="hidden" name="capabilityKind" value={capability.kind} />
      <input type="hidden" name="capabilityTitle" value={capability.title} />
      <input type="hidden" name="capabilityState" value={defaultState(capability.kind)} />
      <input type="hidden" name="actionsList" value={preset.actions} />
      <input type="hidden" name="eventsList" value={preset.events} />
      <input type="hidden" name="conditionsList" value={preset.conditions} />
      <input type="hidden" name="parametersJson" value={JSON.stringify(parametersFor(capability))} />
    </div>
  );
}

function CapabilityFields({
  capability,
  onChange,
  onRemove,
  canRemove = true
}: {
  capability: CapabilityDraft;
  onChange: (next: Partial<CapabilityDraft>) => void;
  onRemove?: () => void;
  canRemove?: boolean;
}) {
  const preset = capabilityPresets[capability.kind];
  return (
    <div className="rounded-md border border-line bg-surface p-3 text-sm text-graphite">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold text-ink">{preset.icon}{preset.label}</div>
          <p className="mt-1 text-xs">Diese Fähigkeit stellt passende Aktionen, Ereignisse und Bedingungen im Regel-Editor bereit.</p>
        </div>
        {onRemove ? (
          <button type="button" onClick={onRemove} disabled={!canRemove} className="inline-flex min-h-9 items-center rounded-md border border-line bg-paper px-3 py-1 text-xs font-semibold text-graphite disabled:opacity-40">
            <Trash2 className="mr-1 h-3 w-3" /> Entfernen
          </button>
        ) : null}
      </div>
      <label className="mt-3 block font-medium">Name der Fähigkeit
        <input className={`${inputClass} mt-1`} required value={capability.title} onChange={(event) => onChange({ title: event.target.value })} />
      </label>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <label className="block font-medium">ioBroker-/MQTT-Datenpunkt
          <input className={`${inputClass} mt-1`} value={capability.dataPoint} onChange={(event) => onChange({ dataPoint: event.target.value })} placeholder="z.B. alias.0.schlafzimmer.kamera" />
        </label>
        {capability.kind === "Camera" ? (
          <label className="block font-medium">Maximales Bildalter
            <div className="mt-1 flex items-center gap-2">
              <input className={inputClass} type="number" min={1} value={capability.maxAgeSeconds} onChange={(event) => onChange({ maxAgeSeconds: Number(event.target.value) })} />
              <span>Sek.</span>
            </div>
          </label>
        ) : null}
        {capability.kind === "Camera" ? (
          <label className="block font-medium">Timeout
            <div className="mt-1 flex items-center gap-2">
              <input className={inputClass} type="number" min={1} value={capability.timeoutSeconds} onChange={(event) => onChange({ timeoutSeconds: Number(event.target.value) })} />
              <span>Sek.</span>
            </div>
          </label>
        ) : null}
        {capability.kind === "Camera" ? (
          <label className="block font-medium">Boot-Wartezeit
            <div className="mt-1 flex items-center gap-2">
              <input className={inputClass} type="number" min={0} value={capability.bootDelaySeconds} onChange={(event) => onChange({ bootDelaySeconds: Number(event.target.value) })} />
              <span>Sek.</span>
            </div>
          </label>
        ) : null}
        {capability.kind === "Switch" ? (
          <label className="block font-medium">Wert für ein
            <input className={`${inputClass} mt-1`} value={capability.onValue} onChange={(event) => onChange({ onValue: event.target.value })} />
          </label>
        ) : null}
        {capability.kind === "Switch" ? (
          <label className="block font-medium">Wert für aus
            <input className={`${inputClass} mt-1`} value={capability.offValue} onChange={(event) => onChange({ offValue: event.target.value })} />
          </label>
        ) : null}
        {capability.kind === "Voice" ? (
          <label className="block font-medium">Optionaler Ansage-Präfix
            <input className={`${inputClass} mt-1`} value={capability.voicePrefix} onChange={(event) => onChange({ voicePrefix: event.target.value })} placeholder="z.B. Playplaner sagt:" />
          </label>
        ) : null}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <div><span className="font-semibold text-ink">Aktionen:</span> {preset.visibleActions.join(", ")}</div>
        <div><span className="font-semibold text-ink">Ereignisse:</span> {preset.visibleEvents.join(", ")}</div>
        <div><span className="font-semibold text-ink">Bedingungen:</span> {preset.visibleConditions.join(", ")}</div>
      </div>
    </div>
  );
}

export function AutomationCapabilityManager() {
  const [kind, setKind] = useState<CapabilityKind>("Camera");
  const [capability, setCapability] = useState<CapabilityDraft>(() => defaultCapability("Camera", `cap-${Date.now()}`));

  function changeKind(nextKind: CapabilityKind) {
    setKind(nextKind);
    setCapability((current) => ({ ...defaultCapability(nextKind, current.id), dataPoint: current.dataPoint }));
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-graphite">Art der Fähigkeit
        <select className={`${inputClass} mt-1`} value={kind} onChange={(event) => changeKind(event.target.value as CapabilityKind)}>
          {(Object.keys(capabilityPresets) as CapabilityKind[]).map((item) => <option key={item} value={item}>{capabilityPresets[item].label}</option>)}
        </select>
      </label>
      <CapabilityHiddenFields capability={capability} />
      <CapabilityFields capability={capability} onChange={(next) => setCapability((current) => ({ ...current, ...next }))} />
    </div>
  );
}

export function AutomationDeviceManager() {
  const [name, setName] = useState("");
  const [integration, setIntegration] = useState("IOBROKER");
  const [capabilities, setCapabilities] = useState<CapabilityDraft[]>([defaultCapability("Camera", "cap-1")]);
  const logicalId = useMemo(() => `${integration.toLowerCase()}-${slug(name)}`, [integration, name]);

  function updateCapability(id: string, next: Partial<CapabilityDraft>) {
    setCapabilities((current) => current.map((item) => item.id === id ? { ...item, ...next } : item));
  }

  function addCapability(kind: CapabilityKind) {
    setCapabilities((current) => [...current, defaultCapability(kind, `cap-${Date.now()}-${current.length}`)]);
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
        return (
          <div key={`${capability.id}-hidden`}>
            <CapabilityHiddenFields capability={capability} index={index} />
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
        {capabilities.map((capability) => (
          <CapabilityFields
            key={capability.id}
            capability={capability}
            onChange={(next) => updateCapability(capability.id, next)}
            onRemove={() => removeCapability(capability.id)}
            canRemove={capabilities.length > 1}
          />
        ))}
      </div>
      <details className="rounded-md border border-line bg-surface p-3">
        <summary className="cursor-pointer list-none text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">Technische Details</summary>
        <p className="mt-2 text-sm text-graphite">
          Diese Werte erzeugt Playplaner automatisch für Adapter und API. Im normalen Regelbetrieb musst du sie nicht bearbeiten.
        </p>
        <div className="mt-2 space-y-1 text-sm text-graphite">
          <div>Logische ID: <code>{logicalId}</code></div>
          {capabilities.map((capability, index) => (
            <div key={`${capability.id}-technical`}>Fähigkeit {index + 1}: <code>{capabilityKeyFor(capability, index)}</code></div>
          ))}
        </div>
      </details>
      <button className="inline-flex min-h-11 items-center rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white shadow-soft hover:bg-redbrand/90" type="submit">
        <Plus className="mr-2 h-4 w-4" /> Gerät speichern
      </button>
    </div>
  );
}
