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
  defaultRuleConditionValue,
  defaultRuleFormValue,
  labelAutomationValue,
  simulateAutomationRuleTimeline,
  timingLabels,
  triggerCapabilityFilter,
  triggerNeedsCapability,
  triggerNeedsDevice,
  triggerOptions,
  validateAutomationRulePayload,
  type AutomationActionKey,
  type AutomationConditionKey,
  type AutomationTimingKey,
  type AutomationTriggerKey,
  type CapabilityKind,
  type RuleActionFormValue,
  type RuleConditionFormValue,
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

type AutomationRuleEditorProps = {
  initial?: string;
  capabilities: CapabilityOption[];
  devices: DeviceOption[];
  trackers: TrackerOption[];
  ruleId?: string;
  ruleName?: string;
  ruleVersion?: number;
};

function stateOptionsForCapability(kind?: CapabilityKind) {
  if (kind === "Switch") return [
    ["ON", "Eingeschaltet"],
    ["OFF", "Ausgeschaltet"],
    ["ERROR", "Fehler"],
    ["OFFLINE", "Nicht erreichbar"]
  ];
  if (kind === "Voice") return [
    ["ONLINE", "Verbunden"],
    ["OFFLINE", "Nicht erreichbar"],
    ["ERROR", "Fehler"]
  ];
  return [
    ["ONLINE", "Verbunden"],
    ["OFFLINE", "Nicht erreichbar"],
    ["BOOTING", "Startet"],
    ["ERROR", "Fehler"]
  ];
}

function capabilityKindLabel(kind?: CapabilityKind | null) {
  if (kind === "Camera") return "Kameras";
  if (kind === "Switch") return "Schalter";
  if (kind === "Voice") return "Sprachausgaben";
  return "Gerätefähigkeiten";
}

function emptyCapabilityText(kind?: CapabilityKind | null) {
  if (kind === "Camera") return "Keine Kamera eingerichtet";
  if (kind === "Switch") return "Kein Schalter eingerichtet";
  if (kind === "Voice") return "Keine Sprachausgabe eingerichtet";
  return "Keine Fähigkeit eingerichtet";
}

function actionCapabilityKind(actionType: AutomationActionKey): CapabilityKind | "" {
  if (actionType === "camera_request_image" || actionType === "camera_health_check") return "Camera";
  if (actionType === "switch_on" || actionType === "switch_off" || actionType === "switch_toggle") return "Switch";
  if (actionType === "voice_speak") return "Voice";
  return "";
}

function actionTypeOptions(capabilities: CapabilityOption[]) {
  const availableKinds = new Set(capabilities.map((capability) => capability.kind));
  return [
    { key: "session_finish" as AutomationActionKey, label: actionLabels.session_finish, helper: "Portal-Aktion, kein Gerät nötig", disabled: false },
    { key: "camera_request_image" as AutomationActionKey, label: actionLabels.camera_request_image, helper: "Kamera", disabled: !availableKinds.has("Camera") },
    { key: "camera_health_check" as AutomationActionKey, label: actionLabels.camera_health_check, helper: "Kamera", disabled: !availableKinds.has("Camera") },
    { key: "switch_on" as AutomationActionKey, label: actionLabels.switch_on, helper: "Schalter", disabled: !availableKinds.has("Switch") },
    { key: "switch_off" as AutomationActionKey, label: actionLabels.switch_off, helper: "Schalter", disabled: !availableKinds.has("Switch") },
    { key: "switch_toggle" as AutomationActionKey, label: actionLabels.switch_toggle, helper: "Schalter", disabled: !availableKinds.has("Switch") },
    { key: "voice_speak" as AutomationActionKey, label: actionLabels.voice_speak, helper: "Sprachausgabe", disabled: !availableKinds.has("Voice") }
  ];
}

function parseInitial(value?: string) {
  if (!value) return defaultRuleFormValue();
  try {
    return { ...defaultRuleFormValue(), ...JSON.parse(value) } as RuleFormValue;
  } catch {
    return defaultRuleFormValue();
  }
}

export function AutomationRuleEditor(props: AutomationRuleEditorProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="rounded-lg border border-line bg-surface p-4 text-sm text-graphite">
        Der Regel-Editor wird vorbereitet. Danach kannst du Auslöser, Bedingungen, Zeitlogik, Aktionen und Simulation bearbeiten.
      </div>
    );
  }

  return <AutomationRuleEditorClient {...props} />;
}

