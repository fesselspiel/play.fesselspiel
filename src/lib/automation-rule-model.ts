export type AutomationTriggerKey =
  | "session_started"
  | "session_pending_end"
  | "action_succeeded"
  | "action_failed"
  | "event_absent"
  | "device_state_changed"
  | "quota_open";

export type AutomationConditionKey =
  | "none"
  | "controller_absent"
  | "device_online"
  | "device_offline"
  | "capability_state"
  | "quota_remaining";

export type AutomationTimingKey = "immediate" | "fixed_delay" | "random_delay";
export type AutomationActionKey = "camera_request_image" | "switch_on" | "switch_off" | "switch_toggle" | "voice_speak" | "session_finish";
export type CapabilityKind = "Camera" | "Switch" | "Voice";

export const automationLabels = {
  states: {
    IDLE: "Bereit",
    RUNNING: "Läuft",
    PENDING_END: "Ende vorgemerkt",
    FINISHED: "Beendet",
    CANCELLED: "Abgebrochen"
  },
  actionStatuses: {
    CREATED: "Angelegt",
    WAITING: "Wartet",
    READY: "Bereit für Bridge",
    RUNNING: "Wird ausgeführt",
    SUCCEEDED: "Erfolgreich",
    FAILED: "Fehlgeschlagen",
    CANCELLED: "Abgebrochen"
  },
  imageStatuses: {
    REQUESTED: "Angefordert",
    UPLOADED: "Empfangen",
    FAILED: "Fehlgeschlagen",
    CANCELLED: "Abgebrochen"
  },
  eventTypes: {
    session_started: "Session wurde gestartet",
    session_pending_end: "Session-Ende wurde vorgemerkt",
    session_finished: "Session wurde beendet",
    rule_created: "Regel wurde angelegt",
    rule_updated: "Regel wurde geändert",
    rule_triggered: "Regel wurde ausgelöst",
    action_created: "Aktion wurde geplant",
    action_ready: "Aktion ist bereit",
    action_succeeded: "Aktion war erfolgreich",
    action_failed: "Aktion ist fehlgeschlagen",
    image_requested: "Bild wurde angefordert",
    image_uploaded: "Bild wurde empfangen",
    bridge_heartbeat: "Bridge hat sich gemeldet",
    bridge_command_created: "Bridge-Befehl wurde erstellt",
    bridge_command_finished: "Bridge-Befehl wurde abgeschlossen"
  },
  health: {
    UNKNOWN: "Nicht verbunden",
    ONLINE: "Verbunden",
    OFFLINE: "Nicht erreichbar",
    ERROR: "Fehler",
    BOOTING: "Startet"
  },
  integrations: {
    IOBROKER: "ioBroker",
    MQTT: "MQTT",
    MANUAL: "Manuell"
  },
  roles: {
    OWNER: "Session-Benutzer",
    CONTROLLER: "Controller",
    SYSTEM: "System"
  },
  sources: {
    WEB: "Web",
    API: "API",
    TELEGRAM: "Telegram",
    APP: "App",
    SCHEDULED_RULE: "Regel",
    IOBROKER: "ioBroker",
    SYSTEM: "System"
  }
} as const;

export const triggerOptions: Array<{ key: AutomationTriggerKey; label: string; description: string }> = [
  { key: "session_started", label: "Session wurde gestartet", description: "Reagiert, sobald eine Automation-Session beginnt." },
  { key: "session_pending_end", label: "Session-Ende wurde vorgemerkt", description: "Reagiert, wenn ein verzögertes Ende geplant wurde." },
  { key: "action_succeeded", label: "Aktion war erfolgreich", description: "Reagiert auf eine erfolgreich ausgeführte Aktion." },
  { key: "action_failed", label: "Aktion ist fehlgeschlagen", description: "Reagiert auf Fehler, z. B. Kamera nicht erreichbar." },
  { key: "event_absent", label: "Ereignis bleibt aus", description: "Reagiert, wenn innerhalb einer Zeitspanne nichts passiert." },
  { key: "device_state_changed", label: "Gerätezustand ändert sich", description: "Reagiert auf lokale ioBroker-/MQTT-Zustände." },
  { key: "quota_open", label: "Tracker-Kontingent ist offen", description: "Reagiert, wenn noch Zeit zu erfüllen ist." }
];

