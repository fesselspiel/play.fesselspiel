"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, CheckCircle2, Clock, Cpu, GitBranch, Plus, RadioTower, Shuffle, Trash2, XCircle } from "lucide-react";
import {
  actionLabels,
  actionOptionsByCapability,
  automationRuleFlow,
  automationRuleSummary,
  buildStoredRule,
  conditionLabels,
  conditionOptions,
  defaultRuleActionValue,
  defaultRuleFormValue,
  labelAutomationValue,
  simulateAutomationRuleTimeline,
  timingLabels,
  triggerOptions,
  type AutomationActionKey,
  type AutomationConditionKey,
  type AutomationTimingKey,
  type AutomationTriggerKey,
  type CapabilityKind,
  type RuleActionFormValue,
  type RuleFormValue
} from "@/lib/automation-rule-model";
import { inputClass } from "@/components/ui";

type CapabilityOption = {
  id: string;
  kind: CapabilityKind;
  title: string;
  deviceName: string;
  deviceId: string;
  state: string;
};

type DeviceOption = {
  id: string;
  name: string;
  health: string;
};

type TrackerOption = {
  id: string;
  title: string;
  color: string;
};

function parseInitial(value?: string) {
  if (!value) return defaultRuleFormValue();
  try {
    return { ...defaultRuleFormValue(), ...JSON.parse(value) } as RuleFormValue;
  } catch {
    return defaultRuleFormValue();
  }
}