function AutomationRuleEditorClient({
  initial,
  capabilities,
  devices,
  trackers,
  ruleId,
  ruleName,
  ruleVersion
}: AutomationRuleEditorProps) {
  const [value, setValue] = useState<RuleFormValue>(() => parseInitial(initial));
  const [scrubMinute, setScrubMinute] = useState(0);
  const [simulateControllerAction, setSimulateControllerAction] = useState(false);
  const [controllerActionMinute, setControllerActionMinute] = useState(19);
  const [simulatedDeviceHealth, setSimulatedDeviceHealth] = useState<Record<string, string>>({});
  const [simulatedCapabilityState, setSimulatedCapabilityState] = useState<Record<string, string>>({});
  const [simulatedLastImageAgeSeconds, setSimulatedLastImageAgeSeconds] = useState<Record<string, number>>({});
  const [simulatedCapabilityStateAgeMinutes, setSimulatedCapabilityStateAgeMinutes] = useState<Record<string, number>>({});
  const activeConditions = value.conditions?.length ? value.conditions : [defaultRuleConditionValue(value.conditionType)];
  const availableConditions = conditionOptions[value.triggerType] || ["none"];
  const hasControllerAbsenceCondition = activeConditions.some((condition) => condition.conditionType === "controller_absent");
  const absenceCondition = activeConditions.find((condition) => condition.conditionType === "controller_absent");
  const deviceCondition = activeConditions.find((condition) => condition.conditionType === "device_online" || condition.conditionType === "device_offline");
  const capabilityCondition = activeConditions.find((condition) => condition.conditionType === "capability_state");
  const lastImageCondition = activeConditions.find((condition) => condition.conditionType === "last_image_younger_than");
  const switchCondition = activeConditions.find((condition) => condition.conditionType === "switch_state_for");
  const simulationCapability = capabilities.find((capability) => capability.id === capabilityCondition?.conditionCapabilityId);
  const switchSimulationCapability = capabilities.find((capability) => capability.id === switchCondition?.conditionCapabilityId);
  const recoveryCapabilities = capabilities.filter((capability) => capability.kind === "Switch");
  const stored = useMemo(() => buildStoredRule(value), [value]);
  const context = useMemo(() => ({
    capabilities,
    devices,
    trackers,
    simulationOverrides: {
      deviceHealth: simulatedDeviceHealth,
      capabilityState: simulatedCapabilityState,
      lastImageAgeSeconds: simulatedLastImageAgeSeconds,
      capabilityStateAgeMinutes: simulatedCapabilityStateAgeMinutes
    }
  }), [capabilities, devices, trackers, simulatedDeviceHealth, simulatedCapabilityState, simulatedLastImageAgeSeconds, simulatedCapabilityStateAgeMinutes]);
  const summary = automationRuleSummary(stored, context);
  const flow = automationRuleFlow(stored, context);
  const validation = useMemo(() => validateAutomationRulePayload({
    name: "Regel",
    mode: stored.mode,
    triggerType: stored.triggerType,
    triggerJson: stored.triggerJson,
    conditionJson: stored.conditionJson,
    timingJson: stored.timingJson,
    actionJson: stored.actionJson
  }, capabilities, devices, trackers), [stored, capabilities, devices, trackers]);
  const simulation = simulateAutomationRuleTimeline({
    ...stored,
    scrubMinute,
    controllerActionMinute: hasControllerAbsenceCondition && simulateControllerAction ? controllerActionMinute : null
  }, context);
  const simulationJumpPoints = useMemo(() => {
    const points = new Map<number, string>();
    simulation.timeline.forEach((item) => {
      if (!points.has(item.minute)) points.set(item.minute, item.title);
    });
    return Array.from(points.entries()).sort(([left], [right]) => left - right);
  }, [simulation.timeline]);
  const triggerCapabilityKind = triggerCapabilityFilter(value.triggerType);
  const triggerCapabilities = triggerCapabilityKind ? capabilities.filter((capability) => capability.kind === triggerCapabilityKind) : capabilities;

  useEffect(() => {
    setValue((current) => normalizeRuleForm(current));
  }, [capabilities, devices, trackers]);

  function update(next: Partial<RuleFormValue>) {
    setValue((current) => {
      const merged = { ...current, ...next };
      const conditions = conditionOptions[merged.triggerType] || ["none"];
      if (!conditions.includes(merged.conditionType)) merged.conditionType = conditions[0];
      if (["device_online", "device_offline"].includes(merged.conditionType) && !merged.conditionDeviceId) {
        merged.conditionDeviceId = devices[0]?.id || "";
      }
      if (merged.conditionType === "capability_state" && !merged.conditionCapabilityId) {
        const requiredKind = triggerCapabilityFilter(merged.triggerType);
        const first = requiredKind ? capabilities.find((capability) => capability.kind === requiredKind) : capabilities[0];
        merged.conditionCapabilityId = first?.id || "";
        merged.conditionExpectedState = first?.state || "ONLINE";
      }
      if (merged.conditionType === "last_image_younger_than" && !merged.conditionCapabilityId) {
        merged.conditionCapabilityId = capabilities.find((capability) => capability.kind === "Camera")?.id || "";
        merged.conditionImageMaxAgeSeconds = Math.max(1, merged.conditionImageMaxAgeSeconds || 300);
      }
      if (merged.conditionType === "switch_state_for" && !merged.conditionCapabilityId) {
        merged.conditionCapabilityId = capabilities.find((capability) => capability.kind === "Switch")?.id || "";
        if (!["ON", "OFF"].includes(merged.conditionExpectedState)) merged.conditionExpectedState = "ON";
        merged.conditionStateAgeMinutes = Math.max(1, merged.conditionStateAgeMinutes || 5);
      }
      if (merged.conditionType === "quota_remaining" && !merged.conditionTrackerTypeId) {
        merged.conditionTrackerTypeId = trackers[0]?.id || "";
      }
      if (merged.timingType === "immediate") {
        merged.delayMinutes = 0;
      }
      if (merged.maxMinutes < merged.minMinutes) merged.maxMinutes = merged.minMinutes;
      return normalizeRuleForm(merged);
    });
  }

  function conditionCapabilityKindFor(conditionType: AutomationConditionKey) {
    if (conditionType === "last_image_younger_than") return "Camera";
    if (conditionType === "switch_state_for") return "Switch";
    return triggerCapabilityFilter(value.triggerType);
  }

  function normalizeCondition(condition: RuleConditionFormValue, triggerType = value.triggerType): RuleConditionFormValue {
    const next = { ...condition };
    const conditions = conditionOptions[triggerType] || ["none"];
    if (!conditions.includes(next.conditionType)) next.conditionType = conditions[0];
    if (["device_online", "device_offline"].includes(next.conditionType)) {
      if (!devices.some((device) => device.id === next.conditionDeviceId)) next.conditionDeviceId = devices[0]?.id || "";
    } else {
      next.conditionDeviceId = "";
    }
    if (["capability_state", "last_image_younger_than", "switch_state_for"].includes(next.conditionType)) {
      const requiredKind = next.conditionType === "last_image_younger_than" ? "Camera" : next.conditionType === "switch_state_for" ? "Switch" : triggerCapabilityFilter(triggerType);
      const allowed = requiredKind ? capabilities.filter((capability) => capability.kind === requiredKind) : capabilities;
      const currentCapability = allowed.find((capability) => capability.id === next.conditionCapabilityId);
      if (!currentCapability) {
        const first = allowed[0];
        next.conditionCapabilityId = first?.id || "";
        next.conditionExpectedState = first?.state || "ONLINE";
      } else if (next.conditionType === "capability_state") {
        const validStates = stateOptionsForCapability(currentCapability.kind).map(([key]) => key);
        if (!validStates.includes(next.conditionExpectedState)) next.conditionExpectedState = validStates[0] || "ONLINE";
      }
      if (next.conditionType === "last_image_younger_than") next.conditionImageMaxAgeSeconds = Math.max(1, next.conditionImageMaxAgeSeconds || 300);
      if (next.conditionType === "switch_state_for") {
        if (!["ON", "OFF"].includes(next.conditionExpectedState)) next.conditionExpectedState = "ON";
        next.conditionStateAgeMinutes = Math.max(1, next.conditionStateAgeMinutes || 5);
      }
    } else {
      next.conditionCapabilityId = "";
    }
    if (next.conditionType === "quota_remaining") {
      if (!trackers.some((tracker) => tracker.id === next.conditionTrackerTypeId)) next.conditionTrackerTypeId = trackers[0]?.id || "";
    } else {
      next.conditionTrackerTypeId = "";
    }
    return next;
  }

  function normalizeConditions(current: RuleFormValue): RuleFormValue {
    const conditions = (current.conditions?.length ? current.conditions : [defaultRuleConditionValue(current.conditionType)]).map((condition) => normalizeCondition(condition, current.triggerType));
    const first = conditions[0] || defaultRuleConditionValue();
    return {
      ...current,
      conditions,
      conditionType: first.conditionType,
      conditionMinutes: first.conditionMinutes,
      conditionDeviceId: first.conditionDeviceId,
      conditionCapabilityId: first.conditionCapabilityId,
      conditionExpectedState: first.conditionExpectedState,
      conditionImageMaxAgeSeconds: first.conditionImageMaxAgeSeconds,
      conditionStateAgeMinutes: first.conditionStateAgeMinutes,
      conditionTrackerTypeId: first.conditionTrackerTypeId
    };
  }

  function capabilitiesForAction(actionType: AutomationActionKey) {
    const kind = actionCapabilityKind(actionType);
    return kind ? capabilities.filter((capability) => capability.kind === kind) : [];
  }

  function normalizeAction(action: RuleActionFormValue): RuleActionFormValue {
    const capability = capabilities.find((item) => item.id === action.capabilityId);
    const next = { ...action };
    const requiredKind = actionCapabilityKind(next.actionType);
    if (!requiredKind) {
      next.capabilityId = "";
      next.capabilityKind = "";
    } else if (capability && capability.kind === requiredKind) {
      next.capabilityKind = capability.kind;
    } else {
      const first = capabilities.find((item) => item.kind === requiredKind);
      next.capabilityId = first?.id || "";
      next.capabilityKind = first?.kind || "";
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

  function normalizeRuleForm(current: RuleFormValue): RuleFormValue {
    const next = { ...current };
    const triggerCapKind = triggerCapabilityFilter(next.triggerType);
    const triggerCaps = triggerCapKind ? capabilities.filter((capability) => capability.kind === triggerCapKind) : capabilities;
    if (triggerNeedsDevice(next.triggerType)) {
      if (!devices.some((device) => device.id === next.triggerDeviceId)) next.triggerDeviceId = devices[0]?.id || "";
    } else {
      next.triggerDeviceId = "";
    }
    if (triggerNeedsCapability(next.triggerType)) {
      if (!triggerCaps.some((capability) => capability.id === next.triggerCapabilityId)) next.triggerCapabilityId = triggerCaps[0]?.id || "";
    } else {
      next.triggerCapabilityId = "";
    }
    return normalizeActions(normalizeConditions(next));
  }

  function updateCondition(index: number, patch: Partial<RuleConditionFormValue>) {
    setValue((current) => {
      const source = current.conditions?.length ? current.conditions : [defaultRuleConditionValue(current.conditionType)];
      const conditions = source.map((condition, conditionIndex) => (
        conditionIndex === index ? normalizeCondition({ ...condition, ...patch }, current.triggerType) : normalizeCondition(condition, current.triggerType)
      ));
      return normalizeRuleForm({ ...current, conditions });
    });
  }

  function addCondition() {
    setValue((current) => normalizeRuleForm({ ...current, conditions: [...(current.conditions?.length ? current.conditions : [defaultRuleConditionValue(current.conditionType)]), defaultRuleConditionValue()] }));
  }

  function removeCondition(index: number) {
    setValue((current) => {
      const conditions = (current.conditions?.length ? current.conditions : [defaultRuleConditionValue(current.conditionType)]).filter((_, conditionIndex) => conditionIndex !== index);
      return normalizeRuleForm({ ...current, conditions: conditions.length ? conditions : [defaultRuleConditionValue()] });
    });
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

      <div className={`rounded-lg border p-4 ${validation.ok ? "border-line bg-paper" : "border-redbrand/30 bg-redbrand/10"}`}>
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          {validation.ok ? <CheckCircle2 className="h-4 w-4 text-redbrand" /> : <XCircle className="h-4 w-4 text-redbrand" />}
          Regelprüfung
        </div>
        {validation.ok ? (
          <p className="mt-2 text-sm leading-6 text-graphite">Diese Regel ist vollständig und kann gespeichert werden.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm leading-6 text-graphite">
            {validation.errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <section className="rounded-lg border border-line bg-paper p-4">
          <div className="flex items-center gap-2 font-semibold text-ink"><RadioTower className="h-4 w-4" /> Auslöser</div>
          <select className={`${inputClass} mt-3`} value={value.triggerType} onChange={(event) => update({ triggerType: event.target.value as AutomationTriggerKey })}>
            {triggerOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
          <p className="mt-2 text-xs leading-5 text-graphite">{triggerOptions.find((option) => option.key === value.triggerType)?.description}</p>
          {triggerNeedsDevice(value.triggerType) ? (
            <label className="mt-3 block text-sm text-graphite">Auslöser-Gerät
              <select className={`${inputClass} mt-1`} value={value.triggerDeviceId} onChange={(event) => update({ triggerDeviceId: event.target.value })}>
                {devices.length ? devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>) : <option value="">Kein Gerät eingerichtet</option>}
              </select>
            </label>
          ) : null}
          {triggerNeedsCapability(value.triggerType) ? (
            <label className="mt-3 block text-sm text-graphite">Auslöser-Fähigkeit
              <select className={`${inputClass} mt-1`} value={value.triggerCapabilityId} onChange={(event) => update({ triggerCapabilityId: event.target.value })}>
                {triggerCapabilities.length ? (
                  <optgroup label={capabilityKindLabel(triggerCapabilityKind)}>
                    {triggerCapabilities.map((capability) => (
                      <option key={capability.id} value={capability.id}>{capability.deviceName} · {capability.title}</option>
                    ))}
                  </optgroup>
                ) : <option value="">{emptyCapabilityText(triggerCapabilityKind)}</option>}
              </select>
              <span className="mt-1 block text-xs leading-5 text-graphite">
                Der gewählte Auslöser kann nur mit passenden {capabilityKindLabel(triggerCapabilityKind).toLowerCase()} verbunden werden.
              </span>
            </label>
          ) : null}
        </section>

        <section className="rounded-lg border border-line bg-paper p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold text-ink"><CheckCircle2 className="h-4 w-4" /> Bedingungen</div>
            <button type="button" onClick={addCondition} className="inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink hover:border-redbrand hover:text-redbrand">
              <Plus className="mr-2 h-4 w-4" /> Bedingung hinzufügen
            </button>
          </div>
          <p className="mt-2 text-xs leading-5 text-graphite">
            Mehrere Bedingungen werden als UND-Kette geprüft: Die Aktion wird erst geplant, wenn jede einzelne Bedingung erfüllt ist.
          </p>
          <div className="mt-3 space-y-3">
            {activeConditions.map((condition, index) => {
              const conditionCapabilityKind = conditionCapabilityKindFor(condition.conditionType);
              const conditionCapabilities = conditionCapabilityKind ? capabilities.filter((capability) => capability.kind === conditionCapabilityKind) : capabilities;
              const conditionCapability = capabilities.find((capability) => capability.id === condition.conditionCapabilityId);
              const conditionStateOptions = stateOptionsForCapability(conditionCapability?.kind);
              return (
                <div key={`condition-${index}`} className="rounded-md border border-line bg-surface p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-ink">{activeConditions.length > 1 ? `Bedingung ${index + 1}` : "Bedingung"}</div>
                    {activeConditions.length > 1 ? (
                      <button type="button" onClick={() => removeCondition(index)} className="inline-flex min-h-9 items-center rounded-md border border-line bg-paper px-3 py-1 text-xs font-semibold text-ink hover:border-redbrand hover:text-redbrand">
                        <Trash2 className="mr-1 h-3 w-3" /> Entfernen
                      </button>
                    ) : null}
                  </div>
                  <select className={`${inputClass} mt-3`} value={condition.conditionType} onChange={(event) => updateCondition(index, { conditionType: event.target.value as AutomationConditionKey })}>
                    {availableConditions.map((key) => <option key={key} value={key}>{conditionLabels[key]}</option>)}
                  </select>
                  {condition.conditionType === "controller_absent" ? (
                    <label className="mt-3 block text-sm text-graphite">Zeitraum
                      <div className="mt-1 flex items-center gap-2">
                        <input className={inputClass} type="number" min={1} value={condition.conditionMinutes} onChange={(event) => updateCondition(index, { conditionMinutes: Number(event.target.value) })} />
                        <span>Minuten</span>
                      </div>
                    </label>
                  ) : null}
                  {condition.conditionType === "device_online" || condition.conditionType === "device_offline" ? (
                    <label className="mt-3 block text-sm text-graphite">Gerät
                      <select className={`${inputClass} mt-1`} value={condition.conditionDeviceId} onChange={(event) => updateCondition(index, { conditionDeviceId: event.target.value })}>
                        {devices.length ? devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>) : <option value="">Kein Gerät eingerichtet</option>}
                      </select>
                    </label>
                  ) : null}
                  {condition.conditionType === "capability_state" ? (
                    <div className="mt-3 grid gap-2 text-sm text-graphite">
                      <label>Fähigkeit
                        <select className={`${inputClass} mt-1`} value={condition.conditionCapabilityId} onChange={(event) => updateCondition(index, { conditionCapabilityId: event.target.value })}>
                          {conditionCapabilities.length ? (
                            <optgroup label={capabilityKindLabel(conditionCapabilityKind)}>
                              {conditionCapabilities.map((capability) => (
                                <option key={capability.id} value={capability.id}>{capability.deviceName} · {capability.title}</option>
                              ))}
                            </optgroup>
                          ) : <option value="">{emptyCapabilityText(conditionCapabilityKind)}</option>}
                        </select>
                      </label>
                      <label>Erwarteter Zustand
                        <select className={`${inputClass} mt-1`} value={condition.conditionExpectedState} onChange={(event) => updateCondition(index, { conditionExpectedState: event.target.value })}>
                          {conditionStateOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                        </select>
                      </label>
                    </div>
                  ) : null}
                  {condition.conditionType === "last_image_younger_than" ? (
                    <div className="mt-3 grid gap-2 text-sm text-graphite">
                      <label>Kamera
                        <select className={`${inputClass} mt-1`} value={condition.conditionCapabilityId} onChange={(event) => updateCondition(index, { conditionCapabilityId: event.target.value })}>
                          {conditionCapabilities.length ? conditionCapabilities.map((capability) => (
                            <option key={capability.id} value={capability.id}>{capability.deviceName} · {capability.title}</option>
                          )) : <option value="">Keine Kamera eingerichtet</option>}
                        </select>
                      </label>
                      <label>Maximales Bildalter
                        <div className="mt-1 flex items-center gap-2">
                          <input className={inputClass} type="number" min={1} value={condition.conditionImageMaxAgeSeconds} onChange={(event) => updateCondition(index, { conditionImageMaxAgeSeconds: Number(event.target.value) })} />
                          <span>Sek.</span>
                        </div>
                      </label>
                    </div>
                  ) : null}
                  {condition.conditionType === "switch_state_for" ? (
                    <div className="mt-3 grid gap-2 text-sm text-graphite">
                      <label>Schalter
                        <select className={`${inputClass} mt-1`} value={condition.conditionCapabilityId} onChange={(event) => updateCondition(index, { conditionCapabilityId: event.target.value })}>
                          {conditionCapabilities.length ? conditionCapabilities.map((capability) => (
                            <option key={capability.id} value={capability.id}>{capability.deviceName} · {capability.title}</option>
                          )) : <option value="">Kein Schalter eingerichtet</option>}
                        </select>
                      </label>
                      <label>Zustand
                        <select className={`${inputClass} mt-1`} value={["ON", "OFF"].includes(condition.conditionExpectedState) ? condition.conditionExpectedState : "ON"} onChange={(event) => updateCondition(index, { conditionExpectedState: event.target.value })}>
                          <option value="ON">Eingeschaltet</option>
                          <option value="OFF">Ausgeschaltet</option>
                        </select>
                      </label>
                      <label>Dauer
                        <div className="mt-1 flex items-center gap-2">
                          <input className={inputClass} type="number" min={1} value={condition.conditionStateAgeMinutes} onChange={(event) => updateCondition(index, { conditionStateAgeMinutes: Number(event.target.value) })} />
                          <span>Minuten</span>
                        </div>
                      </label>
                    </div>
                  ) : null}
                  {condition.conditionType === "quota_remaining" ? (
                    <label className="mt-3 block text-sm text-graphite">Tracker
                      <select className={`${inputClass} mt-1`} value={condition.conditionTrackerTypeId} onChange={(event) => updateCondition(index, { conditionTrackerTypeId: event.target.value })}>
                        {trackers.length ? trackers.map((tracker) => <option key={tracker.id} value={tracker.id}>{tracker.title}</option>) : <option value="">Kein Tracker eingerichtet</option>}
                      </select>
                    </label>
                  ) : null}
                </div>
              );
            })}
          </div>
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

        <section className="rounded-lg border border-line bg-paper p-4">
          <div className="flex items-center gap-2 font-semibold text-ink"><Cpu className="h-4 w-4" /> Aktion</div>
          <div className="mt-3 space-y-3">
            {value.actions.map((action, index) => {
              const availableActionTypes = actionTypeOptions(capabilities);
              const requiredActionKind = actionCapabilityKind(action.actionType);
              const targetCapabilities = capabilitiesForAction(action.actionType);
              return (
                <div key={index} className="rounded-md border border-line bg-surface p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-ink">Aktion {index + 1}</div>
                      <div className="text-xs text-graphite">Wähle zuerst, was passieren soll. Danach zeigt Playplaner nur passende Ziele.</div>
                    </div>
                    {value.actions.length > 1 ? (
                      <button type="button" onClick={() => removeAction(index)} className="inline-flex items-center gap-1 rounded-md border border-line bg-paper px-2 py-1 text-xs font-semibold text-graphite hover:border-redbrand hover:text-redbrand">
                        <Trash2 className="h-3 w-3" /> Entfernen
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <label className="text-sm text-graphite">Was soll passieren?
                      <select className={`${inputClass} mt-1`} value={action.actionType} onChange={(event) => updateAction(index, { actionType: event.target.value as AutomationActionKey })}>
                        {availableActionTypes.map((option) => (
                          <option key={option.key} value={option.key} disabled={option.disabled}>
                            {option.label} {option.helper ? `· ${option.helper}` : ""}
                          </option>
                        ))}
                      </select>
                      <span className="mt-1 block text-xs leading-5 text-graphite">
                        Aktionen ohne eingerichtetes Ziel bleiben ausgegraut, bis ein passendes Gerät vorhanden ist.
                      </span>
                    </label>
                    {requiredActionKind ? (
                      <label className="text-sm text-graphite">Passendes Ziel
                        <select className={`${inputClass} mt-1`} value={action.capabilityId} onChange={(event) => updateAction(index, { capabilityId: event.target.value })}>
                          {targetCapabilities.length ? (
                            <optgroup label={capabilityKindLabel(requiredActionKind)}>
                              {targetCapabilities.map((capability) => (
                                <option key={capability.id} value={capability.id}>{capability.deviceName} · {capability.title}</option>
                              ))}
                            </optgroup>
                          ) : <option value="">{emptyCapabilityText(requiredActionKind)}</option>}
                        </select>
                        <span className="mt-1 block text-xs leading-5 text-graphite">
                          Für „{actionLabels[action.actionType]}“ sind nur {capabilityKindLabel(requiredActionKind).toLowerCase()} auswählbar.
                        </span>
                      </label>
                    ) : (
                      <div className="rounded-md border border-line bg-paper p-3 text-sm text-graphite">
                        <div className="font-semibold text-ink">Kein Gerät nötig</div>
                        <p className="mt-1 text-xs leading-5">Diese Aktion passiert direkt im Portal und benötigt keine Kamera, keinen Schalter und keine Sprachausgabe.</p>
                      </div>
                    )}
                  </div>
                  {action.actionType === "voice_speak" ? (
                    <textarea className={`${inputClass} mt-2`} value={action.voiceText} onChange={(event) => updateAction(index, { voiceText: event.target.value })} rows={2} placeholder="Text, den ioBroker sprechen soll" />
                  ) : null}
                  {action.actionType === "camera_request_image" || action.actionType === "camera_health_check" ? (
                    <div className="mt-3 space-y-2 text-sm text-graphite">
                      <div className="grid grid-cols-2 gap-2">
                        <label>Timeout
                          <div className="mt-1 flex items-center gap-2">
                            <input className={inputClass} type="number" min={1} value={action.cameraTimeoutSeconds} onChange={(event) => updateAction(index, { cameraTimeoutSeconds: Number(event.target.value) })} />
                            <span>Sek.</span>
                          </div>
                        </label>
                        {action.actionType === "camera_request_image" ? (
                          <label>Wiederholungen
                            <input className={`${inputClass} mt-1`} type="number" min={0} max={10} value={action.cameraMaxRetries} onChange={(event) => updateAction(index, { cameraMaxRetries: Number(event.target.value) })} />
                          </label>
                        ) : null}
                      </div>
                      {action.actionType === "camera_request_image" ? (
                        <>
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
                        </>
                      ) : (
                        <p className="rounded-md border border-line bg-paper p-2 text-xs leading-5">
                          Die Bridge prüft nur die Verbindung und meldet den Kamerazustand zurück. Es wird kein Bild gespeichert.
                        </p>
                      )}
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
        {ruleId ? (
          <div className="mt-3 rounded-md border border-line bg-surface p-3 text-sm text-graphite">
            <span className="font-semibold text-ink">Simulationskontext:</span>{" "}
            {ruleName ? `Regel „${ruleName}“` : "Gespeicherte Regel"}
            {ruleVersion ? ` · Version ${ruleVersion}` : ""}
          </div>
        ) : null}
        {absenceCondition ? (
          <div className="mt-3 rounded-md border border-line bg-surface p-3 text-sm text-graphite">
            <label className="flex items-center gap-2 font-semibold text-ink">
              <input type="checkbox" checked={simulateControllerAction} onChange={(event) => setSimulateControllerAction(event.target.checked)} />
              Controller-Aktion im Abwesenheitsfenster simulieren
            </label>
            {simulateControllerAction ? (
              <label className="mt-3 block">Zeitpunkt der simulierten Aktion
                <div className="mt-1 flex items-center gap-2">
                  <input
                    className={inputClass}
                    type="number"
                    min={0}
                    max={Math.max(0, absenceCondition.conditionMinutes)}
                    value={controllerActionMinute}
                    onChange={(event) => setControllerActionMinute(Number(event.target.value))}
                  />
                  <span>Minuten nach Start</span>
                </div>
              </label>
            ) : null}
          </div>
        ) : null}
        {deviceCondition ? (
          <div className="mt-3 rounded-md border border-line bg-surface p-3 text-sm text-graphite">
            <label className="block font-semibold text-ink">Gerätezustand für diese Simulation
              <select
                className={`${inputClass} mt-2`}
                value={simulatedDeviceHealth[deviceCondition.conditionDeviceId] || devices.find((device) => device.id === deviceCondition.conditionDeviceId)?.health || "UNKNOWN"}
                onChange={(event) => setSimulatedDeviceHealth((current) => ({ ...current, [deviceCondition.conditionDeviceId]: event.target.value }))}
                disabled={!deviceCondition.conditionDeviceId}
              >
                {stateOptionsForCapability().map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <p className="mt-2 text-xs leading-5">Dieser Testzustand verändert kein Gerät. Er gilt nur für die Timeline und zeigt, ob die Bedingung dadurch erfüllt oder blockiert wird.</p>
          </div>
        ) : null}
        {capabilityCondition ? (
          <div className="mt-3 rounded-md border border-line bg-surface p-3 text-sm text-graphite">
            <label className="block font-semibold text-ink">Zustand der Fähigkeit für diese Simulation
              <select
                className={`${inputClass} mt-2`}
                value={simulatedCapabilityState[capabilityCondition.conditionCapabilityId] || simulationCapability?.state || "UNKNOWN"}
                onChange={(event) => setSimulatedCapabilityState((current) => ({ ...current, [capabilityCondition.conditionCapabilityId]: event.target.value }))}
                disabled={!capabilityCondition.conditionCapabilityId}
              >
                {stateOptionsForCapability(simulationCapability?.kind).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <p className="mt-2 text-xs leading-5">Dieser Zustand ist nur ein Simulationswert. Die gespeicherte Fähigkeit und die echte Gerätebrücke bleiben unverändert.</p>
          </div>
        ) : null}
        {lastImageCondition ? (
          <div className="mt-3 rounded-md border border-line bg-surface p-3 text-sm text-graphite">
            <label className="block font-semibold text-ink">Letztes Kamerabild für diese Simulation
              <div className="mt-2 flex items-center gap-2">
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  value={simulatedLastImageAgeSeconds[lastImageCondition.conditionCapabilityId] ?? lastImageCondition.conditionImageMaxAgeSeconds}
                  onChange={(event) => setSimulatedLastImageAgeSeconds((current) => ({ ...current, [lastImageCondition.conditionCapabilityId]: Number(event.target.value) }))}
                  disabled={!lastImageCondition.conditionCapabilityId}
                />
                <span>Sekunden alt</span>
              </div>
            </label>
            <p className="mt-2 text-xs leading-5">Dieser Wert ist nur ein Simulationswert. Es wird kein echtes Bild gesucht oder gespeichert.</p>
          </div>
        ) : null}
        {switchCondition ? (
          <div className="mt-3 rounded-md border border-line bg-surface p-3 text-sm text-graphite">
            <label className="block font-semibold text-ink">Schaltzustand für diese Simulation
              <select
                className={`${inputClass} mt-2`}
                value={simulatedCapabilityState[switchCondition.conditionCapabilityId] || switchSimulationCapability?.state || switchCondition.conditionExpectedState || "ON"}
                onChange={(event) => setSimulatedCapabilityState((current) => ({ ...current, [switchCondition.conditionCapabilityId]: event.target.value }))}
                disabled={!switchCondition.conditionCapabilityId}
              >
                <option value="ON">Eingeschaltet</option>
                <option value="OFF">Ausgeschaltet</option>
                <option value="ERROR">Fehler</option>
                <option value="OFFLINE">Nicht erreichbar</option>
              </select>
            </label>
            <label className="mt-3 block font-semibold text-ink">Seit wann besteht dieser Zustand?
              <div className="mt-2 flex items-center gap-2">
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  value={simulatedCapabilityStateAgeMinutes[switchCondition.conditionCapabilityId] ?? switchCondition.conditionStateAgeMinutes}
                  onChange={(event) => setSimulatedCapabilityStateAgeMinutes((current) => ({ ...current, [switchCondition.conditionCapabilityId]: Number(event.target.value) }))}
                  disabled={!switchCondition.conditionCapabilityId}
                />
                <span>Minuten</span>
              </div>
            </label>
            <p className="mt-2 text-xs leading-5">Diese Werte gelten nur für die Timeline. Der echte Schalter und die Gerätebrücke bleiben unverändert.</p>
          </div>
        ) : null}
        <input className="mt-4 w-full accent-redbrand" type="range" min={0} max={simulation.durationMinutes} value={scrubMinute} onChange={(event) => setScrubMinute(Number(event.target.value))} />
        <div className="mt-2 text-sm text-graphite">Simulationszeitpunkt: Minute {simulation.scrubMinute} von {simulation.durationMinutes}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {simulationJumpPoints.map(([minute, title]) => (
            <button
              key={`${minute}-${title}`}
              type="button"
              onClick={() => setScrubMinute(minute)}
              className={`max-w-48 rounded-md border px-3 py-2 text-left text-xs font-semibold ${simulation.scrubMinute === minute ? "border-redbrand bg-redbrand text-white" : "border-line bg-surface text-ink hover:border-redbrand hover:text-redbrand"}`}
              title={title}
            >
              <span className="block">Minute {minute}</span>
              <span className="block truncate font-medium opacity-80">{title}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 rounded-md border border-redbrand/20 bg-redbrand/5 p-3 text-sm font-medium text-ink">{simulation.explanation}</div>
        <div className="mt-3 rounded-md border border-line bg-surface p-3">
          <div className="text-sm font-semibold text-ink">Prüfpunkte</div>
          <p className="mt-1 text-xs leading-5 text-graphite">Diese Punkte helfen beim Abnehmen der Regel: vor der Bedingung, bei der Entscheidung, im Zeitfenster und nach der Fälligkeit.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {simulation.reviewMoments.map((moment) => (
              <button
                key={`${moment.minute}-${moment.label}`}
                type="button"
                onClick={() => setScrubMinute(moment.minute)}
                className={`rounded-md border px-3 py-2 text-left text-xs font-semibold ${simulation.scrubMinute === moment.minute ? "border-redbrand bg-redbrand text-white" : "border-line bg-paper text-ink hover:border-redbrand hover:text-redbrand"}`}
                title={moment.reason}
              >
                <span className="block">Minute {moment.minute}</span>
                <span className="block font-medium opacity-80">{moment.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 rounded-md border border-line bg-surface p-3">
          <div className="text-sm font-semibold text-ink">Momentaufnahme bei Minute {simulation.currentMoment.minute}</div>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            <SimBox title="Jetzt" items={simulation.currentMoment.current.length ? simulation.currentMoment.current : [simulation.currentMoment.decision]} emptyText="Zu diesem Zeitpunkt liegt keine neue Entscheidung an." />
            <SimBox title="Bereits passiert" items={simulation.currentMoment.completed} emptyText="Vor diesem Zeitpunkt ist noch nichts passiert." />
            <SimBox title="Als Nächstes" items={simulation.currentMoment.upcoming} emptyText="Nach diesem Zeitpunkt ist nichts Weiteres geplant." />
          </div>
        </div>
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
          <SimBox title="Ereignisse" items={simulation.events.map((item) => `${item.minute} min · ${item.title}`)} emptyText="Bis zu dieser Minute ist kein Ereignis eingetreten." />
          <SimBox title="Bedingungen" items={simulation.conditions.map((item) => `${item.title}: ${item.status} · ${item.result}`)} emptyText="Für diese Regel gibt es keine zusätzliche Bedingung." />
          <SimBox title="Ausgelöste Regeln" items={simulation.triggeredRules} emptyText="Noch keine Regel ausgelöst." />
          <SimBox title="Noch nicht freigegebene Aktionen" items={simulation.unscheduledActions.map((item) => item.detail)} emptyText="Alle Voraussetzungen sind erfüllt oder es gibt keine spätere Aktion." />
          <SimBox title="Wartende Aktionen" items={simulation.waitingActions.map((item) => item.detail)} emptyText="Keine Aktion wartet gerade." />
          <SimBox title="Fällige Aktionen" items={simulation.dueActions.map((item) => item.detail)} emptyText="Keine Aktion ist jetzt fällig." />
          <SimBox title="Simulierte Aktionen" items={simulation.completedActions.map((item) => item.detail)} emptyText="Noch keine Aktion wurde in der Simulation ausgeführt." />
          <SimBox title="Blockierte Aktionen" items={simulation.blockedActions.map((item) => item.detail)} emptyText="Keine Aktion ist blockiert." />
          <SimBox title="Vorgemerktes Ende" items={simulation.pendingEnd.map((item) => `${item.state}: ${item.text}`)} emptyText="Kein Ende ist vorgemerkt." />
          <SimBox title="Wiederherstellung bei Fehler" items={simulation.recoveryActions.map((item) => `${item.minute} min · ${item.title}: ${item.status} · ${item.detail}`)} emptyText="Keine Wiederherstellung geplant." />
          <SimBox title="Zufallswerte" items={simulation.randomValues.map((item) => `${item.label}: ${item.value}`)} emptyText="Diese Regel nutzt keinen Zufallswert." />
          <SimBox title="Variablen" items={simulation.humanVariables} emptyText="Keine zusätzlichen Variablen relevant." />
        </div>
        <details className="mt-3 rounded-md border border-line bg-surface p-3">
          <summary className="cursor-pointer list-none text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">Technische Simulationsvariablen</summary>
          <pre className="mt-2 overflow-auto text-xs text-graphite">{JSON.stringify(simulation.variables, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

function SimBox({ title, items, emptyText = "Keine Einträge." }: { title: string; items: string[]; emptyText?: string }) {
  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <div className="text-sm font-semibold text-ink">{title}</div>
      <div className="mt-2 space-y-1 text-sm text-graphite">
        {items.length ? items.map((item) => <div key={item}>{item}</div>) : <div className="flex items-center gap-1"><XCircle className="h-3 w-3" /> {emptyText}</div>}
      </div>
    </div>
  );
}
