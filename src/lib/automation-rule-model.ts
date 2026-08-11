export type AutomationTriggerKey =
  | "session_started"
  | "session_pending_end"
  | "session_finished"
  | "action_succeeded"
  | "action_failed"
  | "image_uploaded"
  | "camera_online"
  | "camera_offline"
  | "switched_on"
  | "switched_off"
  | "switch_error"
  | "speech_started"
  | "speech_finished"
  | "voice_error"
  | "capability_event"
  | "event_absent"
  | "device_state_changed"
  | "quota_open";

export type AutomationConditionKey =
  | "none"
  | "controller_absent"
  | "device_online"
  | "device_offline"
  | "capability_state"
  | "last_image_younger_than"
  | "switch_state_for"
  | "quota_remaining";

export type AutomationTimingKey = "immediate" | "fixed_delay" | "random_delay";
export type AutomationActionKey = "camera_request_image" | "camera_health_check" | "switch_on" | "switch_off" | "switch_toggle" | "voice_speak" | "session_finish";
export type CapabilityKind = "Camera" | "Switch" | "Voice";

export type RuleActionFormValue = {
  capabilityId: string;
  capabilityKind: CapabilityKind | "";
  actionType: AutomationActionKey;
  voiceText: string;
  cameraMaxRetries: number;
  cameraTimeoutSeconds: number;
  cameraBootDelaySeconds: number;
  recoveryCapabilityId: string;
};

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

export type AutomationSimulationOverrides = {
  deviceHealth?: Record<string, string>;
  capabilityState?: Record<string, string>;
  lastImageAgeSeconds?: Record<string, number>;
  capabilityStateAgeMinutes?: Record<string, number>;
};

export type AutomationRuleContext = {
  capabilities?: AutomationCapabilityReference[];
  devices?: AutomationDeviceReference[];
  trackers?: AutomationTrackerReference[];
  simulationOverrides?: AutomationSimulationOverrides;
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
    session_end_kept: "Bestehendes Endfenster blieb unverändert",
    rule_created: "Regel wurde angelegt",
    rule_updated: "Regel wurde geändert",
    rule_deleted: "Regel wurde gelöscht",
    rule_triggered: "Regel wurde ausgelöst",
    rule_condition_blocked: "Regelbedingung hat nicht gepasst",
    rule_processing_failed: "Regelverarbeitung ist fehlgeschlagen",
    device_deleted: "Gerät wurde entfernt",
    capability_added: "Fähigkeit wurde hinzugefügt",
    capability_deleted: "Fähigkeit wurde entfernt",
    action_created: "Aktion wurde geplant",
    action_ready: "Aktion ist bereit",
    action_ready_for_bridge: "Aktion ist bereit für die Bridge",
    action_claimed_by_bridge: "Bridge hat Aktion übernommen",
    action_requeued_for_bridge: "Bridge-Aktion wurde erneut bereitgestellt",
    action_succeeded: "Aktion war erfolgreich",
    action_failed: "Aktion ist fehlgeschlagen",
    action_cancelled: "Aktion wurde nicht ausgeführt",
    image_requested: "Bild wurde angefordert",
    image_uploaded: "Bild wurde empfangen",
    camera_online: "Kamera ist wieder verbunden",
    camera_offline: "Kamera ist nicht erreichbar",
    switched_on: "Schalter wurde eingeschaltet",
    switched_off: "Schalter wurde ausgeschaltet",
    switch_error: "Schalter meldet einen Fehler",
    speech_started: "Sprachausgabe wurde gestartet",
    speech_finished: "Sprachausgabe wurde beendet",
    voice_error: "Sprachausgabe ist nicht erreichbar",
    capability_event: "Gerätefähigkeit hat ein Ereignis gemeldet",
    device_state_changed: "Gerätezustand hat sich geändert",
    quota_open: "Tracker-Kontingent ist offen",
    camera_recovery_scheduled: "Kamera-Wiederherstellung wurde geplant",
    camera_recovery_exhausted: "Kamera-Wiederherstellung ist beendet",
    bridge_heartbeat: "Bridge hat sich gemeldet",
    bridge_command_created: "Bridge-Befehl wurde erstellt",
    bridge_command_finished: "Bridge-Befehl wurde abgeschlossen"
  },
  health: {
    UNKNOWN: "Nicht verbunden",
    ONLINE: "Verbunden",
    OFFLINE: "Nicht erreichbar",
    ERROR: "Fehler",
    BOOTING: "Startet",
    ON: "Eingeschaltet",
    OFF: "Ausgeschaltet",
    SWITCHING: "Schaltet gerade"
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
  },
  capabilityKinds: {
    Camera: "Kamera",
    Switch: "Schalter",
    Voice: "Sprachausgabe"
  }
} as const;

export const triggerOptions: Array<{ key: AutomationTriggerKey; label: string; description: string }> = [
  { key: "session_started", label: "Session wurde gestartet", description: "Reagiert, sobald eine Automation-Session beginnt." },
  { key: "session_pending_end", label: "Session-Ende wurde vorgemerkt", description: "Reagiert, wenn ein verzögertes Ende geplant wurde." },
  { key: "session_finished", label: "Session wurde beendet", description: "Reagiert, sobald eine Automation-Session tatsächlich abgeschlossen wurde." },
  { key: "action_succeeded", label: "Aktion war erfolgreich", description: "Reagiert auf eine erfolgreich ausgeführte Aktion." },
  { key: "action_failed", label: "Aktion ist fehlgeschlagen", description: "Reagiert auf Fehler, z. B. Kamera nicht erreichbar." },
  { key: "image_uploaded", label: "Bild wurde empfangen", description: "Reagiert, sobald ein angefordertes Kamerabild im Portal angekommen ist." },
  { key: "camera_online", label: "Kamera ist wieder verbunden", description: "Reagiert auf eine Kamera, die wieder erreichbar ist." },
  { key: "camera_offline", label: "Kamera ist nicht erreichbar", description: "Reagiert auf eine Kamera, die nicht erreichbar ist." },
  { key: "switched_on", label: "Schalter wurde eingeschaltet", description: "Reagiert auf einen Schalter, der eingeschaltet wurde." },
  { key: "switched_off", label: "Schalter wurde ausgeschaltet", description: "Reagiert auf einen Schalter, der ausgeschaltet wurde." },
  { key: "switch_error", label: "Schalter meldet Fehler", description: "Reagiert auf einen Schaltfehler einer konkreten Schaltfähigkeit." },
  { key: "speech_started", label: "Sprachausgabe wurde gestartet", description: "Reagiert, sobald eine Ansage gestartet wurde." },
  { key: "speech_finished", label: "Sprachausgabe wurde beendet", description: "Reagiert, sobald eine Ansage erfolgreich beendet wurde." },
  { key: "voice_error", label: "Sprachausgabe ist nicht erreichbar", description: "Reagiert, wenn die Sprachausgabe nicht erreichbar ist oder keine erfolgreiche Rückmeldung liefert." },
  { key: "capability_event", label: "Gerätefähigkeit meldet Ereignis", description: "Reagiert auf ein Ereignis einer konkreten Kamera, eines Schalters oder einer Sprachausgabe." },
  { key: "event_absent", label: "Ereignis bleibt aus", description: "Reagiert, wenn innerhalb einer Zeitspanne nichts passiert." },
  { key: "device_state_changed", label: "Gerätezustand ändert sich", description: "Reagiert auf lokale ioBroker-/MQTT-Zustände." },
  { key: "quota_open", label: "Tracker-Kontingent ist offen", description: "Reagiert, wenn noch Zeit zu erfüllen ist." }
];

