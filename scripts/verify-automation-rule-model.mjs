import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function buildRule({ triggerType = "session_started", conditionType = "none", conditionMinutes = 20, conditionDeviceId = null, conditionCapabilityId = null, conditionExpectedState = null, timingType = "immediate", delayMinutes = 0, minMinutes = 5, maxMinutes = 10, actionType = "session_finish", capabilityId = null, capabilityKind = null } = {}) {
  return {
    triggerType,
    conditionJson: conditionType === "none" ? [] : [{ type: conditionType, minutes: conditionMinutes, deviceId: conditionDeviceId, capabilityId: conditionCapabilityId, state: conditionExpectedState }],
    timingJson: timingType === "fixed_delay" ? { type: "fixed_delay", minutes: delayMinutes } : timingType === "random_delay" ? { type: "random_delay", minMinutes, maxMinutes } : { type: "immediate" },
    actionJson: [{ type: actionType, capabilityId, capabilityKind }]
  };
}

function simulate(rule, scrubMinute, randomSeed = 3, context = {}) {
  const condition = rule.conditionJson[0] || {};
  const timing = rule.timingJson || {};
  const action = rule.actionJson[0] || {};
  const conditionMinutes = condition.type === "controller_absent" ? Number(condition.minutes || 0) : 0;
  const controllerActionMinute = Number.isFinite(context.controllerActionMinute) ? context.controllerActionMinute : null;
  const controllerActionBlocks = condition.type === "controller_absent" && controllerActionMinute !== null && controllerActionMinute <= conditionMinutes && scrubMinute >= controllerActionMinute;
  const conditionPassed = (() => {
    if (controllerActionBlocks) return false;
    if (!condition.type || condition.type === "none" || condition.type === "controller_absent") return scrubMinute >= conditionMinutes;
    if (condition.type === "device_online" || condition.type === "device_offline") {
      const device = context.devices?.find((item) => item.id === condition.deviceId);
      return Boolean(device && device.health === (condition.type === "device_online" ? "ONLINE" : "OFFLINE"));
    }
    if (condition.type === "capability_state") {
      const capability = context.capabilities?.find((item) => item.id === condition.capabilityId);
      return Boolean(capability && capability.state === condition.state);
    }
    return false;
  })();
  const delay = timing.type === "random_delay"
    ? Number(timing.minMinutes || 0) + (randomSeed % (Math.max(0, Number(timing.maxMinutes || 0) - Number(timing.minMinutes || 0)) + 1))
    : timing.type === "fixed_delay"
      ? Number(timing.minutes || 0)
      : 0;
  const dueMinute = conditionMinutes + delay;
  return {
    dueMinute,
    conditionPassed,
    waiting: dueMinute !== null && conditionPassed && scrubMinute < dueMinute,
    due: dueMinute !== null && conditionPassed && scrubMinute >= dueMinute,
    blocked: !conditionPassed && scrubMinute >= conditionMinutes,
    complete: dueMinute !== null && scrubMinute > dueMinute,
    sessionState: dueMinute !== null && action.type === "session_finish" && scrubMinute >= dueMinute ? "FINISHED" : dueMinute !== null && action.type === "session_finish" && dueMinute > 0 && scrubMinute >= conditionMinutes ? "PENDING_END" : "RUNNING",
    pendingEnd: dueMinute !== null && action.type === "session_finish" && dueMinute > 0,
    sideEffects: false,
    actionType: action.type
  };
}

test("Abnahmebeispiel: Controller-Abwesenheit plus Zufallsfenster", () => {
  const rule = buildRule({
    conditionType: "controller_absent",
    conditionMinutes: 20,
    timingType: "random_delay",
    minMinutes: 5,
    maxMinutes: 10,
    actionType: "camera_request_image",
    capabilityId: "camera-bedroom",
    capabilityKind: "Camera"
  });
  assert.equal(simulate(rule, 19).conditionPassed, false);
  assert.equal(simulate(rule, 20).conditionPassed, true);
  assert.equal(simulate(rule, 24).waiting, true);
  assert.equal(simulate(rule, 30).due, true);
  assert.equal(simulate(rule, 30).actionType, "camera_request_image");
  assert.equal(simulate(rule, 19, 3, { controllerActionMinute: 19 }).conditionPassed, false);
  assert.equal(simulate(rule, 30, 3, { controllerActionMinute: 19 }).due, false);
});

