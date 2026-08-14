"use client";

import { useState } from "react";
import { Play, ShieldCheck } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { Field, inputClass } from "@/components/ui";

type TemplateOption = { id: string; name: string; description: string | null; defaultTrackerTypeId: string | null };
type TrackerOption = { id: string; title: string };

export function AutomationSessionStartForm(props: {
  action: (formData: FormData) => void | Promise<void>;
  templates: TemplateOption[];
  trackers: TrackerOption[];
  safetyError?: boolean;
}) {
  const firstTemplate = props.templates[0] || null;
  const [templateId, setTemplateId] = useState(firstTemplate?.id || "");
  const [trackerTypeId, setTrackerTypeId] = useState(firstTemplate?.defaultTrackerTypeId || props.trackers[0]?.id || "");
  const selected = props.templates.find((template) => template.id === templateId) || null;

  function selectTemplate(id: string) {
    setTemplateId(id);
    const template = props.templates.find((item) => item.id === id);
    if (template?.defaultTrackerTypeId) setTrackerTypeId(template.defaultTrackerTypeId);
  }

  return (
    <form action={props.action} className="mt-4 grid gap-3 sm:grid-cols-2">
      {props.safetyError ? (
        <div className="rounded-md border border-redbrand/30 bg-redbrand/10 p-3 text-sm font-semibold text-ink sm:col-span-2">
          Bitte bestätige vor dem Start, dass die unabhängige Sicherheitsfreigabe eingerichtet und geprüft ist.
        </div>
      ) : null}
      <div className="rounded-lg border border-redbrand/30 bg-redbrand/10 p-4 sm:col-span-2">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-redbrand" />
          <div>
            <div className="font-semibold text-ink">Unabhängige Sicherheit prüfen</div>
            <p className="mt-1 text-sm leading-6 text-graphite">Eine physische Not- oder Sicherheitsfreigabe muss unabhängig von Portal, Internet, MQTT, ioBroker und Stromversorgung funktionieren.</p>
            <label className="mt-3 flex items-start gap-2 text-sm font-semibold text-ink">
              <input name="safetyConfirmed" type="checkbox" required className="mt-1" />
              Sicherheitsfreigabe ist eingerichtet und geprüft.
            </label>
          </div>
        </div>
      </div>
      <Field label="Session-Vorlage">
        <select name="templateId" className={inputClass} value={templateId} onChange={(event) => selectTemplate(event.target.value)} required>
          {props.templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
        </select>
      </Field>
      <p className="text-xs leading-5 text-graphite sm:col-span-2">Die Vorlage ist dein gespeicherter Ablauf mit festem Tracker-Vorschlag und zugehörigen Regeln. Du wählst sie bei jedem Start nur aus; sie wird dadurch nicht verändert.</p>
      <Field label="Tracker">
        <select name="trackerTypeId" className={inputClass} value={trackerTypeId} onChange={(event) => setTrackerTypeId(event.target.value)} required>
          {props.trackers.map((tracker) => <option key={tracker.id} value={tracker.id}>{tracker.title}</option>)}
        </select>
      </Field>
      {selected?.description ? <p className="text-sm text-graphite sm:col-span-2">{selected.description}</p> : null}
      <p className="text-xs text-graphite sm:col-span-2">Der Tracker ist von der Vorlage voreingestellt. Du kannst ihn für diesen einen Start ändern; die Vorlage selbst bleibt unverändert.</p>
      <Field label="Titel nur für diese Session (optional)"><input name="title" className={inputClass} placeholder={selected?.name || "Vorlagenname wird verwendet"} /></Field>
      <Field label="Notiz (optional)"><input name="notes" className={inputClass} /></Field>
      <div className="flex items-end sm:col-span-2"><SubmitButton pendingLabel="Startet..."><Play className="h-4 w-4" /> Session starten</SubmitButton></div>
    </form>
  );
}
