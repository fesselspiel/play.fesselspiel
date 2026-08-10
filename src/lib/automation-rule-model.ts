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

export type AutomationCapabilityReference = {
  id: string;
  kind: CapabilityKind;
  title?: string;
  deviceName?: string;
  deviceId?: string;
  state?: string;
};

export type AutomationDeviceReference = {
  id: string;
  name: string;
  health?: string;
};

export type AutomationTrackerReference = {
  id: string;
  title: string;
  color?: string;
};

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
    rule_deleted: "Regel wurde gelöscht",
    rule_triggered: "Regel wurde ausgelöst",
    rule_condition_blocked: "Regelbedingung hat nicht gepasst",
    rule_processing_failed: "Regelverarbeitung ist fehlgeschlagen",
    device_deleted: "Gerät wurde entfernt",
    capability_deleted: "Fähigkeit wurde entfernt",
    action_created: "Aktion wurde geplant",
    action_ready: "Aktion ist bereit",
    action_ready_for_bridge: "Aktion ist bereit für die Bridge",
    action_claimed_by_bridge: "Bridge hat Aktion übernommen",
    action_succeeded: "Aktion war erfolgreich",
    action_failed: "Aktion ist fehlgeschlagen",
    action_cancelled: "Aktion wurde nicht ausgeführt",
    image_requested: "Bild wurde angefordert",
    image_uploaded: "Bild wurde empfangen",
    camera_recovery_scheduled: "Kamera-Recovery wurde geplant",
    camera_recovery_exhausted: "Kamera-Recovery ist beendet",
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
  conditionDeviceId: string;
  conditionCapabilityId: string;
  conditionExpectedState: string;
  conditionTrackerTypeId: string;
  timingType: AutomationTimingKey;
  delayMinutes: number;
  minMinutes: number;
  maxMinutes: number;
  capabilityId: string;
  capabilityKind: CapabilityKind | "";
  actionType: AutomationActionKey;
  voiceText: string;
  cameraMaxRetries: number;
  cameraTimeoutSeconds: number;
  cameraBootDelaySeconds: number;
  recoveryCapabilityId: string;
  mode: "ONCE" | "REPEAT";
};