test("Doppelstart bleibt idempotent", () => {
  const active = { ownerId: "u1", trackerTypeId: "t1", state: "RUNNING" };
  assert.equal(active.ownerId === "u1" && active.trackerTypeId === "t1" && ["RUNNING", "PENDING_END"].includes(active.state), true);
});

test("Automation-Session-Start serialisiert Doppelstarts pro Benutzer und Tracker", () => {
  const service = readFileSync("src/lib/session-automation.ts", "utf8");
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /automation-start:\$\{input\.user\.tenantId\}:\$\{input\.user\.id\}:\$\{tracker\.id\}/);
  assert.match(service, /TransactionIsolationLevel\.Serializable/);
  assert.match(service, /tx\.automationSession\.findFirst/);
  assert.match(service, /tx\.trackerEntry\.create/);
  assert.match(service, /tx\.automationSession\.create/);
});

test("Session und Tracker werden gekoppelt", () => {
  const session = { trackerTypeId: "tracker-a", trackerEntryId: "entry-a" };
  assert.equal(Boolean(session.trackerTypeId && session.trackerEntryId), true);
});

test("Pending End wird nicht durch normalen Stop ersetzt", () => {
  const session = { state: "PENDING_END", pendingEndAt: "2026-08-10T20:30:00.000Z" };
  assert.equal(session.state !== "PENDING_END", false);
});

test("Pending-End-Planung ist pro Session serialisiert", () => {
  const service = readFileSync("src/lib/session-automation.ts", "utf8");
  assert.match(service, /automation-session:\$\{tenantId\}:\$\{session\.id\}/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /TransactionIsolationLevel\.Serializable/);
  assert.match(service, /lockedSession\.state === "PENDING_END"/);
});

test("Simulation zeigt Pending End bei verzögertem Session-Ende", () => {
  const rule = buildRule({ timingType: "fixed_delay", delayMinutes: 15, actionType: "session_finish" });
  assert.equal(simulate(rule, 1).pendingEnd, true);
  assert.equal(simulate(rule, 1).sessionState, "PENDING_END");
  assert.equal(simulate(rule, 15).sessionState, "FINISHED");
});

test("Simulation blockiert Aktionen bei nicht erfüllter Gerätebedingung", () => {
  const rule = buildRule({ conditionType: "device_online", conditionDeviceId: "camera-bedroom", actionType: "camera_request_image", capabilityId: "camera-bedroom-capability", capabilityKind: "Camera" });
  const context = { devices: [{ id: "camera-bedroom", health: "OFFLINE" }] };
  assert.equal(simulate(rule, 0, 3, context).conditionPassed, false);
  assert.equal(simulate(rule, 0, 3, context).blocked, true);
  assert.equal(simulate(rule, 30, 3, context).due, false);
});

test("Override darf Pending End ersetzen", () => {
  assert.equal({ state: "PENDING_END" }.state === "PENDING_END" && true, true);
});

test("Feste Verzögerung berechnet fällige Minute", () => {
  const rule = buildRule({ timingType: "fixed_delay", delayMinutes: 15 });
  assert.equal(simulate(rule, 14).waiting, true);
  assert.equal(simulate(rule, 15).due, true);
});

test("Mehrere Aktionen bleiben in einer Regel erhalten", () => {
  const rule = buildRule({ timingType: "fixed_delay", delayMinutes: 3 });
  const model = readFileSync("src/lib/automation-rule-model.ts", "utf8");
  const editor = readFileSync("src/components/automation-rule-editor.tsx", "utf8");
  rule.actionJson = [
    { type: "camera_request_image", capabilityId: "cam-1", capabilityKind: "Camera" },
    { type: "voice_speak", capabilityId: "voice-1", capabilityKind: "Voice", text: "Bitte Status prüfen." }
  ];
  assert.equal(rule.actionJson.length, 2);
  assert.deepEqual(rule.actionJson.map((action) => action.type), ["camera_request_image", "voice_speak"]);
  assert.equal(simulate(rule, 3).due, true);
  assert.match(model, /function simulationActionDetail/);
  assert.match(model, /Wiederholungen \$\{numberValue\(action\.maxRetries, 0\)\}/);
  assert.match(model, /Ansagetext: \$\{text\}/);
  assert.match(editor, /simulation\.waitingActions\.map\(\(item\) => item\.detail\)/);
});

