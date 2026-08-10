import type { Prisma } from "@prisma/client";
import { logAction } from "@/lib/audit";
import { minutesBetween } from "@/lib/dates";
import { saveFileBuffer } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { findTrackerTypeByIdForUser, findTrackerTypeByTextForUser, startTrackerEntryForType, stopTrackerEntryForType, uniqueTrackerSlug } from "@/lib/tracker-core";

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
  const data = jsonObject(timing);
  const type = clean(data.type || data.mode) || "immediate";
  if (type === "fixed_delay") {
    const minutes = Math.max(0, Number(data.minutes || data.delayMinutes || 0));
    return new Date(now.getTime() + minutes * 60_000);
  }
  if (type === "random_delay") {
    const min = Math.max(0, Number(data.minMinutes || 0));
    const max = Math.max(min, Number(data.maxMinutes || min));
    const picked = min + Math.floor(Math.random() * (max - min + 1));
    return new Date(now.getTime() + picked * 60_000);
  }
  return now;
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
    data: { state: "PENDING_END", pendingEndAt: dueAt }
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

export function describeAutomationRule(input: {
  triggerType: string;
  conditionJson?: unknown;
  timingJson?: unknown;
  actionJson?: unknown;
  mode?: string;
}) {
  const timing = jsonObject(input.timingJson);
  const actions = jsonArray(input.actionJson);
  const timingText = timing.type === "random_delay"
    ? `zufällig nach ${timing.minMinutes || 0}-${timing.maxMinutes || 0} Minuten`
    : timing.type === "fixed_delay"
      ? `nach ${timing.minutes || timing.delayMinutes || 0} Minuten`
      : "sofort";
  return `Wenn ${input.triggerType}, dann ${timingText} ${actions.length || 1} Aktion(en) ausführen. Modus: ${input.mode || "ONCE"}.`;
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
}) {
  if (!input.user.tenantId) throw new Error("tenant_required");
  const descriptionText = describeAutomationRule(input);
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
  timingJson?: unknown;
  actionJson?: unknown;
  startAt?: Date;
}) {
  const startAt = input.startAt || new Date();
  const dueAt = dueAtFromTiming(input.timingJson, startAt);
  const actions = jsonArray(input.actionJson);
  return {
    startAt: startAt.toISOString(),
    timeline: [
      { at: startAt.toISOString(), kind: "trigger", title: `Trigger: ${input.triggerType}` },
      { at: dueAt.toISOString(), kind: "actions_ready", title: `${actions.length || 1} Aktion(en) werden fällig` }
    ],
    variables: {
      delayMinutes: Math.max(0, Math.round((dueAt.getTime() - startAt.getTime()) / 60000)),
      sideEffects: false
    }
  };
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
    payload: { requestId, reason: input.reason || null },
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
      reason: input.reason || null
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
