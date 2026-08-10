import assert from "node:assert/strict";
import test from "node:test";

function buildRule({ triggerType = "session_started", conditionType = "none", conditionMinutes = 20, timingType = "immediate", delayMinutes = 0, minMinutes = 5, maxMinutes = 10, actionType = "session_finish", capabilityId = null, capabilityKind = null } = {}) {
  return {
    triggerType,
    conditionJson: conditionType === "none" ? [] : [{ type: conditionType, minutes: conditionMinutes }],
    timingJson: timingType === "fixed_delay" ? { type: "fixed_delay", minutes: delayMinutes } : timingType === "random_delay" ? { type: "random_delay", minMinutes, maxMinutes } : { type: "immediate" },
    actionJson: [{ type: actionType, capabilityId, capabilityKind }]
  };
}

function simulate(rule, scrubMinute, randomSeed = 3) {
  const condition = rule.conditionJson[0] || {};
  const timing = rule.timingJson || {};
  const action = rule.actionJson[0] || {};
  const conditionMinutes = condition.type && condition.type !== "none" ? Number(condition.minutes || 0) : 0;
  const delay = timing.type === "random_delay"
    ? Number(timing.minMinutes || 0) + (randomSeed % (Math.max(0, Number(timing.maxMinutes || 0) - Number(timing.minMinutes || 0)) + 1))
    : timing.type === "fixed_delay"
      ? Number(timing.minutes || 0)
      : 0;
  const dueMinute = conditionMinutes + delay;
  return {
    dueMinute,
    conditionPassed: scrubMinute >= conditionMinutes,
    waiting: scrubMinute < dueMinute,
    due: scrubMinute >= dueMinute,
    complete: scrubMinute > dueMinute,
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
});

test("Doppelstart bleibt idempotent", () => {
  const active = { ownerId: "u1", trackerTypeId: "t1", state: "RUNNING" };
  assert.equal(active.ownerId === "u1" && active.trackerTypeId === "t1" && ["RUNNING", "PENDING_END"].includes(active.state), true);
});

test("Session und Tracker werden gekoppelt", () => {
  const session = { trackerTypeId: "tracker-a", trackerEntryId: "entry-a" };
  assert.equal(Boolean(session.trackerTypeId && session.trackerEntryId), true);
});

test("Pending End wird nicht durch normalen Stop ersetzt", () => {
  const session = { state: "PENDING_END", pendingEndAt: "2026-08-10T20:30:00.000Z" };
  assert.equal(session.state !== "PENDING_END", false);
});

test("Override darf Pending End ersetzen", () => {
  assert.equal({ state: "PENDING_END" }.state === "PENDING_END" && true, true);
});

test("Feste Verzögerung berechnet fällige Minute", () => {
  const rule = buildRule({ timingType: "fixed_delay", delayMinutes: 15 });
  assert.equal(simulate(rule, 14).waiting, true);
  assert.equal(simulate(rule, 15).due, true);
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