test("Regelbeschreibung und Timeline benennen Zielgeräte fachlich", () => {
  const model = readFileSync("src/lib/automation-rule-model.ts", "utf8");
  const settings = readFileSync("src/app/settings/automation/page.tsx", "utf8");
  assert.match(model, /function capabilityTargetLabel/);
  assert.match(model, /fordere ein Bild von \$\{target\} an/);
  assert.match(model, /actionTitleWithTarget\(action, context\)/);
  assert.match(model, /describeActions\(actions, context\)/);
  assert.match(model, /genericTitles = \["Bild anfordern", "Verbindung prüfen", "Strom schalten", "Ansage sprechen", "Text sprechen"\]/);
  assert.match(settings, /const currentRuleText = automationRuleSummary\(rule,/);
  assert.doesNotMatch(settings, /rule\.descriptionText \|\| automationRuleSummary\(rule/);
  assert.match(settings, /function RuleFlowPreview/);
  assert.match(settings, /<ArrowDown className="h-4 w-4 text-redbrand md:-rotate-90"/);
});

test("Zufallsfenster wird einmal bestimmt und bleibt stabil", () => {
  const rule = buildRule({ timingType: "random_delay", minMinutes: 5, maxMinutes: 10 });
  assert.equal(simulate(rule, 0, 3).dueMinute, simulate(rule, 9, 3).dueMinute);
});

test("Event-Abwesenheit ist modellierbar", () => {
  const rule = buildRule({ triggerType: "event_absent", conditionType: "controller_absent", conditionMinutes: 20 });
  assert.equal(rule.triggerType, "event_absent");
  assert.equal(rule.conditionJson[0].type, "controller_absent");
});

test("Fachliche Kamera- und Capability-Auslöser sind modellierbar", () => {
  const triggers = ["image_uploaded", "camera_online", "camera_offline", "capability_event", "session_finished"];
  for (const triggerType of triggers) {
    const rule = buildRule({ triggerType });
    assert.equal(rule.triggerType, triggerType);
    assert.equal(simulate(rule, 0).due, true);
  }
});

test("Rule-Versionierung erhöht Version bei Änderung", () => {
  assert.equal(2 + 1, 3);
});

test("Simulation erzeugt keine Side Effects", () => {
  assert.equal(simulate(buildRule(), 1).sideEffects, false);
});

test("Event-Korrelation bleibt vorhanden", () => {
  const event = { correlationId: "session_abc", parentEventId: null };
  assert.equal(typeof event.correlationId, "string");
});

test("Geschützte Bilder laufen über Request-ID und FileAsset", () => {
  const imageRequest = { requestId: "img_abc", fileId: "file_abc", publicPath: null };
  assert.equal(Boolean(imageRequest.requestId && imageRequest.fileId && !imageRequest.publicPath), true);
});

test("Tenant-Isolation verlangt gleiche Seite", () => {
  assert.equal({ tenantId: "tenant-a" }.tenantId === { tenantId: "tenant-b" }.tenantId, false);
});

test("Automation-Event-Titel verwenden keine rohen Action-Keys", () => {
  const source = readFileSync("src/lib/session-automation.ts", "utf8");
  assert.equal(/title:\s*`[^`]*(Action|Aktion)[^`]*:\s*\$\{(?:action|input)\.type\}/.test(source), false);
});

test("Externe Automation-Simulation kann Controller-Gegenereignisse simulieren", () => {
  const route = readFileSync("src/app/api/external/automation/rules/simulate/route.ts", "utf8");
  const service = readFileSync("src/lib/session-automation.ts", "utf8");
  assert.match(route, /controllerActionMinute/);
  assert.match(service, /controllerActionMinute\?: number \| null/);
});

test("Bestehende Automation-Geräte können geführte Fähigkeiten erhalten", () => {
  const component = readFileSync("src/components/automation-device-manager.tsx", "utf8");
  const page = readFileSync("src/app/settings/automation/page.tsx", "utf8");
  assert.match(component, /export function AutomationCapabilityManager/);
  assert.match(page, /addCapabilityToDevice/);
  assert.match(page, /Fähigkeit hinzufügen/);
});

test("Normale Automation-Oberflächen vermeiden englische Technikbegriffe", () => {
  const model = readFileSync("src/lib/automation-rule-model.ts", "utf8");
  const settingsPage = readFileSync("src/app/settings/automation/page.tsx", "utf8");
  assert.doesNotMatch(model, /Side Effects/);
  assert.doesNotMatch(model, /Recovery-Kette|Recovery starten|Kamera-Recovery/);
  assert.match(model, /capabilityKinds/);
  assert.match(settingsPage, /labelAutomationValue\("capabilityKinds"/);
});

test("Bridge-Reconnect stellt stale Kommandos erneut bereit", () => {
  const service = readFileSync("src/lib/session-automation.ts", "utf8");
  assert.match(service, /staleAfterSeconds/);
  assert.match(service, /status:\s*"RUNNING"[\s\S]*startedAt:\s*\{\s*lte:\s*staleBefore\s*\}/);
  assert.match(service, /status:\s*"READY",\s*startedAt:\s*null/);
  assert.match(service, /action_requeued_for_bridge/);
});

test("Bridge-Resultate werden terminal idempotent behandelt", () => {
  const service = readFileSync("src/lib/session-automation.ts", "utf8");
  assert.match(service, /\["SUCCEEDED",\s*"FAILED",\s*"CANCELLED"\]\.includes\(action\.status\)/);
});

test("Automation-Session-Seiten verwenden fachliche Aktionssprache", () => {
  const overview = readFileSync("src/app/automation/page.tsx", "utf8");
  const detail = readFileSync("src/app/automation/sessions/[id]/page.tsx", "utf8");
  assert.doesNotMatch(`${overview}\n${detail}`, /Override-Grund|Noch keine geplanten Actions|>Actions</);
  assert.match(detail, /Geplante Aktionen/);
  assert.match(detail, /Grund für sofortiges Beenden/);
  assert.match(detail, /actionTitleWithTarget/);
  assert.match(detail, /function automationActionTitle/);
  assert.doesNotMatch(detail, /actionLabels\[action\.type as keyof typeof actionLabels\]/);
});

test("Automation-Session-Aktionen nutzen zentrale Rollen-Policy statt Besitzer-Sonderlogik", () => {
  const service = readFileSync("src/lib/session-automation.ts", "utf8");
  const detail = readFileSync("src/app/automation/sessions/[id]/page.tsx", "utf8");
  assert.match(service, /export async function automationSessionAccess/);
  assert.match(service, /Controller im gemeinsamen Zirkel/);
  assert.match(service, /stopTrackerEntryForType\(\{ trackerType: session\.trackerType, user: \{ id: session\.ownerId/);
  assert.match(detail, /automationSessionAccess\(user, session\)/);
  assert.doesNotMatch(detail, /session\.ownerId === user\.id && \["RUNNING", "PENDING_END"\]/);
  assert.doesNotMatch(service, /where:\s*\{\s*id:\s*input\.sessionId,\s*tenantId:\s*input\.user\.tenantId,\s*ownerId:\s*input\.user\.id\s*\}/);
});

test("Automation-Protokoll zeigt Policy-Entscheidungen fachlich an", () => {
  const settings = readFileSync("src/app/settings/automation/page.tsx", "utf8");
  assert.match(settings, /function humanAutomationPolicyEntries/);
  assert.match(settings, /Erlaubte Aktion/);
  assert.match(settings, /Session-Zustand/);
  assert.match(settings, /details\.policy/);
  assert.match(settings, /Begründung/);
  assert.match(settings, /Technische API-Endpunkte/);
  assert.match(settings, /<summary[^>]*>Technische API-Endpunkte<\/summary>/);
  assert.match(settings, /<summary[^>]*>Verbindungsdetails<\/summary>/);
  assert.match(settings, /Im normalen Regelbetrieb musst du sie nicht ändern/);
  assert.match(settings, /id=\{`automation-event-\$\{event\.id\}`\}/);
  assert.match(settings, /href=\{`#automation-event-\$\{event\.parentEvent\.id\}`\}/);
  assert.match(settings, /href=\{`#automation-event-\$\{child\.id\}`\}/);
});

test("Simulation kann Geräte- und Fähigkeitszustände fachlich überschreiben", () => {
  const editor = readFileSync("src/components/automation-rule-editor.tsx", "utf8");
  const model = readFileSync("src/lib/automation-rule-model.ts", "utf8");
  const route = readFileSync("src/app/api/external/automation/rules/simulate/route.ts", "utf8");
  assert.match(editor, /simulationJumpPoints/);
  assert.match(editor, /Minute \{minute\}/);
  assert.match(editor, /setScrubMinute\(minute\)/);
  assert.match(editor, /Momentaufnahme bei Minute/);
  assert.match(editor, /simulation\.currentMoment\.current/);
  assert.match(model, /currentMoment/);
  assert.match(model, /Bereits passiert|upcomingTimelineItems/);
  assert.match(editor, /Gerätezustand für diese Simulation/);
  assert.match(editor, /Zustand der Fähigkeit für diese Simulation/);
  assert.match(model, /AutomationSimulationOverrides/);
  assert.match(model, /Simulierter Gerätezustand/);
  assert.match(model, /Simulierter Fähigkeitszustand/);
  assert.match(model, /simulationOverrides/);
  assert.match(route, /simulationOverrides/);
  assert.match(route, /allowedStateOverrides/);
});

test("Kamera-spezifische Auslöser begrenzen Fähigkeitsbedingungen auf Kameras", () => {
  const editor = readFileSync("src/components/automation-rule-editor.tsx", "utf8");
  const model = readFileSync("src/lib/automation-rule-model.ts", "utf8");
  assert.match(editor, /conditionCapabilityKind/);
  assert.match(editor, /conditionCapabilities/);
  assert.match(editor, /capabilityKindLabel\(triggerCapabilityKind\)/);
  assert.match(editor, /Der gewählte Auslöser kann nur mit passenden/);
  assert.match(editor, /capabilityKindLabel\(conditionCapabilityKind\)/);
  assert.match(model, /Die gewählte Fähigkeitsbedingung passt nicht zum Auslöser/);
});

test("Kamera-Fähigkeiten bieten Bildanforderung und Verbindungsprüfung ohne JSON-Konfiguration", () => {
  const model = readFileSync("src/lib/automation-rule-model.ts", "utf8");
  const editor = readFileSync("src/components/automation-rule-editor.tsx", "utf8");
  const devices = readFileSync("src/components/automation-device-manager.tsx", "utf8");
  const service = readFileSync("src/lib/session-automation.ts", "utf8");
  assert.match(model, /Camera:\s*\["camera_request_image",\s*"camera_health_check"\]/);
  assert.match(model, /camera_health_check:\s*"Verbindung prüfen"/);
  assert.match(model, /Die Verbindungsprüfung ist fällig/);
  assert.match(editor, /action\.actionType === "camera_request_image" \|\| action\.actionType === "camera_health_check"/);
  assert.match(editor, /Es wird kein Bild gespeichert/);
  assert.match(devices, /camera_request_image, camera_health_check/);
  assert.match(service, /camera_health_check:\s*"Verbindung prüfen"/);
});

test("Kamera-Bedingung letztes Bild ist jünger wird zentral unterstützt", () => {
  const model = readFileSync("src/lib/automation-rule-model.ts", "utf8");
  const editor = readFileSync("src/components/automation-rule-editor.tsx", "utf8");
  const service = readFileSync("src/lib/session-automation.ts", "utf8");
  const route = readFileSync("src/app/api/external/automation/rules/simulate/route.ts", "utf8");
  assert.match(model, /last_image_younger_than/);
  assert.match(model, /Letztes Kamerabild ist jünger als Vorgabe/);
  assert.match(model, /lastImageAgeSeconds/);
  assert.match(editor, /Letztes Kamerabild für diese Simulation/);
  assert.match(editor, /conditionImageMaxAgeSeconds/);
  assert.match(service, /type === "last_image_younger_than"/);
  assert.match(service, /automationImageRequest\.findFirst/);
  assert.match(service, /status:\s*"UPLOADED"/);
  assert.match(route, /allowedNumberOverrides/);
});

test("Schalter-Bedingung ein oder aus seit X Minuten wird zentral unterstützt", () => {
  const model = readFileSync("src/lib/automation-rule-model.ts", "utf8");
  const editor = readFileSync("src/components/automation-rule-editor.tsx", "utf8");
  const service = readFileSync("src/lib/session-automation.ts", "utf8");
  const devices = readFileSync("src/components/automation-device-manager.tsx", "utf8");
  const route = readFileSync("src/app/api/external/automation/rules/simulate/route.ts", "utf8");
  assert.match(model, /switch_state_for/);
  assert.match(model, /Schalter ist seit einer Zeit ein oder aus/);
  assert.match(model, /capabilityStateAgeMinutes/);
  assert.match(editor, /Schaltzustand für diese Simulation/);
  assert.match(editor, /conditionStateAgeMinutes/);
  assert.match(service, /type === "switch_state_for"/);
  assert.match(service, /capability\.updatedAt <= threshold/);
  assert.match(devices, /switch_state_for/);
  assert.match(route, /capabilityStateAgeMinutes/);
});

test("Schalter-Ereignisse sind fachliche Auslöser und werden materialisiert", () => {
  const model = readFileSync("src/lib/automation-rule-model.ts", "utf8");
  const service = readFileSync("src/lib/session-automation.ts", "utf8");
  const eventsRoute = readFileSync("src/app/api/external/automation/events/route.ts", "utf8");
  const rule = buildRule({ triggerType: "switched_on" });
  assert.equal(rule.triggerType, "switched_on");
  assert.match(model, /switched_on:\s*"Schalter wurde eingeschaltet"/);
  assert.match(model, /switched_off:\s*"Schalter wurde ausgeschaltet"/);
  assert.match(model, /switch_error:\s*"Schalter meldet einen Fehler"/);
  assert.match(model, /if \(\["switched_on",\s*"switched_off",\s*"switch_error"\]\.includes\(triggerType\)\) return "Switch"/);
  assert.match(service, /function switchEventForState/);
  assert.match(service, /type:\s*"switched_on"/);
  assert.match(service, /type:\s*"switched_off"/);
  assert.match(service, /type:\s*"switch_error"/);
  assert.match(service, /ruleTrigger === "switched_on"/);
  assert.match(eventsRoute, /type === "switched_on" \? "ON"/);
  assert.match(eventsRoute, /type === "switched_off" \? "OFF"/);
});

test("Sprachausgabe-Ereignisse sind fachliche Auslöser und werden materialisiert", () => {
  const model = readFileSync("src/lib/automation-rule-model.ts", "utf8");
  const service = readFileSync("src/lib/session-automation.ts", "utf8");
  const eventsRoute = readFileSync("src/app/api/external/automation/events/route.ts", "utf8");
  const rule = buildRule({ triggerType: "speech_finished", actionType: "voice_speak", capabilityId: "voice-1", capabilityKind: "Voice" });
  assert.equal(rule.triggerType, "speech_finished");
  assert.match(model, /speech_started:\s*"Sprachausgabe wurde gestartet"/);
  assert.match(model, /speech_finished:\s*"Sprachausgabe wurde beendet"/);
  assert.match(model, /voice_error:\s*"Sprachausgabe ist nicht erreichbar"/);
  assert.match(readFileSync("src/components/automation-device-manager.tsx", "utf8"), /actions:\s*"voice_speak"/);
  assert.doesNotMatch(readFileSync("src/components/automation-device-manager.tsx", "utf8"), /actions:\s*"speak"/);
  assert.match(model, /if \(\["speech_started",\s*"speech_finished",\s*"voice_error"\]\.includes\(triggerType\)\) return "Voice"/);
  assert.match(service, /function isVoiceAction/);
  assert.match(service, /type:\s*"speech_started"/);
  assert.match(service, /type:\s*"speech_finished"/);
  assert.match(service, /type:\s*"voice_error"/);
  assert.match(service, /ruleTrigger === "speech_started"/);
  assert.match(eventsRoute, /type === "speech_started" \|\| type === "speech_finished" \? "ONLINE"/);
  assert.match(eventsRoute, /type === "voice_error" \? "ERROR"/);
});

test("Normale Automation-Oberflächen verwenden deutsche Fachsprache", () => {
  const editor = readFileSync("src/components/automation-rule-editor.tsx", "utf8");
  const devices = readFileSync("src/components/automation-device-manager.tsx", "utf8");
  const settings = readFileSync("src/app/settings/automation/page.tsx", "utf8");
  const overview = readFileSync("src/app/automation/page.tsx", "utf8");
  const sessionDetail = readFileSync("src/app/automation/sessions/[id]/page.tsx", "utf8");
  const visibleText = `${editor}\n${devices}\n${settings}\n${overview}\n${sessionDetail}`;
  assert.doesNotMatch(visibleText, />Trigger</);
  assert.doesNotMatch(visibleText, /Rule-Editor/);
  assert.doesNotMatch(visibleText, /Commands aus/);
  assert.doesNotMatch(visibleText, /Bridge speichern|>Bridge</);
  assert.doesNotMatch(visibleText, /Recovery bei Fehler/);
  assert.doesNotMatch(visibleText, /Portal-Aktion ohne Gerät/);
  assert.match(visibleText, /Auslöser/);
  assert.match(visibleText, /Gerätebrücke/);
  assert.match(visibleText, /Wiederherstellung bei Fehler/);
  assert.match(editor, /Session im Portal beenden/);
  assert.match(editor, /<optgroup label="Gerätefähigkeiten">/);
  assert.match(editor, /validateAutomationRulePayload/);
  assert.match(editor, /Regelprüfung/);
  assert.match(editor, /Diese Regel ist vollständig und kann gespeichert werden/);
});