export const conditionOptions: Record<AutomationTriggerKey, AutomationConditionKey[]> = {
  session_started: ["none", "controller_absent", "device_online", "device_offline", "last_image_younger_than", "switch_state_for"],
  session_pending_end: ["none", "device_online", "device_offline", "last_image_younger_than", "switch_state_for"],
  session_finished: ["none", "quota_remaining"],
  action_succeeded: ["none", "capability_state", "last_image_younger_than", "switch_state_for"],
  action_failed: ["none", "device_offline", "capability_state", "last_image_younger_than", "switch_state_for"],
  image_uploaded: ["none", "capability_state", "last_image_younger_than", "switch_state_for"],
  camera_online: ["none", "device_online", "capability_state", "last_image_younger_than", "switch_state_for"],
  camera_offline: ["none", "device_offline", "capability_state", "last_image_younger_than", "switch_state_for"],
  switched_on: ["none", "capability_state", "switch_state_for"],
  switched_off: ["none", "capability_state", "switch_state_for"],
  switch_error: ["none", "device_offline", "capability_state", "switch_state_for"],
  speech_started: ["none", "capability_state"],
  speech_finished: ["none", "capability_state"],
  voice_error: ["none", "device_offline", "capability_state"],
  capability_event: ["capability_state", "device_online", "device_offline", "last_image_younger_than", "switch_state_for"],
  event_absent: ["controller_absent", "device_online", "device_offline", "switch_state_for"],
  device_state_changed: ["capability_state", "device_online", "device_offline", "last_image_younger_than", "switch_state_for"],
  quota_open: ["quota_remaining"]
};

export const conditionLabels: Record<AutomationConditionKey, string> = {
  none: "Keine zusätzliche Bedingung",
  controller_absent: "Keine Aktion des Controllers",
  device_online: "Gerät ist verbunden",
  device_offline: "Gerät ist nicht erreichbar",
  capability_state: "Fähigkeit hat bestimmten Zustand",
  last_image_younger_than: "Letztes Kamerabild ist jünger als Vorgabe",
  switch_state_for: "Schalter ist seit einer Zeit ein oder aus",
  quota_remaining: "Kontingent ist noch offen"
};

export const actionOptionsByCapability: Record<CapabilityKind, AutomationActionKey[]> = {
  Camera: ["camera_request_image", "camera_health_check"],
  Switch: ["switch_on", "switch_off", "switch_toggle"],
  Voice: ["voice_speak"]
};

