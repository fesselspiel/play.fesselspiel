"use client";

import { useState } from "react";
import { Play, ShieldCheck } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { Field, inputClass } from "@/components/ui";

type TemplateOption = {
  id: string;
  name: string;
  description: string | null;
  defaultTrackerTypeId: string | null;
  steps: string[];
  availableActions: string[];
};
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
    <form action={props.action} className="mt-4 space-y-4">
      {props.safetyError ? (
        <div className="rounded-md border border-redbrand/30 bg-redbrand/10 p-3 text-sm font-semibold text-ink">
          Bitte bestätige vor dem Start, dass die unabhängige Sicherheitsfreigabe eingerichtet und geprüft ist.
        </div>
      ) : null}
      <Field label="Welche Session möchtest du starten?">
        <select name="templateId" className={inputClass} value={templateId} onChange={(event) => selectTemplate(event.target.value)} required>
          {props.templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
        </select>
      </Field>
      {selected ? (
        <section className="rounded-lg border border-line bg-surface p-4" aria-live="polite">
          <h3 className="text-lg font-semibold text-ink">{selected.name}</h3>
          {selected.description ? <p className="mt-1 text-sm leading-6 text-graphite">{selected.description}</p> : null}
          <div className="mt-4 font-semibold text-ink">So läuft die Session ab</div>
          {selected.steps.length ? (
            <ol className="mt-3 space-y-3">
              {selected.steps.map((step, index) => (
                <li key={`${index}-${step}`} className="flex items-start gap-3 text-sm leading-6 text-graphite">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-redbrand text-xs font-bold text-white">{index + 1}</span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          ) : <p className="mt-2 text-sm text-graphite">Für diese Session ist noch kein Ablauf beschrieben.</p>}
          {selected.availableActions.length ? (
            <div className="mt-4 rounded-md border border-line bg-paper p-3">
              <div className="text-sm font-semibold text-ink">Zusätzlich möglich</div>
              <ul className="mt-1 space-y-1 text-sm leading-6 text-graphite">
                {selected.availableActions.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
      <details className="rounded-lg border border-line bg-paper p-4">
        <summary className="cursor-pointer list-none font-semibold text-ink [&::-webkit-details-marker]:hidden">Angaben für diesen Start ändern <span className="font-normal text-graphite">(optional)</span></summary>
        <p className="mt-1 text-sm text-graphite">Die Session ist bereits fertig eingestellt. Öffne diesen Bereich nur, wenn du Tracker, Titel oder Notiz für diesen einen Start ändern möchtest.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Tracker">
            <select name="trackerTypeId" className={inputClass} value={trackerTypeId} onChange={(event) => setTrackerTypeId(event.target.value)} required>
              {props.trackers.map((tracker) => <option key={tracker.id} value={tracker.id}>{tracker.title}</option>)}
            </select>
          </Field>
          <Field label="Eigener Titel (optional)"><input name="title" className={inputClass} placeholder={selected?.name || "Name der Session"} /></Field>
          <div className="sm:col-span-2"><Field label="Notiz (optional)"><input name="notes" className={inputClass} /></Field></div>
        </div>
      </details>
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
      <div className="flex items-end"><SubmitButton pendingLabel="Startet..."><Play className="h-4 w-4" /> {selected?.name || "Session"} starten</SubmitButton></div>
    </form>
  );
}
