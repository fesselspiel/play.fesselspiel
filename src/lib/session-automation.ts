import type { Prisma } from "@prisma/client";
import { logAction } from "@/lib/audit";
import { automationRuleSummary, simulateAutomationRuleTimeline } from "@/lib/automation-rule-model";
import { minutesBetween } from "@/lib/dates";
import { saveFileBuffer } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { findTrackerTypeByIdForUser, findTrackerTypeByTextForUser, startTrackerEntryForType, stopTrackerEntryForType, uniqueTrackerSlug } from "@/lib/tracker-core";
import { quotaSummaryText, trackerQuotaStatusForUser } from "@/lib/tracker-quotas";

export const automationStates = ["IDLE", "RUNNING", "PENDING_END", "FINISHED", "CANCELLED"] as const;
export const automationActionStatuses = ["CREATED", "WAITING", "READY", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"] as const;
export const automationSources = ["WEB", "API", "TELEGRAM", "APP", "SCHEDULED_RULE", "IOBROKER", "SYSTEM"] as const;
export const automationRoles = ["OWNER", "CONTROLLER", "SYSTEM"] as const;

type AutomationState = typeof automationStates[number];
type AutomationActionStatus = typeof automationActionStatuses[number];
type AutomationSource = typeof automationSources[number];
type AutomationRole = typeof automationRoles[number];

type AutomationUser = {
  id: string;
  tenantId?: string | null;
  role?: string;
};

function jsonObject(value: unknown): Prisma.InputJsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.InputJsonObject : {};
}