export function defaultRuleFormValue(): RuleFormValue {
  return {
    triggerType: "session_started",
    conditionType: "none",
    conditionMinutes: 20,
    conditionDeviceId: "",
    conditionCapabilityId: "",
    conditionExpectedState: "ONLINE",
    conditionTrackerTypeId: "",
    timingType: "immediate",
    delayMinutes: 5,
    minMinutes: 5,
    maxMinutes: 10,
    capabilityId: "",
    capabilityKind: "",
    actionType: "session_finish",
    voiceText: "",
    cameraMaxRetries: 2,
    cameraTimeoutSeconds: 20,
    cameraBootDelaySeconds: 20,
    recoveryCapabilityId: "",
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
  value.conditionDeviceId = typeof condition.deviceId === "string" ? condition.deviceId : "";
  value.conditionCapabilityId = typeof condition.capabilityId === "string" ? condition.capabilityId : "";
  value.conditionExpectedState = typeof condition.state === "string" ? condition.state : value.conditionExpectedState;
  value.conditionTrackerTypeId = typeof condition.trackerTypeId === "string" ? condition.trackerTypeId : "";
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
  value.cameraMaxRetries = numberValue(action.maxRetries, value.cameraMaxRetries);
  value.cameraTimeoutSeconds = numberValue(action.timeoutSeconds, value.cameraTimeoutSeconds);
  value.cameraBootDelaySeconds = numberValue(action.bootDelaySeconds, value.cameraBootDelaySeconds);
  value.recoveryCapabilityId = typeof action.recoveryCapabilityId === "string" ? action.recoveryCapabilityId : "";
  value.mode = rule.mode === "REPEAT" ? "REPEAT" : "ONCE";
  return value;
}

export function buildStoredRule(value: RuleFormValue) {
  const conditions = value.conditionType === "none" ? [] : [{
    type: value.conditionType,
    minutes: value.conditionMinutes,
    deviceId: ["device_online", "device_offline"].includes(value.conditionType) ? value.conditionDeviceId || null : null,
    capabilityId: value.conditionType === "capability_state" ? value.conditionCapabilityId || null : null,
    state: value.conditionType === "capability_state" ? value.conditionExpectedState || null : null,
    trackerTypeId: value.conditionType === "quota_remaining" ? value.conditionTrackerTypeId || null : null
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
    text: value.actionType === "voice_speak" ? value.voiceText : null,
    maxRetries: value.actionType === "camera_request_image" ? value.cameraMaxRetries : null,
    timeoutSeconds: value.actionType === "camera_request_image" ? value.cameraTimeoutSeconds : null,
    bootDelaySeconds: value.actionType === "camera_request_image" ? value.cameraBootDelaySeconds : null,
    recoveryCapabilityId: value.actionType === "camera_request_image" ? value.recoveryCapabilityId || null : null
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

export function validateAutomationRulePayload(input: {
  name?: string | null;
  mode?: string | null;
  triggerType?: string | null;
  conditionJson?: unknown;
  timingJson?: unknown;
  actionJson?: unknown;
}, capabilities: AutomationCapabilityReference[] = [], devices: AutomationDeviceReference[] = [], trackers: AutomationTrackerReference[] = []) {
  const errors: string[] = [];
  const trigger = input.triggerType as AutomationTriggerKey;
  if (!input.name?.trim()) errors.push("Bitte gib der Regel einen Namen.");
  if (!triggerOptions.some((option) => option.key === trigger)) {
    errors.push("Bitte wähle einen gültigen Auslöser.");
  }
  if (input.mode && !["ONCE", "REPEAT"].includes(input.mode)) {
    errors.push("Bitte wähle eine gültige Ausführung.");
  }

  const conditions = Array.isArray(input.conditionJson) ? input.conditionJson : [];
  if (conditions.length > 1) errors.push("Bitte verwende in dieser Oberfläche genau eine Bedingung.");
  const condition = conditions.length ? asObject(conditions[0]) : {};
  const conditionType = (condition.type || "none") as AutomationConditionKey;
  const allowedConditions = conditionOptions[trigger] || [];
  if (!conditionLabels[conditionType] || !allowedConditions.includes(conditionType)) {
    errors.push("Die gewählte Bedingung passt nicht zu diesem Auslöser.");
  }
  if (conditionType === "controller_absent" && numberValue(condition.minutes, 0) < 1) {
    errors.push("Der Zeitraum für Controller-Abwesenheit muss mindestens eine Minute betragen.");
  }
  if ((conditionType === "device_online" || conditionType === "device_offline")) {
    const deviceId = typeof condition.deviceId === "string" ? condition.deviceId : "";
    if (!deviceId) errors.push("Bitte wähle das Gerät für diese Bedingung.");
    if (deviceId && !devices.some((device) => device.id === deviceId)) errors.push("Das gewählte Gerät ist auf dieser Seite nicht verfügbar.");
  }
  if (conditionType === "capability_state") {
    const capabilityId = typeof condition.capabilityId === "string" ? condition.capabilityId : "";
    const expectedState = typeof condition.state === "string" ? condition.state.trim() : "";
    if (!capabilityId) errors.push("Bitte wähle die Fähigkeit für diese Bedingung.");
    if (capabilityId && !capabilities.some((capability) => capability.id === capabilityId)) errors.push("Die gewählte Fähigkeit ist auf dieser Seite nicht verfügbar.");
    if (!expectedState) errors.push("Bitte wähle den erwarteten Zustand.");
  }
  if (conditionType === "quota_remaining") {
    const trackerTypeId = typeof condition.trackerTypeId === "string" ? condition.trackerTypeId : "";
    if (!trackerTypeId) errors.push("Bitte wähle den Tracker für das Kontingent.");
    if (trackerTypeId && !trackers.some((tracker) => tracker.id === trackerTypeId)) errors.push("Der gewählte Tracker ist auf dieser Seite nicht verfügbar.");
  }

  const timing = asObject(input.timingJson);
  const timingType = (timing.type || "immediate") as AutomationTimingKey;
  if (!timingLabels[timingType]) errors.push("Bitte wähle eine gültige Zeitlogik.");
  if (timingType === "fixed_delay" && numberValue(timing.minutes ?? timing.delayMinutes, 0) < 1) {
    errors.push("Die feste Verzögerung muss mindestens eine Minute betragen.");
  }
  if (timingType === "random_delay") {
    const min = numberValue(timing.minMinutes, 0);
    const max = numberValue(timing.maxMinutes, -1);
    if (max < min) errors.push("Beim Zufallsfenster darf die maximale Zeit nicht kleiner als die minimale Zeit sein.");
  }

  const actions = Array.isArray(input.actionJson) ? input.actionJson : [];
  if (actions.length !== 1) errors.push("Bitte wähle genau eine Aktion.");
  const action = actions.length ? asObject(actions[0]) : {};
  const actionType = action.type as AutomationActionKey;
  if (!actionLabels[actionType]) errors.push("Bitte wähle eine gültige Aktion.");
  const capabilityId = typeof action.capabilityId === "string" ? action.capabilityId : "";
  const capability = capabilityId ? capabilities.find((item) => item.id === capabilityId) : null;
  if (actionType === "session_finish" && capabilityId) errors.push("Session beenden ist eine Portal-Aktion und braucht kein Gerät.");
  if (actionType !== "session_finish") {
    if (!capabilityId) errors.push("Diese Aktion braucht eine Gerätefähigkeit.");
    if (capabilityId && !capability) errors.push("Die gewählte Gerätefähigkeit ist auf dieser Seite nicht verfügbar.");
    if (capability && !actionOptionsByCapability[capability.kind]) {
      errors.push("Die gewählte Gerätefähigkeit hat einen unbekannten Typ.");
    }
    if (capability && actionOptionsByCapability[capability.kind] && !actionOptionsByCapability[capability.kind].includes(actionType)) {
      errors.push("Die gewählte Aktion passt nicht zur Gerätefähigkeit.");
    }
  }
  if (actionType === "voice_speak" && typeof action.text === "string" && !action.text.trim()) {
    errors.push("Für Sprachausgabe braucht die Aktion einen Text.");
  }
  if (actionType === "camera_request_image") {
    if (numberValue(action.maxRetries, 0) < 0) errors.push("Die Anzahl der Wiederholungen darf nicht negativ sein.");
    if (numberValue(action.timeoutSeconds, 0) < 1) errors.push("Der Kamera-Timeout muss mindestens eine Sekunde betragen.");
    if (numberValue(action.bootDelaySeconds, 0) < 0) errors.push("Die Boot-Wartezeit darf nicht negativ sein.");
    const recoveryCapabilityId = typeof action.recoveryCapabilityId === "string" ? action.recoveryCapabilityId : "";
    const recoveryCapability = recoveryCapabilityId ? capabilities.find((item) => item.id === recoveryCapabilityId) : null;
    if (recoveryCapabilityId && !recoveryCapability) errors.push("Die gewählte Neustart-Fähigkeit ist auf dieser Seite nicht verfügbar.");
    if (recoveryCapability && recoveryCapability.kind !== "Switch") errors.push("Für den Kamera-Neustart muss eine Schaltfähigkeit gewählt werden.");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function automationRuleSummary(input: {
  triggerType: string;
  conditionJson?: unknown;
  timingJson?: unknown;
  actionJson?: unknown;
}, context: { capabilities?: AutomationCapabilityReference[]; devices?: AutomationDeviceReference[]; trackers?: AutomationTrackerReference[] } = {}) {
  const trigger = triggerOptions.find((option) => option.key === input.triggerType)?.label || "Ein Ereignis tritt ein";
  const condition = Array.isArray(input.conditionJson) ? asObject(input.conditionJson[0]) : {};
  const timing = asObject(input.timingJson);
  const action = Array.isArray(input.actionJson) ? asObject(input.actionJson[0]) : {};
  const conditionText = condition.type && condition.type !== "none" ? describeCondition(condition, context).toLowerCase() : "";
  const timingText = timing.type === "random_delay"
    ? `warte zufällig weitere ${numberValue(timing.minMinutes, 0)} bis ${numberValue(timing.maxMinutes, 0)} Minuten`
    : timing.type === "fixed_delay"
      ? `warte ${numberValue(timing.minutes ?? timing.delayMinutes, 0)} Minuten`
      : "führe die Aktion sofort aus";
  const actionText = actionLabels[action.type as AutomationActionKey]?.toLowerCase() || "führe die gewählte Aktion aus";
  const recoveryText = action.type === "camera_request_image" && numberValue(action.maxRetries, 0) > 0
    ? ` Bei Fehlern wird bis zu ${numberValue(action.maxRetries, 0)} Mal wiederholt${action.recoveryCapabilityId ? " und vorher ein Neustart ausgelöst" : ""}.`
    : "";
  if (conditionText) return `Wenn ${trigger.toLowerCase()} und ${conditionText}, ${timingText} und ${actionText}.${recoveryText}`;
  return `Wenn ${trigger.toLowerCase()}, ${timingText} und ${actionText}.${recoveryText}`;
}

export function automationRuleFlow(input: { triggerType: string; conditionJson?: unknown; timingJson?: unknown; actionJson?: unknown }, context: { capabilities?: AutomationCapabilityReference[]; devices?: AutomationDeviceReference[]; trackers?: AutomationTrackerReference[] } = {}) {
  const condition = Array.isArray(input.conditionJson) ? asObject(input.conditionJson[0]) : {};
  const timing = asObject(input.timingJson);
  const action = Array.isArray(input.actionJson) ? asObject(input.actionJson[0]) : {};
  const steps = [
    triggerOptions.find((option) => option.key === input.triggerType)?.label || "Ereignis tritt ein"
  ];
  if (condition.type && condition.type !== "none") {
    steps.push(describeCondition(condition, context));
  }
  if (timing.type === "fixed_delay") steps.push(`${numberValue(timing.minutes ?? timing.delayMinutes, 0)} Minuten warten`);
  if (timing.type === "random_delay") steps.push(`Zufallsfenster ${numberValue(timing.minMinutes, 0)}-${numberValue(timing.maxMinutes, 0)} Minuten`);
  steps.push(actionLabels[action.type as AutomationActionKey] || "Aktion ausführen");
  if (action.type === "camera_request_image") {
    steps.push(numberValue(action.timeoutSeconds, 20) ? `Timeout ${numberValue(action.timeoutSeconds, 20)} Sekunden` : "Kamera-Antwort prüfen");
    if (numberValue(action.maxRetries, 0) > 0) {
      if (action.recoveryCapabilityId) steps.push("Bei Fehler: Kamera-Strom neu schalten");
      steps.push(`Bei Fehler: bis zu ${numberValue(action.maxRetries, 0)} Wiederholung(en)`);
    }
  }
  return steps;
}

export function simulateAutomationRuleTimeline(input: {
  triggerType: string;
  conditionJson?: unknown;
  timingJson?: unknown;
  actionJson?: unknown;
  scrubMinute?: number;
  randomSeed?: number;
}, context: { capabilities?: AutomationCapabilityReference[]; devices?: AutomationDeviceReference[]; trackers?: AutomationTrackerReference[] } = {}) {
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
    ? [{
        minute: conditionMinutes,
        title: describeCondition(condition, context),
        passed: scrubMinute >= conditionMinutes,
        result: scrubMinute >= conditionMinutes ? "Bedingung erfüllt" : condition.type === "controller_absent" ? `Warte noch ${Math.max(0, conditionMinutes - scrubMinute)} Minuten auf mögliche Controller-Aktion` : "Bedingung noch nicht erfüllt"
      }]
    : [];
  const waitingActions = scrubMinute < dueMinute ? [{ minute: dueMinute, title: actionLabels[action.type as AutomationActionKey] || "Aktion" }] : [];
  const dueActions = scrubMinute >= dueMinute ? [{ minute: dueMinute, title: actionLabels[action.type as AutomationActionKey] || "Aktion" }] : [];
  const failureMinute = dueMinute + 1;
  const recoveryActions = action.type === "camera_request_image" && numberValue(action.maxRetries, 0) > 0 && scrubMinute >= failureMinute
    ? [
        ...(action.recoveryCapabilityId ? [{ minute: failureMinute, title: "Kamera-Strom neu schalten" }] : []),
        { minute: failureMinute + Math.ceil(numberValue(action.bootDelaySeconds, 20) / 60), title: "Bild erneut anfordern" }
      ]
    : [];
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
    recoveryActions,
    randomValues: timing.type === "random_delay" ? [{ label: "Gewählte Zufallswartezeit", value: `${delay} Minuten` }] : [],
    timeline: [
      { minute: 0, title: "Auslöser eingetreten", status: scrubMinute >= 0 ? "erledigt" : "wartet" },
      ...(condition.type && condition.type !== "none" ? [{ minute: conditionMinutes, title: describeCondition(condition, context), status: scrubMinute >= conditionMinutes ? "erfüllt" : "wartet" }] : []),
      ...(delay ? [{ minute: dueMinute, title: timing.type === "random_delay" ? `Zufällige Wartezeit endet nach ${delay} Minuten` : `Wartezeit endet nach ${delay} Minuten`, status: scrubMinute >= dueMinute ? "erledigt" : "wartet" }] : []),
      { minute: dueMinute, title: actionLabels[action.type as AutomationActionKey] || "Aktion", status: scrubMinute >= dueMinute ? "fällig" : "wartet" },
      ...(action.type === "camera_request_image" && numberValue(action.maxRetries, 0) > 0 ? [{ minute: failureMinute, title: "Falls kein Bild ankommt: Recovery starten", status: scrubMinute >= failureMinute ? "bereit" : "wartet" }] : [])
    ],
    explanation: explainSimulationState({
      scrubMinute,
      conditionType: condition.type as string | undefined,
      conditionMinutes,
      delay,
      dueMinute,
      actionType: action.type as string | undefined
    }),
    variables: {
      conditionMinutes,
      delayMinutes: delay,
      dueMinute,
      timeoutSeconds: action.type === "camera_request_image" ? numberValue(action.timeoutSeconds, 20) : null,
      maxRetries: action.type === "camera_request_image" ? numberValue(action.maxRetries, 0) : null,
      bootDelaySeconds: action.type === "camera_request_image" ? numberValue(action.bootDelaySeconds, 20) : null,
      sideEffects: false
    }
  };
}

function explainSimulationState(input: { scrubMinute: number; conditionType?: string; conditionMinutes: number; delay: number; dueMinute: number; actionType?: string }) {
  if (input.conditionType && input.conditionType !== "none" && input.scrubMinute < input.conditionMinutes) {
    return `Die Regel wartet noch auf die Bedingung. Bis Minute ${input.conditionMinutes} darf kein widersprechendes Ereignis eintreten.`;
  }
  if (input.scrubMinute < input.dueMinute) {
    return input.delay
      ? `Die Bedingung ist erfüllt. Die Aktion wartet noch bis Minute ${input.dueMinute}.`
      : "Die Regel ist ausgelöst, die Aktion ist noch nicht fällig.";
  }
  if (input.actionType === "camera_request_image") return "Die Bildanforderung ist fällig. In der echten Ausführung würde jetzt ein geschützter Bildrequest erzeugt und an die Bridge übergeben.";
  if (input.actionType === "session_finish") return "Die Session-Ende-Aktion ist fällig. In der echten Ausführung würde der Zustand entsprechend gesetzt.";
  return "Die Aktion ist fällig. Die Simulation erzeugt weiterhin keine echten Side Effects.";
}

function nameById<T extends { id: string }>(items: T[] | undefined, id: unknown, fallback: string, label: (item: T) => string) {
  const item = typeof id === "string" ? items?.find((entry) => entry.id === id) : null;
  return item ? label(item) : fallback;
}

function describeCondition(condition: Record<string, unknown>, context: { capabilities?: AutomationCapabilityReference[]; devices?: AutomationDeviceReference[]; trackers?: AutomationTrackerReference[] } = {}) {
  const type = condition.type as AutomationConditionKey;
  if (type === "controller_absent") return `${numberValue(condition.minutes, 20)} Minuten keine Aktion des Controllers`;
  if (type === "device_online") {
    const device = nameById(context.devices, condition.deviceId, "das gewählte Gerät", (item) => item.name);
    return `${device} ist verbunden`;
  }
  if (type === "device_offline") {
    const device = nameById(context.devices, condition.deviceId, "das gewählte Gerät", (item) => item.name);
    return `${device} ist nicht erreichbar`;
  }
  if (type === "capability_state") {
    const capability = nameById(context.capabilities, condition.capabilityId, "die gewählte Fähigkeit", (item) => `${item.deviceName || "Gerät"} · ${item.title || "Fähigkeit"}`);
    return `${capability} hat den Zustand ${labelAutomationValue("health", typeof condition.state === "string" ? condition.state : "")}`;
  }
  if (type === "quota_remaining") {
    const tracker = nameById(context.trackers, condition.trackerTypeId, "das gewählte Kontingent", (item) => item.title);
    return `${tracker} hat noch offenes Kontingent`;
  }
  return conditionLabels[type] || "Bedingung erfüllt";
}

export function labelAutomationValue(kind: keyof typeof automationLabels, value?: string | null) {
  if (!value) return "Nicht gesetzt";
  const map = automationLabels[kind] as Record<string, string>;
  return map[value] || value;
}