export const conditionOptions: Record<AutomationTriggerKey, AutomationConditionKey[]> = {
  session_started: ["none", "controller_absent", "device_online", "device_offline"],
  session_pending_end: ["none", "device_online", "device_offline"],
  action_succeeded: ["none", "capability_state"],
  action_failed: ["none", "device_offline", "capability_state"],
  event_absent: ["controller_absent", "device_online", "device_offline"],
  device_state_changed: ["capability_state", "device_online", "device_offline"],
  quota_open: ["quota_remaining"]
};

export const conditionLabels: Record<AutomationConditionKey, string> = {
  none: "Keine zusätzliche Bedingung",
  controller_absent: "Keine Aktion des Controllers",
  device_online: "Gerät ist verbunden",
  device_offline: "Gerät ist nicht erreichbar",
  capability_state: "Fähigkeit hat bestimmten Zustand",
  quota_remaining: "Kontingent ist noch offen"
};

export const actionOptionsByCapability: Record<CapabilityKind, AutomationActionKey[]> = {
  Camera: ["camera_request_image"],
  Switch: ["switch_on", "switch_off", "switch_toggle"],
  Voice: ["voice_speak"]
};

export const actionLabels: Record<AutomationActionKey, string> = {
  camera_request_image: "Bild anfordern",
  switch_on: "Einschalten",
  switch_off: "Ausschalten",
  switch_toggle: "Umschalten",
  voice_speak: "Text sprechen",
  session_finish: "Session beenden"
};

export const timingLabels: Record<AutomationTimingKey, string> = {
  immediate: "Sofort",
  fixed_delay: "Feste Verzögerung",
  random_delay: "Zufällige Verzögerung"
};

export type RuleFormValue = {
  triggerType: AutomationTriggerKey;
  conditionType: AutomationConditionKey;
  conditionMinutes: number;
  timingType: AutomationTimingKey;
  delayMinutes: number;
  minMinutes: number;
  maxMinutes: number;
  capabilityId: string;
  capabilityKind: CapabilityKind | "";
  actionType: AutomationActionKey;
  voiceText: string;
  mode: "ONCE" | "REPEAT";
};

export function defaultRuleFormValue(): RuleFormValue {
  return {
    triggerType: "session_started",
    conditionType: "none",
    conditionMinutes: 20,
    timingType: "immediate",
    delayMinutes: 5,
    minMinutes: 5,
    maxMinutes: 10,
    capabilityId: "",
    capabilityKind: "",
    actionType: "camera_request_image",
    voiceText: "",
    mode: "ONCE"
  };
}