export function AutomationRuleEditor({
  initial,
  capabilities,
  devices,
  trackers,
  ruleId
}: {
  initial?: string;
  capabilities: CapabilityOption[];
  devices: DeviceOption[];
  trackers: TrackerOption[];
  ruleId?: string;
}) {
  const [value, setValue] = useState<RuleFormValue>(() => parseInitial(initial));
  const [scrubMinute, setScrubMinute] = useState(0);
  const availableConditions = conditionOptions[value.triggerType] || ["none"];
  const recoveryCapabilities = capabilities.filter((capability) => capability.kind === "Switch");
  const stored = useMemo(() => buildStoredRule(value), [value]);
  const context = useMemo(() => ({ capabilities, devices, trackers }), [capabilities, devices, trackers]);
  const summary = automationRuleSummary(stored, context);
  const flow = automationRuleFlow(stored, context);
  const simulation = simulateAutomationRuleTimeline({ ...stored, scrubMinute }, context);

  useEffect(() => {
    setValue((current) => normalizeActions(current));
  }, [capabilities]);

  function update(next: Partial<RuleFormValue>) {
    setValue((current) => {
      const merged = { ...current, ...next };
      const conditions = conditionOptions[merged.triggerType] || ["none"];
      if (!conditions.includes(merged.conditionType)) merged.conditionType = conditions[0];
      if (["device_online", "device_offline"].includes(merged.conditionType) && !merged.conditionDeviceId) {
        merged.conditionDeviceId = devices[0]?.id || "";
      }
      if (merged.conditionType === "capability_state" && !merged.conditionCapabilityId) {
        const first = capabilities[0];
        merged.conditionCapabilityId = first?.id || "";
        merged.conditionExpectedState = first?.state || "ONLINE";
      }
      if (merged.conditionType === "quota_remaining" && !merged.conditionTrackerTypeId) {
        merged.conditionTrackerTypeId = trackers[0]?.id || "";
      }
      const cap = capabilities.find((item) => item.id === merged.capabilityId);
      if (cap) {
        merged.capabilityKind = cap.kind;
        const actions = actionOptionsByCapability[cap.kind];
        if (!actions.includes(merged.actionType)) merged.actionType = actions[0];
      } else {
        merged.capabilityKind = "";
        merged.actionType = "session_finish";
      }
      if (merged.timingType === "immediate") {
        merged.delayMinutes = 0;
      }
      if (merged.maxMinutes < merged.minMinutes) merged.maxMinutes = merged.minMinutes;
      return normalizeActions(merged);
    });
  }

  function actionsForCapability(action: RuleActionFormValue): AutomationActionKey[] {
    const capability = capabilities.find((item) => item.id === action.capabilityId);
    if (!capability) return ["session_finish"];
    return actionOptionsByCapability[capability.kind] || ["session_finish"];
  }

  function normalizeAction(action: RuleActionFormValue): RuleActionFormValue {
    const capability = capabilities.find((item) => item.id === action.capabilityId);
    const next = { ...action };
    if (capability) {
      next.capabilityKind = capability.kind;
      const actions = actionOptionsByCapability[capability.kind] || ["session_finish"];
      if (!actions.includes(next.actionType)) next.actionType = actions[0];
    } else {
      next.capabilityId = "";
      next.capabilityKind = "";
      if (next.actionType !== "session_finish") next.actionType = "session_finish";
    }
    return next;
  }

  function normalizeActions(current: RuleFormValue): RuleFormValue {
    const actions = (current.actions?.length ? current.actions : [defaultRuleActionValue()]).map((action) => normalizeAction(action));
    const first = actions[0] || defaultRuleActionValue();
    return {
      ...current,
      actions,
      capabilityId: first.capabilityId,
      capabilityKind: first.capabilityKind,
      actionType: first.actionType,
      voiceText: first.voiceText,
      cameraMaxRetries: first.cameraMaxRetries,
      cameraTimeoutSeconds: first.cameraTimeoutSeconds,
      cameraBootDelaySeconds: first.cameraBootDelaySeconds,
      recoveryCapabilityId: first.recoveryCapabilityId
    };
  }

  function updateAction(index: number, patch: Partial<RuleActionFormValue>) {
    setValue((current) => {
      const actions = (current.actions?.length ? current.actions : [defaultRuleActionValue()]).map((action, actionIndex) => (
        actionIndex === index ? normalizeAction({ ...action, ...patch }) : normalizeAction(action)
      ));
      return normalizeActions({ ...current, actions });
    });
  }

  function addAction() {
    setValue((current) => normalizeActions({ ...current, actions: [...(current.actions?.length ? current.actions : [defaultRuleActionValue()]), defaultRuleActionValue()] }));
  }

  function removeAction(index: number) {
    setValue((current) => {
      const actions = (current.actions?.length ? current.actions : [defaultRuleActionValue()]).filter((_, actionIndex) => actionIndex !== index);
      return normalizeActions({ ...current, actions: actions.length ? actions : [defaultRuleActionValue()] });
    });
  }

  return (
    <div className="space-y-4">
      {ruleId ? <input type="hidden" name="ruleId" value={ruleId} /> : null}
      <input type="hidden" name="triggerType" value={stored.triggerType} />
      <input type="hidden" name="triggerJson" value={JSON.stringify(stored.triggerJson)} />
      <input type="hidden" name="conditionJson" value={JSON.stringify(stored.conditionJson)} />
      <input type="hidden" name="timingJson" value={JSON.stringify(stored.timingJson)} />
      <input type="hidden" name="actionJson" value={JSON.stringify(stored.actionJson)} />
      <input type="hidden" name="mode" value={value.mode} />

      <div className="rounded-lg border border-line bg-paper p-4">
        <div className="text-sm font-semibold text-ink">Regel in normaler Sprache</div>
        <p className="mt-2 text-sm leading-6 text-graphite">{summary}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        <section className="rounded-lg border border-line bg-paper p-4">
          <div className="flex items-center gap-2 font-semibold text-ink"><RadioTower className="h-4 w-4" /> Trigger</div>
          <select className={`${inputClass} mt-3`} value={value.triggerType} onChange={(event) => update({ triggerType: event.target.value as AutomationTriggerKey })}>
            {triggerOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
          <p className="mt-2 text-xs leading-5 text-graphite">{triggerOptions.find((option) => option.key === value.triggerType)?.description}</p>
        </section>

        <section className="rounded-lg border border-line bg-paper p-4">
          <div className="flex items-center gap-2 font-semibold text-ink"><CheckCircle2 className="h-4 w-4" /> Bedingungen</div>
          <select className={`${inputClass} mt-3`} value={value.conditionType} onChange={(event) => update({ conditionType: event.target.value as AutomationConditionKey })}>
            {availableConditions.map((key) => <option key={key} value={key}>{conditionLabels[key]}</option>)}
          </select>
          {value.conditionType === "controller_absent" ? (
            <label className="mt-3 block text-sm text-graphite">Zeitraum
              <div className="mt-1 flex items-center gap-2">
                <input className={inputClass} type="number" min={1} value={value.conditionMinutes} onChange={(event) => update({ conditionMinutes: Number(event.target.value) })} />
                <span>Minuten</span>
              </div>
            </label>
          ) : null}
          {value.conditionType === "device_online" || value.conditionType === "device_offline" ? (
            <label className="mt-3 block text-sm text-graphite">Gerät
              <select className={`${inputClass} mt-1`} value={value.conditionDeviceId} onChange={(event) => update({ conditionDeviceId: event.target.value })}>
                {devices.length ? devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>) : <option value="">Kein Gerät eingerichtet</option>}
              </select>
            </label>
          ) : null}
          {value.conditionType === "capability_state" ? (
            <div className="mt-3 grid gap-2 text-sm text-graphite">
              <label>Fähigkeit
                <select className={`${inputClass} mt-1`} value={value.conditionCapabilityId} onChange={(event) => update({ conditionCapabilityId: event.target.value })}>
                  {capabilities.length ? capabilities.map((capability) => (
                    <option key={capability.id} value={capability.id}>{capability.deviceName} · {capability.title}</option>
                  )) : <option value="">Keine Fähigkeit eingerichtet</option>}
                </select>
              </label>
              <label>Erwarteter Zustand
                <select className={`${inputClass} mt-1`} value={value.conditionExpectedState} onChange={(event) => update({ conditionExpectedState: event.target.value })}>
                  <option value="ONLINE">Verbunden</option>
                  <option value="OFFLINE">Nicht erreichbar</option>
                  <option value="BOOTING">Startet</option>
                  <option value="ERROR">Fehler</option>
                  <option value="ON">Eingeschaltet</option>
                  <option value="OFF">Ausgeschaltet</option>
                </select>
              </label>
            </div>
          ) : null}
          {value.conditionType === "quota_remaining" ? (
            <label className="mt-3 block text-sm text-graphite">Tracker
              <select className={`${inputClass} mt-1`} value={value.conditionTrackerTypeId} onChange={(event) => update({ conditionTrackerTypeId: event.target.value })}>
                {trackers.length ? trackers.map((tracker) => <option key={tracker.id} value={tracker.id}>{tracker.title}</option>) : <option value="">Kein Tracker eingerichtet</option>}
              </select>
            </label>
          ) : null}
        </section>

        <section className="rounded-lg border border-line bg-paper p-4">
          <div className="flex items-center gap-2 font-semibold text-ink"><Clock className="h-4 w-4" /> Zeitlogik</div>
          <select className={`${inputClass} mt-3`} value={value.timingType} onChange={(event) => update({ timingType: event.target.value as AutomationTimingKey })}>
            {Object.entries(timingLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          {value.timingType === "fixed_delay" ? (
            <label className="mt-3 block text-sm text-graphite">Wartezeit
              <div className="mt-1 flex items-center gap-2">
                <input className={inputClass} type="number" min={1} value={value.delayMinutes || 1} onChange={(event) => update({ delayMinutes: Number(event.target.value) })} />
                <span>Minuten</span>
              </div>
            </label>
          ) : null}
          {value.timingType === "random_delay" ? (
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-graphite">
              <label>Min.
                <input className={`${inputClass} mt-1`} type="number" min={0} value={value.minMinutes} onChange={(event) => update({ minMinutes: Number(event.target.value) })} />
              </label>
              <label>Max.
                <input className={`${inputClass} mt-1`} type="number" min={value.minMinutes} value={value.maxMinutes} onChange={(event) => update({ maxMinutes: Number(event.target.value) })} />
              </label>
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border border-line bg-paper p-4 lg:col-span-4">
          <div className="flex items-center gap-2 font-semibold text-ink"><Cpu className="h-4 w-4" /> Aktion</div>
          <div className="mt-3 space-y-3">
            {value.actions.map((action, index) => {
              const availableActions = actionsForCapability(action);
              return (
                <div key={index} className="rounded-md border border-line bg-surface p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-ink">Aktion {index + 1}</div>
                      <div className="text-xs text-graphite">Wird zur fälligen Zeit dieser Regel ausgeführt.</div>
                    </div>
                    {value.actions.length > 1 ? (
                      <button type="button" onClick={() => removeAction(index)} className="inline-flex items-center gap-1 rounded-md border border-line bg-paper px-2 py-1 text-xs font-semibold text-graphite hover:border-redbrand hover:text-redbrand">
                        <Trash2 className="h-3 w-3" /> Entfernen
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <label className="text-sm text-graphite">Ziel
                      <select className={`${inputClass} mt-1`} value={action.capabilityId} onChange={(event) => updateAction(index, { capabilityId: event.target.value })}>
                        <option value="">Portal-Aktion ohne Gerät</option>
                        {capabilities.map((capability) => (
                          <option key={capability.id} value={capability.id}>{capability.deviceName} · {capability.title}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm text-graphite">Aktion
                      <select className={`${inputClass} mt-1`} value={action.actionType} onChange={(event) => updateAction(index, { actionType: event.target.value as AutomationActionKey })}>
                        {availableActions.map((key) => <option key={key} value={key}>{actionLabels[key]}</option>)}
                      </select>
                    </label>
                  </div>
                  {action.actionType === "voice_speak" ? (
                    <textarea className={`${inputClass} mt-2`} value={action.voiceText} onChange={(event) => updateAction(index, { voiceText: event.target.value })} rows={2} placeholder="Text, den ioBroker sprechen soll" />
                  ) : null}
                  {action.actionType === "camera_request_image" ? (
                    <div className="mt-3 space-y-2 text-sm text-graphite">
                      <div className="grid grid-cols-2 gap-2">
                        <label>Timeout
                          <div className="mt-1 flex items-center gap-2">
                            <input className={inputClass} type="number" min={1} value={action.cameraTimeoutSeconds} onChange={(event) => updateAction(index, { cameraTimeoutSeconds: Number(event.target.value) })} />
                            <span>Sek.</span>
                          </div>
                        </label>
                        <label>Wiederholungen
                          <input className={`${inputClass} mt-1`} type="number" min={0} max={10} value={action.cameraMaxRetries} onChange={(event) => updateAction(index, { cameraMaxRetries: Number(event.target.value) })} />
                        </label>
                      </div>
                      <label>Boot-Wartezeit
                        <div className="mt-1 flex items-center gap-2">
                          <input className={inputClass} type="number" min={0} value={action.cameraBootDelaySeconds} onChange={(event) => updateAction(index, { cameraBootDelaySeconds: Number(event.target.value) })} />
                          <span>Sek.</span>
                        </div>
                      </label>
                      <label>Neustart-Schalter
                        <select className={`${inputClass} mt-1`} value={action.recoveryCapabilityId} onChange={(event) => updateAction(index, { recoveryCapabilityId: event.target.value })}>
                          <option value="">Kein automatischer Neustart</option>
                          {recoveryCapabilities.map((capability) => (
                            <option key={capability.id} value={capability.id}>{capability.deviceName} · {capability.title}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : null}
                </div>
              );
            })}
            <button type="button" onClick={addAction} className="inline-flex items-center gap-2 rounded-md border border-line bg-paper px-3 py-2 text-sm font-semibold text-ink hover:border-redbrand hover:text-redbrand">
              <Plus className="h-4 w-4" /> Weitere Aktion hinzufügen
            </button>
          </div>
        </section>
      </div>

      <label className="block max-w-xs text-sm font-medium text-graphite">Ausführung
        <select className={`${inputClass} mt-1`} value={value.mode} onChange={(event) => update({ mode: event.target.value as "ONCE" | "REPEAT" })}>
          <option value="ONCE">Einmalig</option>
          <option value="REPEAT">Wiederholend</option>
        </select>
      </label>

      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="mb-3 flex items-center gap-2 font-semibold text-ink"><GitBranch className="h-4 w-4" /> Ablauf</div>
        <div className="flex flex-col items-center gap-2 md:flex-row md:flex-wrap">
          {flow.map((step, index) => (
            <div key={`${step}-${index}`} className="flex items-center gap-2">
              {index ? <ArrowDown className="h-4 w-4 rotate-0 text-redbrand md:-rotate-90" /> : null}
              <div className="rounded-md border border-line bg-paper px-3 py-2 text-sm font-semibold text-ink">{step}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-line bg-paper p-4">
        <div className="flex items-center gap-2 font-semibold text-ink"><Shuffle className="h-4 w-4" /> Simulation</div>
        <input className="mt-4 w-full accent-redbrand" type="range" min={0} max={simulation.durationMinutes} value={scrubMinute} onChange={(event) => setScrubMinute(Number(event.target.value))} />
        <div className="mt-2 text-sm text-graphite">Simulationszeitpunkt: Minute {simulation.scrubMinute} von {simulation.durationMinutes}</div>
        <div className="mt-3 rounded-md border border-redbrand/20 bg-redbrand/5 p-3 text-sm font-medium text-ink">{simulation.explanation}</div>
        <div className="mt-4 overflow-x-auto">
          <div className="flex min-w-max items-stretch gap-2">
            {simulation.timeline.map((item) => (
              <div key={`${item.minute}-${item.title}`} className={`w-44 rounded-md border p-3 text-sm ${item.minute <= simulation.scrubMinute ? "border-redbrand/40 bg-redbrand/10 text-ink" : "border-line bg-surface text-graphite"}`}>
                <div className="text-xs font-semibold uppercase text-graphite">Minute {item.minute}</div>
                <div className="mt-1 font-semibold">{item.title}</div>
                <div className="mt-2 text-xs">{item.status}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <SimBox title="Session-Zustand" items={[labelAutomationValue("states", simulation.sessionState)]} />
          <SimBox title="Ereignisse" items={simulation.events.map((item) => `${item.minute} min · ${item.title}`)} />
          <SimBox title="Bedingungen" items={simulation.conditions.map((item) => `${item.title}: ${item.passed ? "erfüllt" : "noch offen"} · ${item.result}`)} />
          <SimBox title="Ausgelöste Regeln" items={simulation.triggeredRules} />
          <SimBox title="Wartende Aktionen" items={simulation.waitingActions.map((item) => `${item.minute} min · ${item.title}`)} />
          <SimBox title="Fällige Aktionen" items={simulation.dueActions.map((item) => `${item.minute} min · ${item.title}`)} />
          <SimBox title="Simulierte Aktionen" items={simulation.completedActions.map((item) => `${item.minute} min · ${item.title}`)} />
          <SimBox title="Vorgemerktes Ende" items={simulation.pendingEnd.map((item) => `${item.state}: ${item.text}`)} />
          <SimBox title="Recovery bei Fehler" items={simulation.recoveryActions.map((item) => `${item.minute} min · ${item.title}`)} />
          <SimBox title="Zufallswerte" items={simulation.randomValues.map((item) => `${item.label}: ${item.value}`)} />
        </div>
        <details className="mt-3 rounded-md border border-line bg-surface p-3">
          <summary className="cursor-pointer list-none text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">Technische Simulationsvariablen</summary>
          <pre className="mt-2 overflow-auto text-xs text-graphite">{JSON.stringify(simulation.variables, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

function SimBox({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <div className="text-sm font-semibold text-ink">{title}</div>
      <div className="mt-2 space-y-1 text-sm text-graphite">
        {items.length ? items.map((item) => <div key={item}>{item}</div>) : <div className="flex items-center gap-1"><XCircle className="h-3 w-3" /> nichts</div>}
      </div>
    </div>
  );
}