export const actionLabels: Record<AutomationActionKey, string> = {
  camera_request_image: "Bild anfordern",
  camera_health_check: "Verbindung prüfen",
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

export function triggerNeedsDevice(triggerType: AutomationTriggerKey) {
  return triggerType === "device_state_changed";
}

export function triggerNeedsCapability(triggerType: AutomationTriggerKey) {
  return ["image_uploaded", "camera_online", "camera_offline", "switched_on", "switched_off", "switch_error", "speech_started", "speech_finished", "voice_error", "capability_event"].includes(triggerType);
}

export function triggerCapabilityFilter(triggerType: AutomationTriggerKey): CapabilityKind | null {
  if (["image_uploaded", "camera_online", "camera_offline"].includes(triggerType)) return "Camera";
  if (["switched_on", "switched_off", "switch_error"].includes(triggerType)) return "Switch";
  if (["speech_started", "speech_finished", "voice_error"].includes(triggerType)) return "Voice";
  return null;
}

export type RuleFormValue = {
  triggerType: AutomationTriggerKey;
  triggerDeviceId: string;
  triggerCapabilityId: string;
  conditionType: AutomationConditionKey;
  conditionMinutes: number;
  conditionDeviceId: string;
  conditionCapabilityId: string;
  conditionExpectedState: string;
  conditionImageMaxAgeSeconds: number;
  conditionStateAgeMinutes: number;
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
  actions: RuleActionFormValue[];
  mode: "ONCE" | "REPEAT";
};

export function defaultRuleActionValue(): RuleActionFormValue {
  return {
    capabilityId: "",
    capabilityKind: "",
    actionType: "session_finish",
    voiceText: "",
    cameraMaxRetries: 2,
    cameraTimeoutSeconds: 20,
    cameraBootDelaySeconds: 20,
    recoveryCapabilityId: ""
  };
}

export function defaultRuleFormValue(): RuleFormValue {
  const action = defaultRuleActionValue();
  return {
    triggerType: "session_started",
    triggerDeviceId: "",
    triggerCapabilityId: "",
    conditionType: "none",
    conditionMinutes: 20,
    conditionDeviceId: "",
    conditionCapabilityId: "",
    conditionExpectedState: "ONLINE",
    conditionImageMaxAgeSeconds: 300,
    conditionStateAgeMinutes: 5,
    conditionTrackerTypeId: "",
    timingType: "immediate",
    delayMinutes: 5,
    minMinutes: 5,
    maxMinutes: 10,
    capabilityId: action.capabilityId,
    capabilityKind: action.capabilityKind,
    actionType: action.actionType,
    voiceText: action.voiceText,
    cameraMaxRetries: action.cameraMaxRetries,
    cameraTimeoutSeconds: action.cameraTimeoutSeconds,
    cameraBootDelaySeconds: action.cameraBootDelaySeconds,
    recoveryCapabilityId: action.recoveryCapabilityId,
    actions: [action],
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
  triggerJson?: unknown;
  conditionJson?: unknown;
  timingJson?: unknown;
  actionJson?: unknown;
  mode?: string | null;
} | null): RuleFormValue {
  const value = defaultRuleFormValue();
  if (!rule) return value;
  if (triggerOptions.some((option) => option.key === rule.triggerType)) value.triggerType = rule.triggerType as AutomationTriggerKey;
  const trigger = asObject(rule.triggerJson);
  value.triggerDeviceId = typeof trigger.deviceId === "string" ? trigger.deviceId : "";
  value.triggerCapabilityId = typeof trigger.capabilityId === "string" ? trigger.capabilityId : "";
  const condition = Array.isArray(rule.conditionJson) ? asObject(rule.conditionJson[0]) : {};
  if (condition.type && conditionLabels[condition.type as AutomationConditionKey]) value.conditionType = condition.type as AutomationConditionKey;
  value.conditionMinutes = numberValue(condition.minutes, value.conditionMinutes);
  value.conditionDeviceId = typeof condition.deviceId === "string" ? condition.deviceId : "";
  value.conditionCapabilityId = typeof condition.capabilityId === "string" ? condition.capabilityId : "";
  value.conditionExpectedState = typeof condition.state === "string" ? condition.state : value.conditionExpectedState;
  value.conditionImageMaxAgeSeconds = numberValue(condition.maxAgeSeconds ?? condition.seconds, value.conditionImageMaxAgeSeconds);
  value.conditionStateAgeMinutes = numberValue(condition.minutes ?? condition.stateAgeMinutes, value.conditionStateAgeMinutes);
  value.conditionTrackerTypeId = typeof condition.trackerTypeId === "string" ? condition.trackerTypeId : "";
  const timing = asObject(rule.timingJson);
  if (timing.type && timingLabels[timing.type as AutomationTimingKey]) value.timingType = timing.type as AutomationTimingKey;
  value.delayMinutes = numberValue(timing.minutes ?? timing.delayMinutes, value.delayMinutes);
  value.minMinutes = numberValue(timing.minMinutes, value.minMinutes);
  value.maxMinutes = Math.max(value.minMinutes, numberValue(timing.maxMinutes, value.maxMinutes));
  const actions = Array.isArray(rule.actionJson) ? rule.actionJson.map((item) => {
    const action = asObject(item);
    const next = defaultRuleActionValue();
    if (action.type && actionLabels[action.type as AutomationActionKey]) next.actionType = action.type as AutomationActionKey;
    next.capabilityId = typeof action.capabilityId === "string" ? action.capabilityId : "";
    next.capabilityKind = typeof action.capabilityKind === "string" ? action.capabilityKind as CapabilityKind : "";
    next.voiceText = typeof action.text === "string" ? action.text : "";
    next.cameraMaxRetries = numberValue(action.maxRetries, next.cameraMaxRetries);
    next.cameraTimeoutSeconds = numberValue(action.timeoutSeconds, next.cameraTimeoutSeconds);
    next.cameraBootDelaySeconds = numberValue(action.bootDelaySeconds, next.cameraBootDelaySeconds);
    next.recoveryCapabilityId = typeof action.recoveryCapabilityId === "string" ? action.recoveryCapabilityId : "";
    return next;
  }).filter((action) => actionLabels[action.actionType]) : [];
  value.actions = actions.length ? actions : [defaultRuleActionValue()];
  const first = value.actions[0];
  value.actionType = first.actionType;
  value.capabilityId = first.capabilityId;
  value.capabilityKind = first.capabilityKind;
  value.voiceText = first.voiceText;
  value.cameraMaxRetries = first.cameraMaxRetries;
  value.cameraTimeoutSeconds = first.cameraTimeoutSeconds;
  value.cameraBootDelaySeconds = first.cameraBootDelaySeconds;
  value.recoveryCapabilityId = first.recoveryCapabilityId;
  value.mode = rule.mode === "REPEAT" ? "REPEAT" : "ONCE";
  return value;
}

export function buildStoredRule(value: RuleFormValue) {
  const triggerJson = {
    deviceId: triggerNeedsDevice(value.triggerType) ? value.triggerDeviceId || null : null,
    capabilityId: triggerNeedsCapability(value.triggerType) ? value.triggerCapabilityId || null : null
  };
  const conditions = value.conditionType === "none" ? [] : [{
    type: value.conditionType,
    minutes: value.conditionType === "controller_absent" ? value.conditionMinutes : value.conditionType === "switch_state_for" ? value.conditionStateAgeMinutes : 0,
    deviceId: ["device_online", "device_offline"].includes(value.conditionType) ? value.conditionDeviceId || null : null,
    capabilityId: ["capability_state", "last_image_younger_than", "switch_state_for"].includes(value.conditionType) ? value.conditionCapabilityId || null : null,
    state: ["capability_state", "switch_state_for"].includes(value.conditionType) ? value.conditionExpectedState || null : null,
    maxAgeSeconds: value.conditionType === "last_image_younger_than" ? Math.max(1, value.conditionImageMaxAgeSeconds) : null,
    trackerTypeId: value.conditionType === "quota_remaining" ? value.conditionTrackerTypeId || null : null
  }];
  const timing = value.timingType === "fixed_delay"
    ? { type: "fixed_delay", minutes: value.delayMinutes }
    : value.timingType === "random_delay"
      ? { type: "random_delay", minMinutes: value.minMinutes, maxMinutes: Math.max(value.minMinutes, value.maxMinutes) }
      : { type: "immediate" };
  const formActions = value.actions?.length ? value.actions : [{
    capabilityId: value.capabilityId,
    capabilityKind: value.capabilityKind,
    actionType: value.actionType,
    voiceText: value.voiceText,
    cameraMaxRetries: value.cameraMaxRetries,
    cameraTimeoutSeconds: value.cameraTimeoutSeconds,
    cameraBootDelaySeconds: value.cameraBootDelaySeconds,
    recoveryCapabilityId: value.recoveryCapabilityId
  }];
  const actions = formActions.map((action) => ({
    type: action.actionType,
    capabilityId: action.capabilityId || null,
    capabilityKind: action.capabilityKind || null,
    text: action.actionType === "voice_speak" ? action.voiceText : null,
    maxRetries: action.actionType === "camera_request_image" ? action.cameraMaxRetries : null,
    timeoutSeconds: ["camera_request_image", "camera_health_check"].includes(action.actionType) ? action.cameraTimeoutSeconds : null,
    bootDelaySeconds: action.actionType === "camera_request_image" ? action.cameraBootDelaySeconds : null,
    recoveryCapabilityId: action.actionType === "camera_request_image" ? action.recoveryCapabilityId || null : null
  }));
  return {
    triggerType: value.triggerType,
    triggerJson,
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
  triggerJson?: unknown;
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
  const triggerJson = asObject(input.triggerJson);
  if (triggerNeedsDevice(trigger)) {
    const deviceId = typeof triggerJson.deviceId === "string" ? triggerJson.deviceId : "";
    if (!deviceId) errors.push("Bitte wähle das Gerät, auf dessen Ereignis die Regel reagieren soll.");
    if (deviceId && !devices.some((device) => device.id === deviceId)) errors.push("Das gewählte Auslöser-Gerät ist auf dieser Seite nicht verfügbar.");
  }
  if (triggerNeedsCapability(trigger)) {
    const capabilityId = typeof triggerJson.capabilityId === "string" ? triggerJson.capabilityId : "";
    const capability = capabilityId ? capabilities.find((item) => item.id === capabilityId) : null;
    const requiredKind = triggerCapabilityFilter(trigger);
    if (!capabilityId) errors.push("Bitte wähle die Fähigkeit, auf deren Ereignis die Regel reagieren soll.");
    if (capabilityId && !capability) errors.push("Die gewählte Auslöser-Fähigkeit ist auf dieser Seite nicht verfügbar.");
    if (capability && requiredKind && capability.kind !== requiredKind) errors.push(`Für diesen Auslöser muss eine ${automationLabels.capabilityKinds[requiredKind]}-Fähigkeit gewählt werden.`);
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
    const requiredKind = triggerCapabilityFilter(trigger);
    const capability = capabilityId ? capabilities.find((item) => item.id === capabilityId) : null;
    if (!capabilityId) errors.push("Bitte wähle die Fähigkeit für diese Bedingung.");
    if (capabilityId && !capability) errors.push("Die gewählte Fähigkeit ist auf dieser Seite nicht verfügbar.");
    if (capability && requiredKind && capability.kind !== requiredKind) errors.push("Die gewählte Fähigkeitsbedingung passt nicht zum Auslöser.");
    if (!expectedState) errors.push("Bitte wähle den erwarteten Zustand.");
  }
  if (conditionType === "last_image_younger_than") {
    const capabilityId = typeof condition.capabilityId === "string" ? condition.capabilityId : "";
    const capability = capabilityId ? capabilities.find((item) => item.id === capabilityId) : null;
    if (!capabilityId) errors.push("Bitte wähle die Kamera für diese Bedingung.");
    if (capabilityId && !capability) errors.push("Die gewählte Kamera ist auf dieser Seite nicht verfügbar.");
    if (capability && capability.kind !== "Camera") errors.push("Für diese Bedingung muss eine Kamera-Fähigkeit gewählt werden.");
    if (numberValue(condition.maxAgeSeconds ?? condition.seconds, 0) < 1) errors.push("Das maximale Bildalter muss mindestens eine Sekunde betragen.");
  }
  if (conditionType === "switch_state_for") {
    const capabilityId = typeof condition.capabilityId === "string" ? condition.capabilityId : "";
    const capability = capabilityId ? capabilities.find((item) => item.id === capabilityId) : null;
    const expectedState = typeof condition.state === "string" ? condition.state.trim() : "";
    if (!capabilityId) errors.push("Bitte wähle den Schalter für diese Bedingung.");
    if (capabilityId && !capability) errors.push("Der gewählte Schalter ist auf dieser Seite nicht verfügbar.");
    if (capability && capability.kind !== "Switch") errors.push("Für diese Bedingung muss eine Schaltfähigkeit gewählt werden.");
    if (!["ON", "OFF"].includes(expectedState)) errors.push("Bitte wähle, ob der Schalter ein- oder ausgeschaltet sein soll.");
    if (numberValue(condition.minutes ?? condition.stateAgeMinutes, 0) < 1) errors.push("Die Dauer des Schaltzustands muss mindestens eine Minute betragen.");
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
  if (!actions.length) errors.push("Bitte wähle mindestens eine Aktion.");
  if (actions.length > 8) errors.push("Bitte verwende höchstens acht Aktionen in einer Regel.");
  actions.forEach((rawAction, index) => {
    const action = asObject(rawAction);
    const prefix = actions.length > 1 ? `Aktion ${index + 1}: ` : "";
    const actionType = action.type as AutomationActionKey;
    if (!actionLabels[actionType]) errors.push(`${prefix}Bitte wähle eine gültige Aktion.`);
    const capabilityId = typeof action.capabilityId === "string" ? action.capabilityId : "";
    const capability = capabilityId ? capabilities.find((item) => item.id === capabilityId) : null;
    if (actionType === "session_finish" && capabilityId) errors.push(`${prefix}Session beenden ist eine Portal-Aktion und braucht kein Gerät.`);
    if (actionType !== "session_finish") {
      if (!capabilityId) errors.push(`${prefix}Diese Aktion braucht eine Gerätefähigkeit.`);
      if (capabilityId && !capability) errors.push(`${prefix}Die gewählte Gerätefähigkeit ist auf dieser Seite nicht verfügbar.`);
      if (capability && !actionOptionsByCapability[capability.kind]) {
        errors.push(`${prefix}Die gewählte Gerätefähigkeit hat einen unbekannten Typ.`);
      }
      if (capability && actionOptionsByCapability[capability.kind] && !actionOptionsByCapability[capability.kind].includes(actionType)) {
        errors.push(`${prefix}Die gewählte Aktion passt nicht zur Gerätefähigkeit.`);
      }
    }
    if (actionType === "voice_speak" && typeof action.text === "string" && !action.text.trim()) {
      errors.push(`${prefix}Für Sprachausgabe braucht die Aktion einen Text.`);
    }
    if (actionType === "camera_request_image" || actionType === "camera_health_check") {
      if (capability && capability.kind !== "Camera") errors.push(`${prefix}Für diese Kamera-Aktion muss eine Kamera-Fähigkeit gewählt werden.`);
      if (numberValue(action.timeoutSeconds, 0) < 1) errors.push(`${prefix}Der Kamera-Timeout muss mindestens eine Sekunde betragen.`);
    }
    if (actionType === "camera_request_image") {
      if (numberValue(action.maxRetries, 0) < 0) errors.push(`${prefix}Die Anzahl der Wiederholungen darf nicht negativ sein.`);
      if (numberValue(action.bootDelaySeconds, 0) < 0) errors.push(`${prefix}Die Boot-Wartezeit darf nicht negativ sein.`);
      const recoveryCapabilityId = typeof action.recoveryCapabilityId === "string" ? action.recoveryCapabilityId : "";
      const recoveryCapability = recoveryCapabilityId ? capabilities.find((item) => item.id === recoveryCapabilityId) : null;
      if (recoveryCapabilityId && !recoveryCapability) errors.push(`${prefix}Die gewählte Neustart-Fähigkeit ist auf dieser Seite nicht verfügbar.`);
      if (recoveryCapability && recoveryCapability.kind !== "Switch") errors.push(`${prefix}Für den Kamera-Neustart muss eine Schaltfähigkeit gewählt werden.`);
    }
  });

  return {
    ok: errors.length === 0,
    errors
  };
}

export function automationRuleSummary(input: {
  triggerType: string;
  triggerJson?: unknown;
  conditionJson?: unknown;
  timingJson?: unknown;
  actionJson?: unknown;
}, context: AutomationRuleContext = {}) {
  const trigger = describeTrigger(input.triggerType, input.triggerJson, context);
  const condition = Array.isArray(input.conditionJson) ? asObject(input.conditionJson[0]) : {};
  const timing = asObject(input.timingJson);
  const actions = Array.isArray(input.actionJson) ? input.actionJson.map((item) => asObject(item)) : [];
  const conditionText = condition.type && condition.type !== "none" ? describeCondition(condition, context).toLowerCase() : "";
  const timingText = timing.type === "random_delay"
    ? `warte zufällig weitere ${numberValue(timing.minMinutes, 0)} bis ${numberValue(timing.maxMinutes, 0)} Minuten`
    : timing.type === "fixed_delay"
      ? `warte ${numberValue(timing.minutes ?? timing.delayMinutes, 0)} Minuten`
      : "führe sofort aus";
  const actionText = describeActions(actions, context);
  const recoveryText = actions.some((action) => action.type === "camera_request_image" && numberValue(action.maxRetries, 0) > 0)
    ? " Bei Kamera-Fehlern wird die konfigurierte Wiederherstellung ausgeführt."
    : "";
  if (conditionText) return `Wenn ${trigger.toLowerCase()} und ${conditionText}, ${timingText} und ${actionText}.${recoveryText}`;
  return `Wenn ${trigger.toLowerCase()}, ${timingText} und ${actionText}.${recoveryText}`;
}

export function automationRuleFlow(input: { triggerType: string; triggerJson?: unknown; conditionJson?: unknown; timingJson?: unknown; actionJson?: unknown }, context: AutomationRuleContext = {}) {
  const condition = Array.isArray(input.conditionJson) ? asObject(input.conditionJson[0]) : {};
  const timing = asObject(input.timingJson);
  const actions = Array.isArray(input.actionJson) ? input.actionJson.map((item) => asObject(item)) : [];
  const steps = [
    describeTrigger(input.triggerType, input.triggerJson, context)
  ];
  if (condition.type && condition.type !== "none") {
    steps.push(describeCondition(condition, context));
  }
  if (timing.type === "fixed_delay") steps.push(`${numberValue(timing.minutes ?? timing.delayMinutes, 0)} Minuten warten`);
  if (timing.type === "random_delay") steps.push(`Zufallsfenster ${numberValue(timing.minMinutes, 0)}-${numberValue(timing.maxMinutes, 0)} Minuten`);
  actions.forEach((action, index) => {
    steps.push(actions.length > 1 ? `Aktion ${index + 1}: ${actionTitleWithTarget(action, context)}` : actionTitleWithTarget(action, context));
    if (action.type === "camera_request_image") {
      steps.push(numberValue(action.timeoutSeconds, 20) ? `Timeout ${numberValue(action.timeoutSeconds, 20)} Sekunden` : "Kamera-Antwort prüfen");
      if (numberValue(action.maxRetries, 0) > 0) {
        if (action.recoveryCapabilityId) steps.push("Bei Fehler: Kamera-Strom neu schalten");
        steps.push(`Bei Fehler: bis zu ${numberValue(action.maxRetries, 0)} Wiederholung(en)`);
      }
    } else if (action.type === "camera_health_check") {
      steps.push(numberValue(action.timeoutSeconds, 20) ? `Verbindung höchstens ${numberValue(action.timeoutSeconds, 20)} Sekunden prüfen` : "Kameraverbindung prüfen");
    }
  });
  return steps;
}

export function simulateAutomationRuleTimeline(input: {
  triggerType: string;
  triggerJson?: unknown;
  conditionJson?: unknown;
  timingJson?: unknown;
  actionJson?: unknown;
  scrubMinute?: number;
  randomSeed?: number;
  controllerActionMinute?: number | null;
}, context: AutomationRuleContext = {}) {
  const condition = Array.isArray(input.conditionJson) ? asObject(input.conditionJson[0]) : {};
  const timing = asObject(input.timingJson);
  const actions = Array.isArray(input.actionJson) ? input.actionJson.map((item) => asObject(item)).filter((item) => item.type) : [];
  const primaryAction = actions[0] || {};
  const conditionType = condition.type as AutomationConditionKey | undefined;
  const conditionMinutes = conditionType === "controller_absent" ? numberValue(condition.minutes, 0) : 0;
  const controllerActionMinute = conditionType === "controller_absent" && input.controllerActionMinute !== null && input.controllerActionMinute !== undefined
    ? numberValue(input.controllerActionMinute, 0)
    : null;
  const controllerActionBlocks = controllerActionMinute !== null && controllerActionMinute <= conditionMinutes;
  const conditionEvaluation = evaluateSimulationCondition(condition, context);
  const simulatedStateVariables = simulationStateVariables(condition, context);
  const delay = timing.type === "random_delay"
    ? numberValue(timing.minMinutes, 0) + ((input.randomSeed ?? 3) % (Math.max(0, numberValue(timing.maxMinutes, 0) - numberValue(timing.minMinutes, 0)) + 1))
    : timing.type === "fixed_delay"
      ? numberValue(timing.minutes ?? timing.delayMinutes, 0)
      : 0;
  const dueMinute = conditionEvaluation.canBecomeTrue ? conditionMinutes + delay : null;
  const scrubLimit = Math.max(1, (dueMinute ?? Math.max(conditionMinutes, delay)) + 5);
  const scrubMinute = Math.min(Math.max(0, input.scrubMinute ?? 0), scrubLimit);
  const ruleTitle = describeTrigger(input.triggerType, input.triggerJson, context);
  const controllerActionHasHappened = controllerActionMinute !== null && scrubMinute >= controllerActionMinute;
  const controllerActionBlocksNow = controllerActionBlocks && controllerActionHasHappened;
  const events = [
    { minute: 0, title: ruleTitle },
    ...(controllerActionMinute !== null ? [{ minute: controllerActionMinute, title: "Controller-Aktion simuliert" }] : [])
  ];
  const conditions = condition.type && condition.type !== "none"
    ? [{
        minute: conditionMinutes,
        title: describeCondition(condition, context),
        passed: conditionEvaluation.passed && scrubMinute >= conditionMinutes && !controllerActionBlocksNow,
        result: controllerActionBlocksNow
          ? `Bei Minute ${controllerActionMinute} wurde eine Controller-Aktion simuliert. Die Abwesenheitsbedingung ist damit nicht mehr erfüllt.`
          : scrubMinute < conditionMinutes && condition.type === "controller_absent"
            ? `Warte noch ${Math.max(0, conditionMinutes - scrubMinute)} Minuten auf mögliche Controller-Aktion`
            : conditionEvaluation.result
      }]
    : [];
  const conditionSatisfiedAtScrub = !condition.type || condition.type === "none" || (conditionEvaluation.passed && scrubMinute >= conditionMinutes && !controllerActionBlocksNow);
  const actionsAreDue = dueMinute !== null && conditionSatisfiedAtScrub && scrubMinute >= dueMinute;
  const actionItems = actions.map((action, index) => {
    const minute = dueMinute ?? conditionMinutes;
    const title = actions.length > 1 ? `Aktion ${index + 1}: ${actionTitleWithTarget(action, context)}` : actionTitleWithTarget(action, context);
    return {
      minute,
      title,
      detail: simulationActionDetail(action, context, minute, actions.length > 1 ? index + 1 : null)
    };
  });
  const hasSessionFinish = actions.some((action) => action.type === "session_finish") && conditionEvaluation.canBecomeTrue && dueMinute !== null;
  const pendingEnd = hasSessionFinish && dueMinute > 0
    ? [{
        requestedMinute: conditionMinutes,
        dueMinute,
        state: scrubMinute < conditionMinutes ? "noch nicht angefordert" : scrubMinute < dueMinute ? "Ende vorgemerkt" : "ausgeführt",
        text: scrubMinute < conditionMinutes
          ? `Das verzögerte Ende wird erst nach erfüllter Bedingung bei Minute ${conditionMinutes} vorgemerkt.`
          : scrubMinute < dueMinute
            ? `Das Ende ist vorgemerkt und wird bei Minute ${dueMinute} ausgeführt.`
            : `Das vorgemerkte Ende ist seit Minute ${dueMinute} fällig.`
      }]
    : [];
  const waitingActions = conditionEvaluation.canBecomeTrue && !controllerActionBlocksNow && !actionsAreDue ? actionItems : [];
  const dueActions = actionsAreDue ? actionItems : [];
  const blockedActions = conditionEvaluation.canBecomeTrue && !controllerActionBlocksNow ? [] : actionItems;
  const failureMinute = (dueMinute ?? conditionMinutes) + 1;
  const recoveryActions = scrubMinute >= failureMinute
    ? actions.flatMap((action, index) => actionsAreDue && action.type === "camera_request_image" && numberValue(action.maxRetries, 0) > 0
      ? [
          ...(action.recoveryCapabilityId ? [{ minute: failureMinute, title: actions.length > 1 ? `Aktion ${index + 1}: Kamera-Strom neu schalten` : "Kamera-Strom neu schalten" }] : []),
          { minute: failureMinute + Math.ceil(numberValue(action.bootDelaySeconds, 20) / 60), title: actions.length > 1 ? `Aktion ${index + 1}: Bild erneut anfordern` : "Bild erneut anfordern" }
        ]
      : [])
    : [];
  return {
    durationMinutes: scrubLimit,
    scrubMinute,
    sessionState: hasSessionFinish && dueMinute !== null && scrubMinute >= dueMinute ? "FINISHED" : hasSessionFinish && pendingEnd.length && scrubMinute >= conditionMinutes ? "PENDING_END" : "RUNNING",
    events: events.filter((event) => event.minute <= scrubMinute),
    conditions,
    triggeredRules: scrubMinute >= 0 ? [ruleTitle] : [],
    waitingActions,
    dueActions,
    completedActions: dueMinute !== null && scrubMinute > dueMinute ? actionItems : [],
    blockedActions,
    pendingEnd,
    recoveryActions,
    randomValues: timing.type === "random_delay" ? [{ label: "Gewählte Zufallswartezeit", value: `${delay} Minuten` }] : [],
    humanVariables: [
      `Auslöser: ${ruleTitle}`,
      ...(condition.type && condition.type !== "none" ? [`Bedingung: ${describeCondition(condition, context)}`] : ["Bedingung: keine zusätzliche Bedingung"]),
      `Bedingung aktuell: ${conditionSatisfiedAtScrub ? "erfüllt" : "nicht erfüllt"}`,
      ...(conditionType === "controller_absent" ? [`Abwesenheitsfenster: ${conditionMinutes} Minuten`] : []),
      ...(controllerActionMinute !== null ? [`Simulierte Controller-Aktion: Minute ${controllerActionMinute}`, `Auswirkung: ${controllerActionBlocksNow ? "Regel blockiert" : controllerActionBlocks ? "würde die Regel blockieren" : "außerhalb des Fensters, Regel bleibt möglich"}`] : []),
      ...(timing.type === "fixed_delay" ? [`Feste Wartezeit: ${delay} Minuten`] : []),
      ...(timing.type === "random_delay" ? [`Zufallsfenster: ${numberValue(timing.minMinutes, 0)} bis ${numberValue(timing.maxMinutes, 0)} Minuten`, `Gezogener Wert: ${delay} Minuten`] : []),
      ...simulatedStateVariables,
      `Fälligkeit: ${dueMinute === null ? "keine Fälligkeit, weil die Bedingung blockiert" : controllerActionBlocksNow ? `durch simulierte Controller-Aktion blockiert, sonst Minute ${dueMinute}` : `Minute ${dueMinute}`}`,
      ...actionItems.map((item) => item.detail),
      `Echte Ausführung: keine Aktionen in der Simulation`
    ],
    timeline: [
      { minute: 0, title: "Auslöser eingetreten", status: scrubMinute >= 0 ? "erledigt" : "wartet" },
      ...(controllerActionMinute !== null ? [{ minute: controllerActionMinute, title: "Controller-Aktion in der Simulation", status: controllerActionHasHappened ? (controllerActionBlocks ? "blockiert Bedingung" : "außerhalb des Fensters") : "steht noch aus" }] : []),
      ...(condition.type && condition.type !== "none" ? [{ minute: conditionMinutes, title: describeCondition(condition, context), status: conditionEvaluation.passed && scrubMinute >= conditionMinutes && !controllerActionBlocksNow ? "erfüllt" : scrubMinute >= conditionMinutes || controllerActionBlocksNow ? "blockiert" : "wartet" }] : []),
      ...(delay && dueMinute !== null ? [{ minute: dueMinute, title: timing.type === "random_delay" ? `Zufällige Wartezeit endet nach ${delay} Minuten` : `Wartezeit endet nach ${delay} Minuten`, status: scrubMinute >= dueMinute ? "erledigt" : "wartet" }] : []),
      ...actionItems.map((item) => ({ ...item, status: blockedActions.length ? "blockiert" : actionsAreDue ? "fällig" : "wartet" })),
      ...(actions.some((action) => action.type === "camera_request_image" && numberValue(action.maxRetries, 0) > 0) ? [{ minute: failureMinute, title: "Falls ein Bild nicht ankommt: Wiederherstellung starten", status: scrubMinute >= failureMinute ? "bereit" : "wartet" }] : [])
    ],
    explanation: explainSimulationState({
      scrubMinute,
      conditionType: condition.type as string | undefined,
      conditionMinutes,
      delay,
      dueMinute: dueMinute ?? conditionMinutes,
      actionType: primaryAction.type as string | undefined,
      actionCount: actions.length,
      conditionBlocked: !conditionEvaluation.canBecomeTrue || controllerActionBlocksNow
    }),
    variables: {
      conditionMinutes,
      delayMinutes: delay,
      dueMinute,
      conditionPassed: conditionEvaluation.passed,
      conditionBlocked: !conditionEvaluation.canBecomeTrue || controllerActionBlocksNow,
      controllerActionMinute,
      controllerActionBlocks,
      controllerActionHasHappened,
      simulationOverrides: context.simulationOverrides || {},
      actions: actions.map((action) => ({
        type: action.type,
        timeoutSeconds: ["camera_request_image", "camera_health_check"].includes(String(action.type)) ? numberValue(action.timeoutSeconds, 20) : null,
        maxRetries: action.type === "camera_request_image" ? numberValue(action.maxRetries, 0) : null,
        bootDelaySeconds: action.type === "camera_request_image" ? numberValue(action.bootDelaySeconds, 20) : null
      })),
      sideEffects: false
    }
  };
}

function simulationStateVariables(condition: Record<string, unknown>, context: AutomationRuleContext) {
  const type = condition.type as AutomationConditionKey | undefined;
  if (type === "device_online" || type === "device_offline") {
    const device = typeof condition.deviceId === "string" ? context.devices?.find((item) => item.id === condition.deviceId) : null;
    if (!device) return [];
    return [`Simulierter Gerätezustand: ${device.name} ist ${labelAutomationValue("health", effectiveDeviceHealth(device, context))}`];
  }
  if (type === "capability_state") {
    const capability = typeof condition.capabilityId === "string" ? context.capabilities?.find((item) => item.id === condition.capabilityId) : null;
    if (!capability) return [];
    const title = `${capability.deviceName || "Gerät"} · ${capability.title || "Fähigkeit"}`;
    return [`Simulierter Fähigkeitszustand: ${title} ist ${labelAutomationValue("health", effectiveCapabilityState(capability, context))}`];
  }
  if (type === "last_image_younger_than") {
    const capability = typeof condition.capabilityId === "string" ? context.capabilities?.find((item) => item.id === condition.capabilityId) : null;
    if (!capability) return [];
    const title = `${capability.deviceName || "Gerät"} · ${capability.title || "Kamera"}`;
    const age = effectiveLastImageAgeSeconds(capability, context);
    return [`Simuliertes letztes Kamerabild: ${title} · ${age === null ? "kein Bild vorhanden" : `${age} Sekunden alt`}`];
  }
  if (type === "switch_state_for") {
    const capability = typeof condition.capabilityId === "string" ? context.capabilities?.find((item) => item.id === condition.capabilityId) : null;
    if (!capability) return [];
    const title = `${capability.deviceName || "Gerät"} · ${capability.title || "Schalter"}`;
    const state = effectiveCapabilityState(capability, context);
    const age = effectiveCapabilityStateAgeMinutes(capability, context);
    return [`Simulierter Schaltzustand: ${title} ist ${labelAutomationValue("health", state)} seit ${age} Minuten`];
  }
  return [];
}

function explainSimulationState(input: { scrubMinute: number; conditionType?: string; conditionMinutes: number; delay: number; dueMinute: number; actionType?: string; actionCount?: number; conditionBlocked?: boolean }) {
  if (input.conditionBlocked) {
    return "Die Regel ist ausgelöst, aber die Bedingung passt im simulierten Zustand nicht. Deshalb wird keine Aktion fällig.";
  }
  if (input.conditionType && input.conditionType !== "none" && input.scrubMinute < input.conditionMinutes) {
    return `Die Regel wartet noch auf die Bedingung. Bis Minute ${input.conditionMinutes} darf kein widersprechendes Ereignis eintreten.`;
  }
  if (input.scrubMinute < input.dueMinute) {
    return input.delay
      ? `Die Bedingung ist erfüllt. ${input.actionCount && input.actionCount > 1 ? "Die Aktionen warten" : "Die Aktion wartet"} noch bis Minute ${input.dueMinute}.`
      : `Die Regel ist ausgelöst, ${input.actionCount && input.actionCount > 1 ? "die Aktionen sind" : "die Aktion ist"} noch nicht fällig.`;
  }
  if (input.actionCount && input.actionCount > 1) return `Alle ${input.actionCount} Aktionen sind fällig. Die Simulation führt weiterhin nichts echt aus.`;
  if (input.actionType === "camera_request_image") return "Die Bildanforderung ist fällig. In der echten Ausführung würde jetzt ein geschützter Bildrequest erzeugt und an die Bridge übergeben.";
  if (input.actionType === "camera_health_check") return "Die Verbindungsprüfung ist fällig. In der echten Ausführung würde die Bridge die Kamera prüfen und den Zustand zurückmelden.";
  if (input.actionType === "session_finish") return "Die Session-Ende-Aktion ist fällig. In der echten Ausführung würde der Zustand entsprechend gesetzt.";
  return "Die Aktion ist fällig. Die Simulation führt weiterhin nichts echt aus.";
}

function simulationActionDetail(action: Record<string, unknown>, context: AutomationRuleContext, minute: number, index: number | null) {
  const prefix = index ? `Aktion ${index}` : "Aktion";
  const title = actionTitleWithTarget(action, context);
  const details: string[] = [`${prefix}: ${title}`, `fällig ab Minute ${minute}`];
  if (action.type === "camera_request_image") {
    details.push(`Timeout ${numberValue(action.timeoutSeconds, 20)} Sekunden`);
    details.push(`Wiederholungen ${numberValue(action.maxRetries, 0)}`);
    details.push(`Boot-Wartezeit ${numberValue(action.bootDelaySeconds, 20)} Sekunden`);
    if (action.recoveryCapabilityId) {
      details.push(`Wiederherstellung über ${capabilityTargetLabel({ type: "switch_toggle", capabilityId: action.recoveryCapabilityId }, context)}`);
    } else {
      details.push("keine automatische Strom-Wiederherstellung");
    }
  }
  if (action.type === "camera_health_check") {
    details.push(`Verbindungsprüfung mit ${numberValue(action.timeoutSeconds, 20)} Sekunden Timeout`);
  }
  if (action.type === "voice_speak") {
    const text = typeof action.text === "string" && action.text.trim() ? action.text.trim() : "kein Text hinterlegt";
    details.push(`Ansagetext: ${text}`);
  }
  if (action.type === "session_finish") {
    details.push("setzt die Session in der echten Ausführung auf beendet");
  }
  return details.join(" · ");
}

function effectiveDeviceHealth(device: AutomationDeviceReference | null | undefined, context: AutomationRuleContext) {
  if (!device) return "UNKNOWN";
  return context.simulationOverrides?.deviceHealth?.[device.id] || device.health || "UNKNOWN";
}

function effectiveCapabilityState(capability: AutomationCapabilityReference | null | undefined, context: AutomationRuleContext) {
  if (!capability) return "UNKNOWN";
  return context.simulationOverrides?.capabilityState?.[capability.id] || capability.state || "UNKNOWN";
}

function effectiveLastImageAgeSeconds(capability: AutomationCapabilityReference | null | undefined, context: AutomationRuleContext) {
  if (!capability) return null;
  const age = context.simulationOverrides?.lastImageAgeSeconds?.[capability.id];
  return Number.isFinite(age) ? Math.max(0, Math.round(Number(age))) : null;
}

function effectiveCapabilityStateAgeMinutes(capability: AutomationCapabilityReference | null | undefined, context: AutomationRuleContext) {
  if (!capability) return 0;
  const age = context.simulationOverrides?.capabilityStateAgeMinutes?.[capability.id];
  return Number.isFinite(age) ? Math.max(0, Math.round(Number(age))) : 0;
}

function evaluateSimulationCondition(condition: Record<string, unknown>, context: AutomationRuleContext = {}) {
  const type = condition.type as AutomationConditionKey | undefined;
  if (!type || type === "none") return { passed: true, canBecomeTrue: true, result: "Keine zusätzliche Bedingung" };
  if (type === "controller_absent") return { passed: true, canBecomeTrue: true, result: "Bedingung erfüllt, wenn bis zum Ablauf keine Controller-Aktion eintritt" };
  if (type === "device_online" || type === "device_offline") {
    const device = typeof condition.deviceId === "string" ? context.devices?.find((item) => item.id === condition.deviceId) : null;
    const expected = type === "device_online" ? "ONLINE" : "OFFLINE";
    const health = effectiveDeviceHealth(device, context);
    const passed = health === expected;
    return {
      passed,
      canBecomeTrue: passed,
      result: device ? `Simulierter Zustand: ${labelAutomationValue("health", health)}` : "Kein Gerät für die Simulation ausgewählt"
    };
  }
  if (type === "capability_state") {
    const capability = typeof condition.capabilityId === "string" ? context.capabilities?.find((item) => item.id === condition.capabilityId) : null;
    const expected = typeof condition.state === "string" ? condition.state : "";
    const state = effectiveCapabilityState(capability, context);
    const passed = Boolean(capability && expected && state === expected);
    return {
      passed,
      canBecomeTrue: passed,
      result: capability ? `Simulierter Zustand: ${labelAutomationValue("health", state)}` : "Keine Fähigkeit für die Simulation ausgewählt"
    };
  }
  if (type === "last_image_younger_than") {
    const capability = typeof condition.capabilityId === "string" ? context.capabilities?.find((item) => item.id === condition.capabilityId) : null;
    const maxAgeSeconds = Math.max(1, numberValue(condition.maxAgeSeconds ?? condition.seconds, 0));
    const ageSeconds = effectiveLastImageAgeSeconds(capability, context);
    const passed = Boolean(capability && ageSeconds !== null && ageSeconds <= maxAgeSeconds);
    return {
      passed,
      canBecomeTrue: passed,
      result: capability
        ? ageSeconds === null
          ? "Kein letztes Kamerabild in der Simulation vorhanden"
          : `Letztes Bild ist ${ageSeconds} Sekunden alt, erlaubt sind höchstens ${maxAgeSeconds} Sekunden`
        : "Keine Kamera für die Simulation ausgewählt"
    };
  }
  if (type === "switch_state_for") {
    const capability = typeof condition.capabilityId === "string" ? context.capabilities?.find((item) => item.id === condition.capabilityId) : null;
    const expected = typeof condition.state === "string" ? condition.state : "";
    const requiredMinutes = Math.max(1, numberValue(condition.minutes ?? condition.stateAgeMinutes, 0));
    const state = effectiveCapabilityState(capability, context);
    const ageMinutes = effectiveCapabilityStateAgeMinutes(capability, context);
    const passed = Boolean(capability && capability.kind === "Switch" && ["ON", "OFF"].includes(expected) && state === expected && ageMinutes >= requiredMinutes);
    return {
      passed,
      canBecomeTrue: passed,
      result: capability
        ? `Schalter ist ${labelAutomationValue("health", state)} seit ${ageMinutes} Minuten, benötigt sind ${requiredMinutes} Minuten`
        : "Kein Schalter für die Simulation ausgewählt"
    };
  }
  if (type === "quota_remaining") {
    const tracker = typeof condition.trackerTypeId === "string" ? context.trackers?.find((item) => item.id === condition.trackerTypeId) : null;
    return {
      passed: Boolean(tracker),
      canBecomeTrue: Boolean(tracker),
      result: tracker ? `${tracker.title} ist als Kontingent ausgewählt. Der konkrete Restwert wird in der echten Ausführung geprüft.` : "Kein Tracker für die Simulation ausgewählt"
    };
  }
  return { passed: false, canBecomeTrue: false, result: "Bedingung kann in dieser Simulation nicht ausgewertet werden" };
}

function describeTrigger(triggerType: string, triggerJson?: unknown, context: AutomationRuleContext = {}) {
  const base = triggerOptions.find((option) => option.key === triggerType)?.label || "Ein Ereignis tritt ein";
  const trigger = asObject(triggerJson);
  if (triggerNeedsDevice(triggerType as AutomationTriggerKey)) {
    const device = nameById(context.devices, trigger.deviceId, "das gewählte Gerät", (item) => item.name);
    return `${base}: ${device}`;
  }
  if (triggerNeedsCapability(triggerType as AutomationTriggerKey)) {
    const capability = nameById(context.capabilities, trigger.capabilityId, "die gewählte Fähigkeit", (item) => `${item.deviceName || "Gerät"} · ${item.title || "Fähigkeit"}`);
    return `${base}: ${capability}`;
  }
  return base;
}

function capabilityTargetLabel(action: Record<string, unknown>, context: AutomationRuleContext) {
  const capabilityId = typeof action.capabilityId === "string" ? action.capabilityId : "";
  const capability = capabilityId ? context.capabilities?.find((item) => item.id === capabilityId) : null;
  if (!capability) {
    if (action.type === "camera_request_image" || action.type === "camera_health_check") return "der gewählten Kamera";
    if (action.type === "switch_on" || action.type === "switch_off" || action.type === "switch_toggle") return "den gewählten Schalter";
    if (action.type === "voice_speak") return "die gewählte Sprachausgabe";
    return "dem gewählten Ziel";
  }
  const title = capability.title || "";
  const deviceName = capability.deviceName || "";
  const genericTitles = ["Bild anfordern", "Verbindung prüfen", "Strom schalten", "Ansage sprechen", "Text sprechen"];
  if (deviceName && (!title || genericTitles.includes(title))) return deviceName;
  if (deviceName && title && title !== deviceName) return `${deviceName} · ${title}`;
  return title || deviceName || "gewählte Fähigkeit";
}

function actionPhrase(action: Record<string, unknown>, context: AutomationRuleContext) {
  const target = capabilityTargetLabel(action, context);
  if (action.type === "camera_request_image") return `fordere ein Bild von ${target} an`;
  if (action.type === "camera_health_check") return `prüfe die Verbindung von ${target}`;
  if (action.type === "switch_on") return `schalte ${target} ein`;
  if (action.type === "switch_off") return `schalte ${target} aus`;
  if (action.type === "switch_toggle") return `schalte ${target} um`;
  if (action.type === "voice_speak") return `lasse ${target} den Text sprechen`;
  if (action.type === "session_finish") return "beende die Session";
  return "führe die gewählte Aktion aus";
}

function actionTitleWithTarget(action: Record<string, unknown>, context: AutomationRuleContext) {
  const phrase = actionPhrase(action, context);
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

function describeActions(actions: Record<string, unknown>[], context: AutomationRuleContext) {
  if (!actions.length) return "führe die gewählte Aktion aus";
  const labels = actions.map((action) => actionPhrase(action, context));
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} und danach ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} und danach ${labels[labels.length - 1]}`;
}

function nameById<T extends { id: string }>(items: T[] | undefined, id: unknown, fallback: string, label: (item: T) => string) {
  const item = typeof id === "string" ? items?.find((entry) => entry.id === id) : null;
  return item ? label(item) : fallback;
}

function describeCondition(condition: Record<string, unknown>, context: AutomationRuleContext = {}) {
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
  if (type === "last_image_younger_than") {
    const capability = nameById(context.capabilities, condition.capabilityId, "die gewählte Kamera", (item) => `${item.deviceName || "Gerät"} · ${item.title || "Kamera"}`);
    return `${capability} hat ein Bild jünger als ${numberValue(condition.maxAgeSeconds ?? condition.seconds, 300)} Sekunden`;
  }
  if (type === "switch_state_for") {
    const capability = nameById(context.capabilities, condition.capabilityId, "der gewählte Schalter", (item) => `${item.deviceName || "Gerät"} · ${item.title || "Schalter"}`);
    return `${capability} ist seit ${numberValue(condition.minutes ?? condition.stateAgeMinutes, 5)} Minuten ${labelAutomationValue("health", typeof condition.state === "string" ? condition.state : "")}`;
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