function numberValue(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback;
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function ruleFormFromStored(rule?: {
  triggerType?: string | null;
  conditionJson?: unknown;
  timingJson?: unknown;
  actionJson?: unknown;
  mode?: string | null;
} | null): RuleFormValue {
  const value = defaultRuleFormValue();
  if (!rule) return value;
  if (triggerOptions.some((option) => option.key === rule.triggerType)) value.triggerType = rule.triggerType as AutomationTriggerKey;
  const condition = Array.isArray(rule.conditionJson) ? asObject(rule.conditionJson[0]) : {};
  if (condition.type && conditionLabels[condition.type as AutomationConditionKey]) value.conditionType = condition.type as AutomationConditionKey;
  value.conditionMinutes = numberValue(condition.minutes, value.conditionMinutes);
  const timing = asObject(rule.timingJson);
  if (timing.type && timingLabels[timing.type as AutomationTimingKey]) value.timingType = timing.type as AutomationTimingKey;
  value.delayMinutes = numberValue(timing.minutes ?? timing.delayMinutes, value.delayMinutes);
  value.minMinutes = numberValue(timing.minMinutes, value.minMinutes);
  value.maxMinutes = Math.max(value.minMinutes, numberValue(timing.maxMinutes, value.maxMinutes));
  const action = Array.isArray(rule.actionJson) ? asObject(rule.actionJson[0]) : {};
  if (action.type && actionLabels[action.type as AutomationActionKey]) value.actionType = action.type as AutomationActionKey;
  value.capabilityId = typeof action.capabilityId === "string" ? action.capabilityId : "";
  value.capabilityKind = typeof action.capabilityKind === "string" ? action.capabilityKind as CapabilityKind : "";
  value.voiceText = typeof action.text === "string" ? action.text : "";
  value.mode = rule.mode === "REPEAT" ? "REPEAT" : "ONCE";
  return value;
}

export function buildStoredRule(value: RuleFormValue) {
  const conditions = value.conditionType === "none" ? [] : [{
    type: value.conditionType,
    minutes: value.conditionMinutes
  }];
  const timing = value.timingType === "fixed_delay"
    ? { type: "fixed_delay", minutes: value.delayMinutes }
    : value.timingType === "random_delay"
      ? { type: "random_delay", minMinutes: value.minMinutes, maxMinutes: Math.max(value.minMinutes, value.maxMinutes) }
      : { type: "immediate" };
  const actions = [{
    type: value.actionType,
    capabilityId: value.capabilityId || null,
    capabilityKind: value.capabilityKind || null,
    text: value.actionType === "voice_speak" ? value.voiceText : null
  }];
  return {
    triggerType: value.triggerType,
    triggerJson: {},
    conditionJson: conditions,
    timingJson: timing,
    actionJson: actions,
    mode: value.mode
  };
}

export function automationRuleSummary(input: {
  triggerType: string;
  conditionJson?: unknown;
  timingJson?: unknown;
  actionJson?: unknown;
}) {
  const trigger = triggerOptions.find((option) => option.key === input.triggerType)?.label || "Ein Ereignis tritt ein";
  const condition = Array.isArray(input.conditionJson) ? asObject(input.conditionJson[0]) : {};
  const timing = asObject(input.timingJson);
  const action = Array.isArray(input.actionJson) ? asObject(input.actionJson[0]) : {};
  const conditionText = condition.type && condition.type !== "none"
    ? condition.type === "controller_absent"
      ? `innerhalb von ${numberValue(condition.minutes, 20)} Minuten keine Aktion des Controllers erfolgt`
      : conditionLabels[condition.type as AutomationConditionKey]?.toLowerCase() || "die Bedingung erfüllt ist"
    : "";
  const timingText = timing.type === "random_delay"
    ? `warte zufällig weitere ${numberValue(timing.minMinutes, 0)} bis ${numberValue(timing.maxMinutes, 0)} Minuten`
    : timing.type === "fixed_delay"
      ? `warte ${numberValue(timing.minutes ?? timing.delayMinutes, 0)} Minuten`
      : "führe die Aktion sofort aus";
  const actionText = actionLabels[action.type as AutomationActionKey]?.toLowerCase() || "führe die gewählte Aktion aus";
  if (conditionText) return `Wenn ${trigger.toLowerCase()} und ${conditionText}, ${timingText} und ${actionText}.`;
  return `Wenn ${trigger.toLowerCase()}, ${timingText} und ${actionText}.`;
}

export function automationRuleFlow(input: { triggerType: string; conditionJson?: unknown; timingJson?: unknown; actionJson?: unknown }) {
  const condition = Array.isArray(input.conditionJson) ? asObject(input.conditionJson[0]) : {};
  const timing = asObject(input.timingJson);
  const action = Array.isArray(input.actionJson) ? asObject(input.actionJson[0]) : {};
  const steps = [
    triggerOptions.find((option) => option.key === input.triggerType)?.label || "Ereignis tritt ein"
  ];
  if (condition.type && condition.type !== "none") {
    const minutes = numberValue(condition.minutes, 0);
    steps.push(condition.type === "controller_absent" && minutes ? `${minutes} Minuten keine Aktion des Controllers` : conditionLabels[condition.type as AutomationConditionKey] || "Bedingung erfüllt");
  }
  if (timing.type === "fixed_delay") steps.push(`${numberValue(timing.minutes ?? timing.delayMinutes, 0)} Minuten warten`);
  if (timing.type === "random_delay") steps.push(`Zufallsfenster ${numberValue(timing.minMinutes, 0)}-${numberValue(timing.maxMinutes, 0)} Minuten`);
  steps.push(actionLabels[action.type as AutomationActionKey] || "Aktion ausführen");
  if (action.type === "camera_request_image") steps.push("Bei Fehler: Recovery-Regel kann anschließen");
  return steps;
}

export function simulateAutomationRuleTimeline(input: {
  triggerType: string;
  conditionJson?: unknown;
  timingJson?: unknown;
  actionJson?: unknown;
  scrubMinute?: number;
  randomSeed?: number;
}) {
  const condition = Array.isArray(input.conditionJson) ? asObject(input.conditionJson[0]) : {};
  const timing = asObject(input.timingJson);
  const action = Array.isArray(input.actionJson) ? asObject(input.actionJson[0]) : {};
  const conditionMinutes = condition.type && condition.type !== "none" ? numberValue(condition.minutes, 0) : 0;
  const delay = timing.type === "random_delay"
    ? numberValue(timing.minMinutes, 0) + ((input.randomSeed ?? 3) % (Math.max(0, numberValue(timing.maxMinutes, 0) - numberValue(timing.minMinutes, 0)) + 1))
    : timing.type === "fixed_delay"
      ? numberValue(timing.minutes ?? timing.delayMinutes, 0)
      : 0;
  const dueMinute = conditionMinutes + delay;
  const scrubMinute = Math.min(Math.max(0, input.scrubMinute ?? 0), Math.max(1, dueMinute + 5));
  const events = [{ minute: 0, title: triggerOptions.find((option) => option.key === input.triggerType)?.label || "Trigger" }];
  const conditions = condition.type && condition.type !== "none"
    ? [{ minute: conditionMinutes, title: conditionLabels[condition.type as AutomationConditionKey] || "Bedingung", passed: scrubMinute >= conditionMinutes }]
    : [];
  const waitingActions = scrubMinute < dueMinute ? [{ minute: dueMinute, title: actionLabels[action.type as AutomationActionKey] || "Aktion" }] : [];
  const dueActions = scrubMinute >= dueMinute ? [{ minute: dueMinute, title: actionLabels[action.type as AutomationActionKey] || "Aktion" }] : [];
  return {
    durationMinutes: Math.max(1, dueMinute + 5),
    scrubMinute,
    sessionState: scrubMinute >= dueMinute && action.type === "session_finish" ? "FINISHED" : "RUNNING",
    events: events.filter((event) => event.minute <= scrubMinute),
    conditions,
    triggeredRules: scrubMinute >= 0 ? [triggerOptions.find((option) => option.key === input.triggerType)?.label || "Regel"] : [],
    waitingActions,
    dueActions,
    completedActions: scrubMinute > dueMinute ? dueActions : [],
    randomValues: timing.type === "random_delay" ? [{ label: "Gewählte Zufallswartezeit", value: `${delay} Minuten` }] : [],
    variables: {
      conditionMinutes,
      delayMinutes: delay,
      dueMinute,
      sideEffects: false
    }
  };
}

export function labelAutomationValue(kind: keyof typeof automationLabels, value?: string | null) {
  if (!value) return "Nicht gesetzt";
  const map = automationLabels[kind] as Record<string, string>;
  return map[value] || value;
}