function jsonArray(value: unknown): Prisma.InputJsonArray {
  return Array.isArray(value) ? value as Prisma.InputJsonArray : [];
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstArrayRecord(value: unknown): Record<string, unknown> {
  return Array.isArray(value) && value[0] && typeof value[0] === "object" && !Array.isArray(value[0]) ? value[0] as Record<string, unknown> : {};
}

function humanActionTitle(type: string) {
  const labels: Record<string, string> = {
    camera_request_image: "Bild anfordern",
    switch_on: "Einschalten",
    switch_off: "Ausschalten",
    switch_toggle: "Umschalten",
    voice_speak: "Text sprechen",
    session_finish: "Session beenden"
  };
  return labels[type] || "Aktion ausführen";
}

function numberFromPayload(payload: Record<string, unknown>, key: string, fallback: number) {
  const value = Number(payload[key]);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
}

function concreteDelayMinutes(timing: unknown) {
  const data = asRecord(timing);
  const type = clean(data.type || data.mode) || "immediate";
  if (type === "fixed_delay") return Math.max(0, Number(data.minutes || data.delayMinutes || 0));
  if (type === "random_delay") {
    const min = Math.max(0, Number(data.minMinutes || 0));
    const max = Math.max(min, Number(data.maxMinutes || min));
    return min + Math.floor(Math.random() * (max - min + 1));
  }
  return 0;
}

function conditionDelayMinutes(conditions: unknown) {
  const condition = firstArrayRecord(conditions);
  const type = clean(condition.type);
  if (!type || type === "none") return 0;
  if (type === "controller_absent") return Math.max(0, Number(condition.minutes || 0));
  return 0;
}

export function correlationId(prefix = "auto") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function automationSlugBase(title: string, date = new Date()) {
  const base = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "session";
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}-${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}`;
  return `${base}-${stamp}`;
}

export async function uniqueAutomationSlug(tenantId: string, title: string, date = new Date(), currentId?: string) {
  const base = automationSlugBase(title, date);
  let slug = base;
  let counter = 2;
  while (true) {
    const existing = await prisma.automationSession.findFirst({ where: { tenantId, slug }, select: { id: true } });
    if (!existing || existing.id === currentId) return slug;
    slug = `${base}-${counter++}`;
  }
}

export async function recordAutomationEvent(input: {
  tenantId: string;
  type: string;
  title: string;
  source?: AutomationSource | string;
  role?: AutomationRole | string;
  actorId?: string | null;
  sessionId?: string | null;
  ruleId?: string | null;
  ruleVersionId?: string | null;
  actionId?: string | null;
  deviceId?: string | null;
  capabilityId?: string | null;
  parentEventId?: string | null;
  contextId?: string | null;
  details?: unknown;
  raw?: unknown;
  correlationId?: string;
  skipRuleProcessing?: boolean;
}) {
  const event = await prisma.automationEvent.create({
    data: {
      tenantId: input.tenantId,
      type: input.type,
      title: input.title,
      source: input.source || "SYSTEM",
      role: input.role || "SYSTEM",
      actorId: input.actorId || null,
      sessionId: input.sessionId || null,
      ruleId: input.ruleId || null,
      ruleVersionId: input.ruleVersionId || null,
      actionId: input.actionId || null,
      deviceId: input.deviceId || null,
      capabilityId: input.capabilityId || null,
      parentEventId: input.parentEventId || null,
      contextId: input.contextId || null,
      detailsJson: jsonObject(input.details),
      rawJson: jsonObject(input.raw),
      correlationId: input.correlationId || correlationId("evt")
    }
  });
  await logAction({
    actorId: input.actorId || undefined,
    action: `automation_${input.type}`,
    entityType: "automationEvent",
    entityId: event.id,
    title: input.title,
    href: input.sessionId ? `/automation/sessions/${input.sessionId}` : "/automation",
    details: { automationEventId: event.id, sessionId: input.sessionId || null, actionId: input.actionId || null, ...jsonObject(input.details) }
  });
  if (!input.skipRuleProcessing) {
    await processAutomationRulesForEvent(event).catch(async (error) => {
      const message = error instanceof Error ? error.message : "Unbekannter Fehler";
      await prisma.automationEvent.create({
        data: {
          tenantId: input.tenantId,
          type: "rule_processing_failed",
          title: "Regelverarbeitung fehlgeschlagen",
          source: "SYSTEM",
          role: "SYSTEM",
          detailsJson: { error: message, sourceEventId: event.id },
          rawJson: {},
          correlationId: event.correlationId,
          parentEventId: event.id
        }
      });
    });
  }
  return event;
}

export async function createAutomationContext(input: {
  tenantId: string;
  sessionId?: string | null;
  actorId?: string | null;
  source?: string;
  role?: string;
  ruleId?: string | null;
  ruleVersionId?: string | null;
  parentContextId?: string | null;
  variables?: unknown;
  conditions?: unknown;
  policy?: unknown;
  timing?: unknown;
  correlationId: string;
}) {
  return prisma.automationExecutionContext.create({
    data: {
      tenantId: input.tenantId,
      sessionId: input.sessionId || null,
      actorId: input.actorId || null,
      source: input.source || "SYSTEM",
      role: input.role || "SYSTEM",
      ruleId: input.ruleId || null,
      ruleVersionId: input.ruleVersionId || null,
      parentContextId: input.parentContextId || null,
      variablesJson: jsonObject(input.variables),
      conditionsJson: jsonArray(input.conditions),
      policyJson: jsonObject(input.policy),
      timingJson: jsonObject(input.timing),
      correlationId: input.correlationId
    }
  });
}

export async function currentAutomationSession(user: AutomationUser, trackerTypeId?: string | null) {
  if (!user.tenantId) return null;
  return prisma.automationSession.findFirst({
    where: {
      tenantId: user.tenantId,
      ownerId: user.id,
      state: { in: ["RUNNING", "PENDING_END"] },
      ...(trackerTypeId ? { trackerTypeId } : {})
    },
    include: {
      trackerType: true,
      trackerEntry: true,
      actions: { orderBy: { createdAt: "desc" }, take: 20 },
      events: { orderBy: { createdAt: "desc" }, take: 30 },
      imageRequests: { include: { file: true }, orderBy: { requestedAt: "desc" } }
    },
    orderBy: { startedAt: "desc" }
  });
}

export async function startAutomationSession(input: {
  user: AutomationUser;
  trackerTypeId?: string | null;
  trackerKeyOrTitle?: string | null;
  title?: string | null;
  notes?: string | null;
  source?: AutomationSource | string;
  role?: AutomationRole | string;
  idempotencyKey?: string | null;
  metadata?: unknown;
}) {
  if (!input.user.tenantId) throw new Error("tenant_required");
  const tracker = input.trackerTypeId
    ? await findTrackerTypeByIdForUser(input.trackerTypeId, input.user)
    : await findTrackerTypeByTextForUser(input.trackerKeyOrTitle || "", input.user);
  if (!tracker) throw new Error("tracker_not_found");
  const existing = await currentAutomationSession(input.user, tracker.id);
  if (existing) {
    await recordAutomationEvent({
      tenantId: input.user.tenantId,
      sessionId: existing.id,
      actorId: input.user.id,
      type: "session_start_ignored",
      title: `${tracker.title} läuft bereits`,
      source: input.source || "SYSTEM",
      role: input.role || "OWNER",
      details: { existingSessionId: existing.id }
    });
    return { session: existing, created: false };
  }
  const startTime = new Date();
  const corr = input.idempotencyKey || correlationId("session");
  const trackerEntry = await startTrackerEntryForType({
    trackerType: tracker,
    user: input.user,
    startTime,
    notes: input.notes || "Automatisierte Session gestartet"
  });
  const title = input.title || tracker.title;
  const session = await prisma.automationSession.create({
    data: {
      tenantId: input.user.tenantId,
      ownerId: input.user.id,
      trackerTypeId: tracker.id,
      trackerEntryId: trackerEntry.id,
      slug: await uniqueAutomationSlug(input.user.tenantId, title, startTime),
      title,
      state: "RUNNING",
      source: input.source || "SYSTEM",
      role: input.role || "OWNER",
      correlationId: corr,
      startedAt: startTime,
      notes: input.notes || null,
      metadataJson: jsonObject(input.metadata)
    },
    include: { trackerType: true, trackerEntry: true }
  });
  const context = await createAutomationContext({
    tenantId: input.user.tenantId,
    sessionId: session.id,
    actorId: input.user.id,
    source: input.source || "SYSTEM",
    role: input.role || "OWNER",
    variables: { trackerTypeId: tracker.id, trackerEntryId: trackerEntry.id },
    policy: { decision: "allow", reason: "owner_start" },
    correlationId: corr
  });
  await recordAutomationEvent({
    tenantId: input.user.tenantId,
    sessionId: session.id,
    actorId: input.user.id,
    contextId: context.id,
    type: "session_started",
    title: `${tracker.title} gestartet`,
    source: input.source || "SYSTEM",
    role: input.role || "OWNER",
    details: { trackerTypeId: tracker.id, trackerEntryId: trackerEntry.id },
    correlationId: corr
  });
  return { session, created: true };
}

function dueAtFromTiming(timing: unknown, now = new Date()) {
  const minutes = concreteDelayMinutes(timing);
  return new Date(now.getTime() + minutes * 60_000);
}

export async function requestAutomationEnd(input: {
  user: AutomationUser;
  sessionId?: string | null;
  trackerTypeId?: string | null;
  timing?: unknown;
  source?: AutomationSource | string;
  role?: AutomationRole | string;
  override?: boolean;
  reason?: string | null;
}) {
  if (!input.user.tenantId) throw new Error("tenant_required");
  const session = input.sessionId
    ? await prisma.automationSession.findFirst({ where: { id: input.sessionId, tenantId: input.user.tenantId, ownerId: input.user.id }, include: { trackerType: true } })
    : await currentAutomationSession(input.user, input.trackerTypeId || undefined);
  if (!session) throw new Error("session_not_found");
  if (session.state === "PENDING_END" && !input.override) {
    await recordAutomationEvent({
      tenantId: input.user.tenantId,
      sessionId: session.id,
      actorId: input.user.id,
      type: "session_end_kept",
      title: "Bestehendes Endfenster bleibt unverändert",
      source: input.source || "SYSTEM",
      role: input.role || "OWNER",
      details: { pendingEndAt: session.pendingEndAt, reason: input.reason || null },
      correlationId: session.correlationId
    });
    return { session, action: null, changed: false };
  }
  const now = new Date();
  const dueAt = dueAtFromTiming(input.timing, now);
  const delayMinutes = Math.max(0, Math.round((dueAt.getTime() - now.getTime()) / 60_000));
  const immediate = dueAt.getTime() <= now.getTime() + 1000;
  if (immediate) {
    const finished = await finishAutomationSession({ user: input.user, sessionId: session.id, source: input.source, role: input.role, reason: input.reason });
    return { session: finished, action: null, changed: true };
  }
  const action = await prisma.automationAction.create({
    data: {
      tenantId: input.user.tenantId,
      sessionId: session.id,
      actorId: input.user.id,
      type: "session_finish",
      source: input.source || "SYSTEM",
      role: input.role || "OWNER",
      status: "WAITING",
      timingJson: jsonObject(input.timing),
      payloadJson: { reason: input.reason || null },
      dueAt,
      correlationId: session.correlationId
    }
  });
  const updated = await prisma.automationSession.update({
    where: { id: session.id },
    data: {
      state: "PENDING_END",
      pendingEndAt: dueAt,
      stateJson: {
        pendingEndRequestedAt: now.toISOString(),
        pendingEndRequestedBy: input.user.id,
        pendingEndTiming: { ...jsonObject(input.timing), resolvedDelayMinutes: delayMinutes },
        pendingEndDueAt: dueAt.toISOString(),
        pendingEndReason: input.reason || null
      }
    }
  });
  await recordAutomationEvent({
    tenantId: input.user.tenantId,
    sessionId: session.id,
    actionId: action.id,
    actorId: input.user.id,
    type: "session_pending_end",
    title: "Session-Ende geplant",
    source: input.source || "SYSTEM",
    role: input.role || "OWNER",
    details: { dueAt, reason: input.reason || null },
    correlationId: session.correlationId
  });
  return { session: updated, action, changed: true };
}

export async function finishAutomationSession(input: {
  user: AutomationUser;
  sessionId: string;
  source?: AutomationSource | string;
  role?: AutomationRole | string;
  reason?: string | null;
}) {
  if (!input.user.tenantId) throw new Error("tenant_required");
  const session = await prisma.automationSession.findFirst({
    where: { id: input.sessionId, tenantId: input.user.tenantId, ownerId: input.user.id },
    include: { trackerType: true, trackerEntry: true }
  });
  if (!session) throw new Error("session_not_found");
  if (session.state === "FINISHED") return session;
  const now = new Date();
  if (session.trackerType) {
    await stopTrackerEntryForType({ trackerType: session.trackerType, user: input.user, notes: input.reason || undefined });
  } else if (session.trackerEntry && !session.trackerEntry.endTime) {
    await prisma.trackerEntry.update({
      where: { id: session.trackerEntry.id },
      data: { endTime: now, durationMinutes: minutesBetween(session.trackerEntry.startTime, now) }
    });
  }
  const updated = await prisma.automationSession.update({
    where: { id: session.id },
    data: {
      state: "FINISHED",
      finishedAt: now,
      pendingEndAt: null,
      stateJson: { finishedReason: input.reason || null }
    },
    include: { trackerType: true, trackerEntry: true }
  });
  await prisma.automationAction.updateMany({
    where: { tenantId: input.user.tenantId, sessionId: session.id, type: "session_finish", status: { in: ["CREATED", "WAITING", "READY"] } },
    data: { status: "SUCCEEDED", finishedAt: now, resultJson: { finishedAt: now.toISOString() } }
  });
  await recordAutomationEvent({
    tenantId: input.user.tenantId,
    sessionId: session.id,
    actorId: input.user.id,
    type: "session_finished",
    title: "Session beendet",
    source: input.source || "SYSTEM",
    role: input.role || "OWNER",
    details: { finishedAt: now, reason: input.reason || null },
    correlationId: session.correlationId
  });
  return updated;
}

export async function createAutomationAction(input: {
  tenantId: string;
  sessionId?: string | null;
  actorId?: string | null;
  type: string;
  source?: string;
  role?: string;
  target?: string | null;
  deviceId?: string | null;
  capabilityId?: string | null;
  timing?: unknown;
  payload?: unknown;
  dueAt?: Date | null;
  idempotencyKey?: string | null;
  correlationId?: string | null;
}) {
  const action = await prisma.automationAction.create({
    data: {
      tenantId: input.tenantId,
      sessionId: input.sessionId || null,
      actorId: input.actorId || null,
      type: input.type,
      source: input.source || "SYSTEM",
      role: input.role || "SYSTEM",
      target: input.target || null,
      deviceId: input.deviceId || null,
      capabilityId: input.capabilityId || null,
      status: input.dueAt && input.dueAt > new Date() ? "WAITING" : "READY",
      timingJson: jsonObject(input.timing),
      payloadJson: jsonObject(input.payload),
      dueAt: input.dueAt || new Date(),
      idempotencyKey: input.idempotencyKey || null,
      correlationId: input.correlationId || correlationId("act")
    }
  });
  await recordAutomationEvent({
    tenantId: input.tenantId,
    sessionId: input.sessionId || null,
    actionId: action.id,
    actorId: input.actorId || null,
    type: "action_created",
    title: `Action angelegt: ${input.type}`,
    source: input.source || "SYSTEM",
    role: input.role || "SYSTEM",
    details: { status: action.status, dueAt: action.dueAt, target: input.target || null },
    correlationId: action.correlationId
  });
  return action;
}

export async function runDueAutomationActions(now = new Date()) {
  const due = await prisma.automationAction.findMany({
    where: { status: "WAITING", dueAt: { lte: now } },
    include: { session: true, actor: true, capability: true, device: true },
    orderBy: { dueAt: "asc" },
    take: 50
  });
  const results: Array<{ id: string; status: AutomationActionStatus; message: string }> = [];
  for (const action of due) {
    const payload = asRecord(action.payloadJson);
    const conditionJson = payload.conditionJson;
    if (conditionJson) {
      const conditionResult = await conditionIsCurrentlyValid({
        tenantId: action.tenantId,
        sessionId: action.sessionId,
        actorId: action.actorId,
        eventCreatedAt: typeof payload.sourceEventAt === "string" ? new Date(payload.sourceEventAt) : action.createdAt,
        conditionJson,
        deviceId: action.deviceId,
        capabilityId: action.capabilityId
      });
      if (!conditionResult.passed) {
        await prisma.automationAction.updateMany({
          where: { id: action.id, status: "WAITING" },
          data: { status: "CANCELLED", finishedAt: now, resultJson: { condition: conditionResult.reason } }
        });
        await recordAutomationEvent({
          tenantId: action.tenantId,
          sessionId: action.sessionId,
          ruleId: action.ruleId,
          ruleVersionId: action.ruleVersionId,
          actionId: action.id,
          actorId: action.actorId,
          deviceId: action.deviceId,
          capabilityId: action.capabilityId,
          type: "action_cancelled",
          title: `${humanActionTitle(action.type)} nicht ausgeführt: ${conditionResult.reason}`,
          source: "SYSTEM",
          role: "SYSTEM",
          details: { condition: conditionResult.reason },
          correlationId: action.correlationId
        });
        results.push({ id: action.id, status: "CANCELLED", message: conditionResult.reason });
        continue;
      }
    }
    if (action.deviceId || action.capabilityId) {
      const queued = await prisma.automationAction.updateMany({
        where: { id: action.id, status: "WAITING" },
        data: { status: "READY", resultJson: { queuedForBridge: true, queuedAt: now.toISOString() } }
      });
      if (!queued.count) continue;
      await recordAutomationEvent({
        tenantId: action.tenantId,
        sessionId: action.sessionId,
        actionId: action.id,
        actorId: action.actorId,
        deviceId: action.deviceId,
        capabilityId: action.capabilityId,
        type: "action_ready_for_bridge",
        title: `Action bereit für Bridge: ${action.type}`,
        source: "SYSTEM",
        role: "SYSTEM",
        details: { dueAt: action.dueAt, target: action.target },
        correlationId: action.correlationId
      });
      results.push({ id: action.id, status: "READY", message: "Action für Bridge bereitgestellt" });
      continue;
    }
    const claimed = await prisma.automationAction.updateMany({
      where: { id: action.id, status: "WAITING" },
      data: { status: "RUNNING", startedAt: now }
    });
    if (!claimed.count) continue;
    try {
      if (action.type === "session_finish" && action.session) {
        await finishAutomationSession({
          user: { id: action.session.ownerId, tenantId: action.tenantId },
          sessionId: action.session.id,
          source: "SYSTEM",
          role: "SYSTEM",
          reason: clean((action.payloadJson as Record<string, unknown>)?.reason)
        });
        results.push({ id: action.id, status: "SUCCEEDED", message: "Session beendet" });
        continue;
      }
      await prisma.automationAction.update({
        where: { id: action.id },
        data: { status: "SUCCEEDED", finishedAt: new Date(), resultJson: { queuedForBridge: Boolean(action.deviceId || action.capabilityId) } }
      });
      await recordAutomationEvent({
        tenantId: action.tenantId,
        sessionId: action.sessionId,
        actionId: action.id,
        actorId: action.actorId,
        deviceId: action.deviceId,
        capabilityId: action.capabilityId,
        type: "action_succeeded",
        title: `Action ausgeführt: ${action.type}`,
        source: "SYSTEM",
        role: "SYSTEM",
        details: { queuedForBridge: Boolean(action.deviceId || action.capabilityId) },
        correlationId: action.correlationId
      });
      results.push({ id: action.id, status: "SUCCEEDED", message: "Action ausgeführt" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unbekannter Fehler";
      await prisma.automationAction.update({
        where: { id: action.id },
        data: { status: "FAILED", finishedAt: new Date(), error: message }
      });
      await recordAutomationEvent({
        tenantId: action.tenantId,
        sessionId: action.sessionId,
        actionId: action.id,
        actorId: action.actorId,
        type: "action_failed",
        title: `Action fehlgeschlagen: ${action.type}`,
        source: "SYSTEM",
        role: "SYSTEM",
        details: { error: message },
        correlationId: action.correlationId
      });
      results.push({ id: action.id, status: "FAILED", message });
    }
  }
  return results;
}

export async function claimAutomationBridgeCommands(input: {
  tenantId: string;
  limit?: number;
}) {
  const limit = Math.min(100, Math.max(1, input.limit || 25));
  const ready = await prisma.automationAction.findMany({
    where: {
      tenantId: input.tenantId,
      status: "READY",
      OR: [{ deviceId: { not: null } }, { capabilityId: { not: null } }]
    },
    include: {
      session: { include: { trackerType: true, trackerEntry: true } },
      device: true,
      capability: true
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
    take: limit
  });
  const claimed = [];
  const now = new Date();
  for (const action of ready) {
    const updated = await prisma.automationAction.updateMany({
      where: { id: action.id, tenantId: input.tenantId, status: "READY" },
      data: { status: "RUNNING", startedAt: now }
    });
    if (!updated.count) continue;
    claimed.push({
      ...action,
      status: "RUNNING",
      startedAt: now,
      payloadJson: action.payloadJson || {}
    });
    await recordAutomationEvent({
      tenantId: input.tenantId,
      sessionId: action.sessionId,
      actionId: action.id,
      actorId: action.actorId,
      deviceId: action.deviceId,
      capabilityId: action.capabilityId,
      type: "action_claimed_by_bridge",
      title: `Bridge hat Action übernommen: ${action.type}`,
      source: "IOBROKER",
      role: "SYSTEM",
      details: { deviceId: action.deviceId, capabilityId: action.capabilityId },
      correlationId: action.correlationId
    });
  }
  return claimed;
}

export async function finishAutomationBridgeCommand(input: {
  tenantId: string;
  actionId: string;
  success: boolean;
  result?: unknown;
  error?: string | null;
  deviceState?: unknown;
  capabilityState?: string | null;
  capabilityStateJson?: unknown;
}) {
  const action = await prisma.automationAction.findFirst({
    where: { id: input.actionId, tenantId: input.tenantId },
    include: { device: true, capability: true }
  });
  if (!action) throw new Error("action_not_found");
  const now = new Date();
  const status = input.success ? "SUCCEEDED" : "FAILED";
  const updated = await prisma.automationAction.update({
    where: { id: action.id },
    data: {
      status,
      finishedAt: now,
      resultJson: input.success ? jsonObject(input.result) : { failedAt: now.toISOString() },
      error: input.success ? null : input.error || "bridge_action_failed"
    }
  });
  if (action.deviceId && input.deviceState && typeof input.deviceState === "object") {
    await prisma.automationDevice.update({
      where: { id: action.deviceId },
      data: { statusJson: jsonObject(input.deviceState), health: input.success ? "ONLINE" : action.device?.health || "UNKNOWN", lastSeenAt: now }
    });
  }
  if (action.capabilityId && (input.capabilityState || input.capabilityStateJson)) {
    await prisma.automationCapability.update({
      where: { id: action.capabilityId },
      data: {
        state: input.capabilityState || action.capability?.state || "UNKNOWN",
        stateJson: jsonObject(input.capabilityStateJson),
        updatedAt: now
      }
    });
  }
  if (!input.success && action.type === "camera_request_image") {
    await handleCameraActionFailure({ action, now, error: input.error || "bridge_action_failed" });
  }
  await recordAutomationEvent({
    tenantId: input.tenantId,
    sessionId: action.sessionId,
    actionId: action.id,
    actorId: action.actorId,
    deviceId: action.deviceId,
    capabilityId: action.capabilityId,
    type: input.success ? "action_succeeded" : "action_failed",
    title: input.success ? `Bridge-Action ausgeführt: ${action.type}` : `Bridge-Action fehlgeschlagen: ${action.type}`,
    source: "IOBROKER",
    role: "SYSTEM",
    details: input.success ? jsonObject(input.result) : { error: input.error || "bridge_action_failed" },
    raw: { result: input.result || null, deviceState: input.deviceState || null, capabilityState: input.capabilityState || null },
    correlationId: action.correlationId
  });
  return updated;
}

async function handleCameraActionFailure(input: {
  action: {
    id: string;
    tenantId: string;
    sessionId: string | null;
    ruleId: string | null;
    ruleVersionId: string | null;
    actorId: string | null;
    contextId: string | null;
    deviceId: string | null;
    capabilityId: string | null;
    payloadJson: Prisma.JsonValue;
    correlationId: string;
  };
  now: Date;
  error: string;
}) {
  const payload = asRecord(input.action.payloadJson);
  const requestId = clean(payload.requestId);
  if (requestId) {
    await prisma.automationImageRequest.updateMany({
      where: { tenantId: input.action.tenantId, requestId },
      data: { status: "FAILED", error: input.error, metadataJson: { failedActionId: input.action.id, failedAt: input.now.toISOString() } }
    });
  }
  const retryCount = numberFromPayload(payload, "retryCount", 0);
  const maxRetries = numberFromPayload(payload, "maxRetries", 0);
  if (!input.action.sessionId || retryCount >= maxRetries) {
    await recordAutomationEvent({
      tenantId: input.action.tenantId,
      sessionId: input.action.sessionId,
      ruleId: input.action.ruleId,
      ruleVersionId: input.action.ruleVersionId,
      actionId: input.action.id,
      actorId: input.action.actorId,
      deviceId: input.action.deviceId,
      capabilityId: input.action.capabilityId,
      type: "camera_recovery_exhausted",
      title: "Kamera-Recovery beendet: keine Wiederholung mehr offen",
      source: "SYSTEM",
      role: "SYSTEM",
      details: { retryCount, maxRetries, error: input.error, requestId },
      correlationId: input.action.correlationId,
      skipRuleProcessing: true
    });
    return;
  }
  const nextRetry = retryCount + 1;
  const bootDelaySeconds = numberFromPayload(payload, "bootDelaySeconds", 20);
  const retryDueAt = new Date(input.now.getTime() + bootDelaySeconds * 1000);
  const recoveryCapabilityId = clean(payload.recoveryCapabilityId);
  if (recoveryCapabilityId) {
    const recoveryCapability = await prisma.automationCapability.findFirst({
      where: { id: recoveryCapabilityId, tenantId: input.action.tenantId, kind: "Switch" },
      include: { device: true }
    });
    if (recoveryCapability) {
      await createAutomationAction({
        tenantId: input.action.tenantId,
        sessionId: input.action.sessionId,
        actorId: input.action.actorId,
        type: "switch_toggle",
        source: "SYSTEM",
        role: "SYSTEM",
        deviceId: recoveryCapability.deviceId,
        capabilityId: recoveryCapability.id,
        payload: { reason: "camera_recovery", failedActionId: input.action.id, retry: nextRetry },
        dueAt: input.now,
        idempotencyKey: `camera-recovery-power:${input.action.id}:${nextRetry}`,
        correlationId: input.action.correlationId
      });
    }
  }
  const nextRequestId = correlationId("img");
  const retryAction = await createAutomationAction({
    tenantId: input.action.tenantId,
    sessionId: input.action.sessionId,
    actorId: input.action.actorId,
    type: "camera_request_image",
    source: "SYSTEM",
    role: "SYSTEM",
    deviceId: input.action.deviceId,
    capabilityId: input.action.capabilityId,
    payload: { ...payload, requestId: nextRequestId, retryCount: nextRetry, previousRequestId: requestId || null, failedActionId: input.action.id },
    dueAt: retryDueAt,
    idempotencyKey: `camera-recovery-image:${input.action.id}:${nextRetry}`,
    correlationId: input.action.correlationId
  });
  await prisma.automationImageRequest.create({
    data: {
      tenantId: input.action.tenantId,
      sessionId: input.action.sessionId,
      actionId: retryAction.id,
      requesterId: input.action.actorId,
      deviceId: input.action.deviceId,
      capabilityId: input.action.capabilityId,
      requestId: nextRequestId,
      retryCount: nextRetry,
      maxRetries,
      timeoutSeconds: numberFromPayload(payload, "timeoutSeconds", 20),
      bootDelaySeconds,
      reason: "Automatische Kamera-Recovery"
    }
  });
  await recordAutomationEvent({
    tenantId: input.action.tenantId,
    sessionId: input.action.sessionId,
    ruleId: input.action.ruleId,
    ruleVersionId: input.action.ruleVersionId,
    actionId: retryAction.id,
    actorId: input.action.actorId,
    deviceId: input.action.deviceId,
    capabilityId: input.action.capabilityId,
    parentEventId: null,
    type: "camera_recovery_scheduled",
    title: `Kamera-Recovery geplant: Versuch ${nextRetry} von ${maxRetries}`,
    source: "SYSTEM",
    role: "SYSTEM",
    details: { retryCount: nextRetry, maxRetries, retryDueAt: retryDueAt.toISOString(), bootDelaySeconds, previousRequestId: requestId || null, nextRequestId },
    correlationId: input.action.correlationId,
    skipRuleProcessing: true
  });
}

function triggerMatches(ruleTrigger: string, eventType: string) {
  if (ruleTrigger === eventType) return true;
  if (ruleTrigger === "session_started" && eventType === "session_started") return true;
  if (ruleTrigger === "session_pending_end" && eventType === "session_pending_end") return true;
  if (ruleTrigger === "action_succeeded" && eventType === "action_succeeded") return true;
  if (ruleTrigger === "action_failed" && eventType === "action_failed") return true;
  if (ruleTrigger === "device_state_changed" && eventType === "device_state_changed") return true;
  if (ruleTrigger === "quota_open" && eventType === "quota_open") return true;
  if (ruleTrigger === "event_absent" && ["session_started", "session_pending_end", "action_succeeded", "action_failed"].includes(eventType)) return true;
  return false;
}

async function conditionIsCurrentlyValid(input: {
  tenantId: string;
  sessionId?: string | null;
  actorId?: string | null;
  eventCreatedAt?: Date | null;
  conditionJson?: unknown;
  deviceId?: string | null;
  capabilityId?: string | null;
}) {
  const condition = firstArrayRecord(input.conditionJson);
  const type = clean(condition.type);
  if (!type || type === "none") return { passed: true, reason: "Keine zusätzliche Bedingung" };
  if (type === "controller_absent") {
    if (!input.sessionId) return { passed: false, reason: "Keine Session für Controller-Prüfung" };
    const since = input.eventCreatedAt || new Date(0);
    const controllerEvents = await prisma.automationEvent.count({
      where: {
        tenantId: input.tenantId,
        sessionId: input.sessionId,
        role: "CONTROLLER",
        createdAt: { gte: since }
      }
    });
    return {
      passed: controllerEvents === 0,
      reason: controllerEvents === 0 ? "Keine Controller-Aktion gefunden" : "Controller hat inzwischen gehandelt"
    };
  }
  if (type === "device_online" || type === "device_offline") {
    const conditionDeviceId = clean(condition.deviceId);
    const deviceId = conditionDeviceId || input.deviceId;
    if (!deviceId) return { passed: false, reason: "Kein Gerät ausgewählt" };
    const device = await prisma.automationDevice.findFirst({ where: { id: deviceId, tenantId: input.tenantId }, select: { health: true } });
    const online = device?.health === "ONLINE";
    return {
      passed: type === "device_online" ? online : !online,
      reason: online ? "Gerät ist verbunden" : "Gerät ist nicht verbunden"
    };
  }
  if (type === "capability_state") {
    const conditionCapabilityId = clean(condition.capabilityId);
    const capabilityId = conditionCapabilityId || input.capabilityId;
    if (!capabilityId) return { passed: false, reason: "Keine Fähigkeit ausgewählt" };
    const expected = clean(condition.state || condition.expected || condition.value);
    const capability = await prisma.automationCapability.findFirst({ where: { id: capabilityId, tenantId: input.tenantId }, select: { state: true } });
    const passed = expected ? capability?.state === expected : Boolean(capability?.state);
    return { passed, reason: passed ? "Fähigkeitszustand passt" : "Fähigkeitszustand passt nicht" };
  }
  if (type === "quota_remaining") {
    const trackerTypeId = clean(condition.trackerTypeId);
    if (!trackerTypeId) return { passed: false, reason: "Kein Tracker ausgewählt" };
    let ownerId = input.actorId || null;
    if (!ownerId && input.sessionId) {
      const session = await prisma.automationSession.findFirst({
        where: { id: input.sessionId, tenantId: input.tenantId },
        select: { ownerId: true }
      });
      ownerId = session?.ownerId || null;
    }
    if (!ownerId) return { passed: false, reason: "Kein Benutzer für Kontingentprüfung" };
    const statuses = await trackerQuotaStatusForUser({ id: ownerId, tenantId: input.tenantId });
    const status = statuses.find((item) => item.tracker.id === trackerTypeId);
    if (!status || !status.hasQuota) return { passed: false, reason: "Für diesen Tracker ist kein Kontingent konfiguriert" };
    return {
      passed: !status.complete,
      reason: status.complete ? "Tracker-Kontingent ist bereits erfüllt" : `Tracker-Kontingent ist offen: ${quotaSummaryText(status)}`
    };
  }
  return { passed: false, reason: "Bedingung wird nicht unterstützt" };
}

async function processAutomationRulesForEvent(event: {
  id: string;
  tenantId: string;
  sessionId: string | null;
  actorId: string | null;
  deviceId: string | null;
  capabilityId: string | null;
  type: string;
  source: string;
  role: string;
  correlationId: string;
  createdAt: Date;
}) {
  if (event.type.startsWith("rule_") || event.type === "action_created" || event.type === "action_ready_for_bridge" || event.type === "rule_processing_failed") return;
  const rules = await prisma.automationRule.findMany({
    where: { tenantId: event.tenantId, active: true },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } }
  });
  for (const rule of rules.filter((item) => triggerMatches(item.triggerType, event.type))) {
    const version = rule.versions[0];
    if (!version) continue;
    const actions = jsonArray(version.actionJson);
    if (!actions.length) continue;
    const condition = firstArrayRecord(version.conditionJson);
    const actionSpecs = actions.map((item) => asRecord(item));
    const hasDelayedAbsence = clean(condition.type) === "controller_absent" && conditionDelayMinutes(version.conditionJson) > 0;
    if (!hasDelayedAbsence) {
      const actionSpec = actionSpecs[0];
      const conditionResult = await conditionIsCurrentlyValid({
        tenantId: event.tenantId,
        sessionId: event.sessionId,
        actorId: event.actorId,
        eventCreatedAt: event.createdAt,
        conditionJson: version.conditionJson,
        deviceId: clean(actionSpec.deviceId || event.deviceId) || event.deviceId,
        capabilityId: clean(actionSpec.capabilityId || event.capabilityId) || event.capabilityId
      });
      if (!conditionResult.passed) {
        await recordAutomationEvent({
          tenantId: event.tenantId,
          sessionId: event.sessionId,
          ruleId: rule.id,
          ruleVersionId: version.id,
          parentEventId: event.id,
          actorId: event.actorId,
          type: "rule_condition_blocked",
          title: `Regel nicht ausgeführt: ${conditionResult.reason}`,
          source: "SYSTEM",
          role: "SYSTEM",
          details: { rule: rule.name, condition: conditionResult.reason },
          correlationId: event.correlationId,
          skipRuleProcessing: true
        });
        continue;
      }
    }
    const delay = concreteDelayMinutes(version.timingJson);
    const conditionDelay = conditionDelayMinutes(version.conditionJson);
    const dueAt = new Date(event.createdAt.getTime() + (conditionDelay + delay) * 60_000);
    const resolvedTiming = {
      ...asRecord(version.timingJson),
      conditionDelayMinutes: conditionDelay,
      resolvedDelayMinutes: delay,
      dueAt: dueAt.toISOString()
    };
    const context = await createAutomationContext({
      tenantId: event.tenantId,
      sessionId: event.sessionId,
      actorId: event.actorId,
      source: "SCHEDULED_RULE",
      role: "SYSTEM",
      ruleId: rule.id,
      ruleVersionId: version.id,
      variables: { sourceEventId: event.id, sourceEventType: event.type, dueAt: dueAt.toISOString() },
      conditions: jsonArray(version.conditionJson),
      policy: { decision: "allow", reason: "rule_triggered" },
      timing: resolvedTiming,
      correlationId: event.correlationId
    });
    await recordAutomationEvent({
      tenantId: event.tenantId,
      sessionId: event.sessionId,
      ruleId: rule.id,
      ruleVersionId: version.id,
      contextId: context.id,
      parentEventId: event.id,
      actorId: event.actorId,
      type: "rule_triggered",
      title: `Regel ausgelöst: ${rule.name}`,
      source: "SCHEDULED_RULE",
      role: "SYSTEM",
      details: { summary: version.descriptionText, dueAt: dueAt.toISOString(), conditionDelayMinutes: conditionDelay, resolvedDelayMinutes: delay },
      correlationId: event.correlationId,
      skipRuleProcessing: true
    });
    for (const [index, actionSpec] of actionSpecs.entries()) {
      const actionType = clean(actionSpec.type) || "session_finish";
      const capabilityId = clean(actionSpec.capabilityId || event.capabilityId) || null;
      const capability = capabilityId ? await prisma.automationCapability.findFirst({ where: { id: capabilityId, tenantId: event.tenantId }, include: { device: true } }) : null;
      const deviceId = clean(actionSpec.deviceId || capability?.deviceId || event.deviceId) || null;
      const requestId = actionType === "camera_request_image" ? correlationId("img") : null;
      const idempotencyKey = rule.mode === "ONCE"
        ? `rule:${rule.id}:${version.id}:${event.sessionId || event.id}:${index}`
        : `rule:${rule.id}:${version.id}:${event.id}:${Date.now()}:${index}`;
      const action = await prisma.automationAction.upsert({
        where: { tenantId_idempotencyKey: { tenantId: event.tenantId, idempotencyKey } },
        update: {},
        create: {
          tenantId: event.tenantId,
          sessionId: event.sessionId,
          ruleId: rule.id,
          ruleVersionId: version.id,
          actorId: event.actorId,
          contextId: context.id,
          deviceId,
          capabilityId,
          type: actionType,
          source: "SCHEDULED_RULE",
          role: "SYSTEM",
          status: "WAITING",
          timingJson: resolvedTiming,
          payloadJson: {
            ...asRecord(actionSpec),
            requestId,
            retryCount: 0,
            sourceEventId: event.id,
            sourceEventType: event.type,
            sourceEventAt: event.createdAt.toISOString(),
            conditionJson: jsonArray(version.conditionJson)
          },
          dueAt,
          idempotencyKey,
          correlationId: event.correlationId
        }
      });
      if (requestId && event.sessionId) {
        await prisma.automationImageRequest.upsert({
          where: { requestId },
          update: {},
          create: {
            tenantId: event.tenantId,
            sessionId: event.sessionId,
            actionId: action.id,
            requesterId: event.actorId,
            deviceId,
            capabilityId,
            requestId,
            reason: `Regel: ${rule.name}`,
            maxRetries: numberFromPayload(actionSpec, "maxRetries", 2),
            timeoutSeconds: numberFromPayload(actionSpec, "timeoutSeconds", 20),
            bootDelaySeconds: numberFromPayload(actionSpec, "bootDelaySeconds", 20)
          }
        });
      }
      await recordAutomationEvent({
        tenantId: event.tenantId,
        sessionId: event.sessionId,
        ruleId: rule.id,
        ruleVersionId: version.id,
        actionId: action.id,
        deviceId,
        capabilityId,
        contextId: context.id,
        parentEventId: event.id,
        actorId: event.actorId,
        type: "action_created",
        title: `${humanActionTitle(actionType)} geplant`,
        source: "SCHEDULED_RULE",
        role: "SYSTEM",
        details: { dueAt: dueAt.toISOString(), rule: rule.name, summary: version.descriptionText },
        correlationId: event.correlationId,
        skipRuleProcessing: true
      });
    }
  }
}

export function describeAutomationRule(input: {
  triggerType: string;
  conditionJson?: unknown;
  timingJson?: unknown;
  actionJson?: unknown;
  mode?: string;
}) {
  return automationRuleSummary(input);
}

export async function createAutomationRule(input: {
  user: AutomationUser;
  name: string;
  description?: string | null;
  active?: boolean;
  mode?: string;
  triggerType: string;
  triggerJson?: unknown;
  conditionJson?: unknown;
  timingJson?: unknown;
  actionJson?: unknown;
  descriptionText?: string;
}) {
  if (!input.user.tenantId) throw new Error("tenant_required");
  const descriptionText = input.descriptionText || describeAutomationRule(input);
  const rule = await prisma.automationRule.create({
    data: {
      tenantId: input.user.tenantId,
      ownerId: input.user.id,
      name: input.name,
      description: input.description || null,
      active: input.active !== false,
      mode: input.mode || "ONCE",
      triggerType: input.triggerType,
      triggerJson: jsonObject(input.triggerJson),
      conditionJson: jsonArray(input.conditionJson),
      timingJson: jsonObject(input.timingJson),
      actionJson: jsonArray(input.actionJson),
      descriptionText,
      versions: {
        create: {
          tenantId: input.user.tenantId,
          version: 1,
          name: input.name,
          mode: input.mode || "ONCE",
          triggerType: input.triggerType,
          triggerJson: jsonObject(input.triggerJson),
          conditionJson: jsonArray(input.conditionJson),
          timingJson: jsonObject(input.timingJson),
          actionJson: jsonArray(input.actionJson),
          descriptionText
        }
      }
    },
    include: { versions: true }
  });
  await recordAutomationEvent({
    tenantId: input.user.tenantId,
    ruleId: rule.id,
    actorId: input.user.id,
    type: "rule_created",
    title: `Regel angelegt: ${rule.name}`,
    source: "WEB",
    role: "OWNER",
    details: { descriptionText }
  });
  return rule;
}

export function simulateAutomationRule(input: {
  triggerType: string;
  conditionJson?: unknown;
  timingJson?: unknown;
  actionJson?: unknown;
  startAt?: Date;
  scrubMinute?: number;
}) {
  return simulateAutomationRuleTimeline(input);
}

export async function upsertAutomationDevice(input: {
  tenantId: string;
  logicalId: string;
  name: string;
  integration?: string;
  health?: string;
  status?: unknown;
  metadata?: unknown;
}) {
  return prisma.automationDevice.upsert({
    where: { tenantId_logicalId: { tenantId: input.tenantId, logicalId: input.logicalId } },
    update: {
      name: input.name,
      integration: input.integration || "IOBROKER",
      health: input.health || "UNKNOWN",
      statusJson: jsonObject(input.status),
      metadataJson: jsonObject(input.metadata),
      lastSeenAt: new Date()
    },
    create: {
      tenantId: input.tenantId,
      logicalId: input.logicalId,
      name: input.name,
      integration: input.integration || "IOBROKER",
      health: input.health || "UNKNOWN",
      statusJson: jsonObject(input.status),
      metadataJson: jsonObject(input.metadata),
      lastSeenAt: new Date()
    }
  });
}

export async function upsertAutomationCapability(input: {
  tenantId: string;
  deviceId: string;
  key: string;
  kind: string;
  title: string;
  state?: string;
  actions?: unknown;
  events?: unknown;
  conditions?: unknown;
  parameters?: unknown;
  ui?: unknown;
}) {
  return prisma.automationCapability.upsert({
    where: { deviceId_key: { deviceId: input.deviceId, key: input.key } },
    update: {
      kind: input.kind,
      title: input.title,
      state: input.state || "UNKNOWN",
      actionsJson: jsonArray(input.actions),
      eventsJson: jsonArray(input.events),
      conditionsJson: jsonArray(input.conditions),
      parametersJson: jsonObject(input.parameters),
      uiJson: jsonObject(input.ui)
    },
    create: {
      tenantId: input.tenantId,
      deviceId: input.deviceId,
      key: input.key,
      kind: input.kind,
      title: input.title,
      state: input.state || "UNKNOWN",
      actionsJson: jsonArray(input.actions),
      eventsJson: jsonArray(input.events),
      conditionsJson: jsonArray(input.conditions),
      parametersJson: jsonObject(input.parameters),
      uiJson: jsonObject(input.ui)
    }
  });
}

export async function createAutomationImageRequest(input: {
  user: AutomationUser;
  sessionId: string;
  deviceId?: string | null;
  capabilityId?: string | null;
  reason?: string | null;
}) {
  if (!input.user.tenantId) throw new Error("tenant_required");
  const session = await prisma.automationSession.findFirst({ where: { id: input.sessionId, tenantId: input.user.tenantId, ownerId: input.user.id } });
  if (!session) throw new Error("session_not_found");
  const requestId = correlationId("img");
  const action = await createAutomationAction({
    tenantId: input.user.tenantId,
    sessionId: session.id,
    actorId: input.user.id,
    type: "camera_request_image",
    source: "SYSTEM",
    role: "OWNER",
    deviceId: input.deviceId || null,
    capabilityId: input.capabilityId || null,
    payload: { requestId, reason: input.reason || null, maxRetries: 2, retryCount: 0, timeoutSeconds: 20, bootDelaySeconds: 20 },
    correlationId: session.correlationId
  });
  const request = await prisma.automationImageRequest.create({
    data: {
      tenantId: input.user.tenantId,
      sessionId: session.id,
      actionId: action.id,
      requesterId: input.user.id,
      deviceId: input.deviceId || null,
      capabilityId: input.capabilityId || null,
      requestId,
      reason: input.reason || null,
      maxRetries: 2,
      timeoutSeconds: 20,
      bootDelaySeconds: 20
    }
  });
  await recordAutomationEvent({
    tenantId: input.user.tenantId,
    sessionId: session.id,
    actionId: action.id,
    actorId: input.user.id,
    deviceId: input.deviceId || null,
    capabilityId: input.capabilityId || null,
    type: "image_requested",
    title: "Bild angefordert",
    details: { requestId },
    correlationId: session.correlationId
  });
  return request;
}

export async function attachAutomationImage(input: {
  tenantId: string;
  requestId: string;
  ownerId: string;
  bytes: Buffer;
  originalName: string;
  mimeType: string;
  metadata?: unknown;
}) {
  const request = await prisma.automationImageRequest.findFirst({
    where: { tenantId: input.tenantId, requestId: input.requestId },
    include: { session: true }
  });
  if (!request) throw new Error("image_request_not_found");
  const file = await saveFileBuffer({
    ownerId: input.ownerId,
    tenantId: input.tenantId,
    bytes: input.bytes,
    originalName: input.originalName,
    mimeType: input.mimeType
  });
  if (!file) throw new Error("file_not_saved");
  const updated = await prisma.automationImageRequest.update({
    where: { id: request.id },
    data: {
      fileId: file.id,
      status: "UPLOADED",
      uploadedAt: new Date(),
      metadataJson: jsonObject(input.metadata)
    },
    include: { file: true }
  });
  await recordAutomationEvent({
    tenantId: input.tenantId,
    sessionId: request.sessionId,
    actionId: request.actionId,
    actorId: input.ownerId,
    type: "image_uploaded",
    title: "Bild empfangen",
    details: { requestId: input.requestId, fileId: file.id },
    correlationId: request.session.correlationId
  });
  return updated;
}
