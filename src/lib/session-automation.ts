import { Prisma } from "@prisma/client";
import { logAction } from "@/lib/audit";
import { automationRuleSummary, simulateAutomationRuleTimeline } from "@/lib/automation-rule-model";
import { minutesBetween } from "@/lib/dates";
import { saveFileBuffer } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { findTrackerTypeByIdForUser, findTrackerTypeByTextForUser, stopTrackerEntryForType, trackerSlugBase } from "@/lib/tracker-core";
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
  circleId?: string | null;
  role?: string;
};

type AutomationSessionForAccess = {
  id: string;
  tenantId: string;
  ownerId: string;
  state: string;
};

export type AutomationSessionAccess = {
  canView: boolean;
  role: AutomationRole | null;
  reason: string;
  canRequestEnd: boolean;
  canOverrideEnd: boolean;
  canRequestImage: boolean;
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
    camera_health_check: "Verbindung prüfen",
    switch_on: "Einschalten",
    switch_off: "Ausschalten",
    switch_toggle: "Umschalten",
    voice_speak: "Text sprechen",
    session_finish: "Session beenden"
  };
  return labels[type] || "Aktion ausführen";
}

function isSwitchAction(type: string) {
  return ["switch_on", "switch_off", "switch_toggle"].includes(type);
}

function switchEventForState(state?: string | null) {
  if (state === "ON") return { type: "switched_on", title: "Schalter wurde eingeschaltet" };
  if (state === "OFF") return { type: "switched_off", title: "Schalter wurde ausgeschaltet" };
  return null;
}

function isVoiceAction(type: string) {
  return type === "voice_speak";
}

function voiceEventForResult(success: boolean) {
  return success
    ? { type: "speech_finished", title: "Sprachausgabe wurde beendet", state: "ONLINE" }
    : { type: "voice_error", title: "Sprachausgabe ist nicht erreichbar", state: "ERROR" };
}

function isAdminRole(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

function automationActionAllowedState(state: string) {
  return ["RUNNING", "PENDING_END"].includes(state);
}

async function usersShareAutomationCircle(tenantId: string, user: AutomationUser, ownerId: string) {
  const userCircleIds = new Set<string>();
  if (user.circleId) userCircleIds.add(user.circleId);
  const ownerCircleIds = new Set<string>();
  const [memberships, owner] = await Promise.all([
    prisma.tenantMembership.findMany({
      where: { tenantId, active: true, userId: { in: [user.id, ownerId] }, circleId: { not: null }, user: { active: true } },
      select: { userId: true, circleId: true }
    }),
    prisma.user.findFirst({ where: { id: ownerId, tenantId, active: true }, select: { circleId: true } })
  ]);
  if (owner?.circleId) ownerCircleIds.add(owner.circleId);
  for (const membership of memberships) {
    if (!membership.circleId) continue;
    if (membership.userId === user.id) userCircleIds.add(membership.circleId);
    if (membership.userId === ownerId) ownerCircleIds.add(membership.circleId);
  }
  return [...userCircleIds].some((circleId) => ownerCircleIds.has(circleId));
}

export async function automationSessionAccess(user: AutomationUser, session: AutomationSessionForAccess): Promise<AutomationSessionAccess> {
  const denied: AutomationSessionAccess = {
    canView: false,
    role: null,
    reason: "Kein Zugriff auf diese Session",
    canRequestEnd: false,
    canOverrideEnd: false,
    canRequestImage: false
  };
  if (!user.tenantId || user.tenantId !== session.tenantId) return denied;
  const allowedState = automationActionAllowedState(session.state);
  if (session.ownerId === user.id) {
    return {
      canView: true,
      role: "OWNER",
      reason: "Session-Benutzer",
      canRequestEnd: allowedState,
      canOverrideEnd: session.state === "PENDING_END",
      canRequestImage: allowedState
    };
  }
  if (isAdminRole(user.role) || await usersShareAutomationCircle(session.tenantId, user, session.ownerId)) {
    return {
      canView: true,
      role: "CONTROLLER",
      reason: isAdminRole(user.role) ? "Administrator als Controller" : "Controller im gemeinsamen Zirkel",
      canRequestEnd: allowedState,
      canOverrideEnd: session.state === "PENDING_END",
      canRequestImage: allowedState
    };
  }
  return denied;
}

function numberFromPayload(payload: Record<string, unknown>, key: string, fallback: number) {
  const value = Number(payload[key]);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
}

async function uniqueTrackerSlugInTransaction(tx: Prisma.TransactionClient, trackerTypeId: string, key: string, startTime: Date) {
  const base = trackerSlugBase(key, startTime);
  let slug = base;
  let counter = 2;
  while (true) {
    const existing = await tx.trackerEntry.findFirst({ where: { trackerTypeId, slug }, select: { id: true } });
    if (!existing) return slug;
    slug = `${base}-${counter++}`;
  }
}

function isRetryableAutomationStartError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true;
  const message = error instanceof Error ? error.message : "";
  return /could not serialize|deadlock detected|serialization failure/i.test(message);
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
  const corr = input.idempotencyKey || correlationId("session");
  const title = input.title || tracker.title;
  const lockKey = `automation-start:${input.user.tenantId}:${input.user.id}:${tracker.id}`;
  let result: {
    session: Awaited<ReturnType<typeof currentAutomationSession>>;
    trackerEntryId?: string | null;
    created: boolean;
  } | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
        const existing = await tx.automationSession.findFirst({
          where: { tenantId: input.user.tenantId!, ownerId: input.user.id, state: { in: ["RUNNING", "PENDING_END"] }, trackerTypeId: tracker.id },
          include: {
            trackerType: true,
            trackerEntry: true,
            actions: { orderBy: { createdAt: "desc" }, take: 20 },
            events: { orderBy: { createdAt: "desc" }, take: 30 },
            imageRequests: { include: { file: true }, orderBy: { requestedAt: "desc" } }
          },
          orderBy: { startedAt: "desc" }
        });
        if (existing) return { session: existing, trackerEntryId: existing.trackerEntryId, created: false };
        const startTime = new Date();
        if (tracker.autoCloseOpenSession) {
          const open = await tx.trackerEntry.findFirst({
            where: { trackerTypeId: tracker.id, ownerId: input.user.id, endTime: null, allDay: false },
            orderBy: { startTime: "desc" }
          });
          if (open) {
            const endTime = new Date();
            await tx.trackerEntry.update({
              where: { id: open.id },
              data: { endTime, durationMinutes: minutesBetween(open.startTime, endTime) }
            });
          }
        }
        const trackerEntry = await tx.trackerEntry.create({
          data: {
            tenantId: input.user.tenantId || tracker.tenantId,
            ownerId: input.user.id,
            trackerTypeId: tracker.id,
            slug: await uniqueTrackerSlugInTransaction(tx, tracker.id, tracker.key, startTime),
            title: tracker.title,
            startTime,
            allDay: false,
            notes: input.notes || "Automatisierte Session gestartet",
            fieldValues: {}
          }
        });
        const session = await tx.automationSession.create({
          data: {
            tenantId: input.user.tenantId!,
            ownerId: input.user.id,
            trackerTypeId: tracker.id,
            trackerEntryId: trackerEntry.id,
            slug: await uniqueAutomationSlug(input.user.tenantId!, title, startTime),
            title,
            state: "RUNNING",
            source: input.source || "SYSTEM",
            role: input.role || "OWNER",
            correlationId: corr,
            startedAt: startTime,
            notes: input.notes || null,
            metadataJson: jsonObject(input.metadata)
          },
          include: {
            trackerType: true,
            trackerEntry: true,
            actions: { orderBy: { createdAt: "desc" }, take: 20 },
            events: { orderBy: { createdAt: "desc" }, take: 30 },
            imageRequests: { include: { file: true }, orderBy: { requestedAt: "desc" } }
          }
        });
        return { session, trackerEntryId: trackerEntry.id, created: true };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      break;
    } catch (error) {
      if (!isRetryableAutomationStartError(error) || attempt === 2) throw error;
    }
  }
  if (!result?.session) throw new Error("automation_start_failed");
  if (!result.created) {
    await recordAutomationEvent({
      tenantId: input.user.tenantId,
      sessionId: result.session.id,
      actorId: input.user.id,
      type: "session_start_ignored",
      title: `${tracker.title} läuft bereits`,
      source: input.source || "SYSTEM",
      role: input.role || "OWNER",
      details: { existingSessionId: result.session.id },
      correlationId: result.session.correlationId
    });
    return { session: result.session, created: false };
  }
  const session = result.session;
  const context = await createAutomationContext({
    tenantId: input.user.tenantId,
    sessionId: session.id,
    actorId: input.user.id,
    source: input.source || "SYSTEM",
    role: input.role || "OWNER",
    variables: { trackerTypeId: tracker.id, trackerEntryId: result.trackerEntryId },
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
    details: { trackerTypeId: tracker.id, trackerEntryId: result.trackerEntryId },
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
  const tenantId = input.user.tenantId;
  const session = input.sessionId
    ? await prisma.automationSession.findFirst({ where: { id: input.sessionId, tenantId }, include: { trackerType: true } })
    : await currentAutomationSession(input.user, input.trackerTypeId || undefined);
  if (!session) throw new Error("session_not_found");
  const access = input.role === "SYSTEM"
    ? { canRequestEnd: true, canOverrideEnd: true, role: "SYSTEM" as AutomationRole, reason: "Systemaktion" }
    : await automationSessionAccess(input.user, session);
  if (!access.canRequestEnd) throw new Error("automation_action_not_allowed");
  if (input.override && !access.canOverrideEnd) throw new Error("automation_override_not_allowed");
  const effectiveRole = input.role === "SYSTEM" ? "SYSTEM" : access.role || "OWNER";
  const policy = { role: effectiveRole, reason: access.reason, action: input.override ? "session_finish_override" : "session_finish_request", state: session.state, allowed: true };
  if (session.state === "PENDING_END" && !input.override) {
    await recordAutomationEvent({
      tenantId: input.user.tenantId,
      sessionId: session.id,
      actorId: input.user.id,
      type: "session_end_kept",
      title: "Bestehendes Endfenster bleibt unverändert",
      source: input.source || "SYSTEM",
      role: effectiveRole,
      details: { pendingEndAt: session.pendingEndAt, reason: input.reason || null, policy },
      correlationId: session.correlationId
    });
    return { session, action: null, changed: false };
  }
  const now = new Date();
  const dueAt = dueAtFromTiming(input.timing, now);
  const delayMinutes = Math.max(0, Math.round((dueAt.getTime() - now.getTime()) / 60_000));
  const immediate = dueAt.getTime() <= now.getTime() + 1000;
  if (immediate) {
    const finished = await finishAutomationSession({ user: input.user, sessionId: session.id, source: input.source, role: effectiveRole, reason: input.reason });
    return { session: finished, action: null, changed: true };
  }
  const planned = await prisma.$transaction(async (tx) => {
    const lockKey = `automation-session:${tenantId}:${session.id}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const lockedSession = await tx.automationSession.findFirst({
      where: { id: session.id, tenantId },
      include: { trackerType: true }
    });
    if (!lockedSession) throw new Error("session_not_found");
    if (lockedSession.state === "PENDING_END" && !input.override) {
      return { kind: "kept" as const, session: lockedSession, action: null };
    }
    if (lockedSession.state === "FINISHED") {
      return { kind: "finished" as const, session: lockedSession, action: null };
    }
    const lockedPolicy = { ...policy, state: lockedSession.state };
    const action = await tx.automationAction.create({
      data: {
        tenantId,
        sessionId: lockedSession.id,
        actorId: input.user.id,
        type: "session_finish",
        source: input.source || "SYSTEM",
        role: effectiveRole,
        status: "WAITING",
        timingJson: jsonObject(input.timing),
        payloadJson: { reason: input.reason || null, policy: lockedPolicy },
        dueAt,
        correlationId: lockedSession.correlationId
      }
    });
    const updated = await tx.automationSession.update({
      where: { id: lockedSession.id },
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
    return { kind: "planned" as const, session: updated, action };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (planned.kind === "kept") {
    await recordAutomationEvent({
      tenantId: input.user.tenantId,
      sessionId: planned.session.id,
      actorId: input.user.id,
      type: "session_end_kept",
      title: "Bestehendes Endfenster bleibt unverändert",
      source: input.source || "SYSTEM",
      role: effectiveRole,
      details: { pendingEndAt: planned.session.pendingEndAt, reason: input.reason || null, policy: { ...policy, state: planned.session.state } },
      correlationId: planned.session.correlationId
    });
    return { session: planned.session, action: null, changed: false };
  }
  if (planned.kind === "finished") {
    return { session: planned.session, action: null, changed: false };
  }
  await recordAutomationEvent({
    tenantId: input.user.tenantId,
    sessionId: planned.session.id,
    actionId: planned.action.id,
    actorId: input.user.id,
    type: "session_pending_end",
    title: "Session-Ende geplant",
    source: input.source || "SYSTEM",
    role: effectiveRole,
    details: { dueAt, reason: input.reason || null, policy },
    correlationId: planned.session.correlationId
  });
  return { session: planned.session, action: planned.action, changed: true };
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
    where: { id: input.sessionId, tenantId: input.user.tenantId },
    include: { trackerType: true, trackerEntry: true }
  });
  if (!session) throw new Error("session_not_found");
  const access = input.role === "SYSTEM"
    ? { canRequestEnd: true, canOverrideEnd: true, role: "SYSTEM" as AutomationRole, reason: "Systemaktion" }
    : await automationSessionAccess(input.user, session);
  if (!access.canRequestEnd && session.state !== "FINISHED") throw new Error("automation_action_not_allowed");
  const effectiveRole = input.role === "SYSTEM" ? "SYSTEM" : access.role || "OWNER";
  if (session.state === "FINISHED") return session;
  const now = new Date();
  if (session.trackerType) {
    await stopTrackerEntryForType({ trackerType: session.trackerType, user: { id: session.ownerId, tenantId: input.user.tenantId }, notes: input.reason || undefined });
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
    role: effectiveRole,
    details: { finishedAt: now, reason: input.reason || null, policy: { role: effectiveRole, reason: access.reason, action: "session_finish", state: session.state, allowed: true } },
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
    title: `Aktion angelegt: ${humanActionTitle(input.type)}`,
    source: input.source || "SYSTEM",
    role: input.role || "SYSTEM",
    details: { status: action.status, actionTitle: humanActionTitle(input.type), actionType: input.type, dueAt: action.dueAt, target: input.target || null },
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
        title: `Aktion bereit für Bridge: ${humanActionTitle(action.type)}`,
        source: "SYSTEM",
        role: "SYSTEM",
        details: { actionTitle: humanActionTitle(action.type), actionType: action.type, dueAt: action.dueAt, target: action.target },
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
        title: `Aktion ausgeführt: ${humanActionTitle(action.type)}`,
        source: "SYSTEM",
        role: "SYSTEM",
        details: { actionTitle: humanActionTitle(action.type), actionType: action.type, queuedForBridge: Boolean(action.deviceId || action.capabilityId) },
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
        title: `Aktion fehlgeschlagen: ${humanActionTitle(action.type)}`,
        source: "SYSTEM",
        role: "SYSTEM",
        details: { actionTitle: humanActionTitle(action.type), actionType: action.type, error: message },
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
  staleAfterSeconds?: number;
}) {
  const limit = Math.min(100, Math.max(1, input.limit || 25));
  const now = new Date();
  const staleAfterSeconds = Math.min(3600, Math.max(30, input.staleAfterSeconds || 120));
  const staleBefore = new Date(now.getTime() - staleAfterSeconds * 1000);
  const stale = await prisma.automationAction.findMany({
    where: {
      tenantId: input.tenantId,
      status: "RUNNING",
      startedAt: { lte: staleBefore },
      OR: [{ deviceId: { not: null } }, { capabilityId: { not: null } }]
    },
    select: {
      id: true,
      tenantId: true,
      sessionId: true,
      actorId: true,
      deviceId: true,
      capabilityId: true,
      type: true,
      correlationId: true,
      startedAt: true
    },
    take: limit
  });
  for (const action of stale) {
    const updated = await prisma.automationAction.updateMany({
      where: { id: action.id, tenantId: input.tenantId, status: "RUNNING", startedAt: { lte: staleBefore } },
      data: { status: "READY", startedAt: null, resultJson: { requeuedForBridge: true, requeuedAt: now.toISOString(), previousClaimAt: action.startedAt?.toISOString() || null } }
    });
    if (!updated.count) continue;
    await recordAutomationEvent({
      tenantId: input.tenantId,
      sessionId: action.sessionId,
      actionId: action.id,
      actorId: action.actorId,
      deviceId: action.deviceId,
      capabilityId: action.capabilityId,
      type: "action_requeued_for_bridge",
      title: `Bridge-Aktion erneut bereitgestellt: ${humanActionTitle(action.type)}`,
      source: "SYSTEM",
      role: "SYSTEM",
      details: { actionTitle: humanActionTitle(action.type), actionType: action.type, staleAfterSeconds, previousClaimAt: action.startedAt?.toISOString() || null },
      correlationId: action.correlationId,
      skipRuleProcessing: true
    });
  }
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
      title: `Bridge hat Aktion übernommen: ${humanActionTitle(action.type)}`,
      source: "IOBROKER",
      role: "SYSTEM",
      details: { actionTitle: humanActionTitle(action.type), actionType: action.type, deviceId: action.deviceId, capabilityId: action.capabilityId },
      correlationId: action.correlationId
    });
    if (action.capabilityId && isVoiceAction(action.type)) {
      await recordAutomationEvent({
        tenantId: input.tenantId,
        sessionId: action.sessionId,
        actionId: action.id,
        actorId: action.actorId,
        deviceId: action.deviceId,
        capabilityId: action.capabilityId,
        type: "speech_started",
        title: "Sprachausgabe wurde gestartet",
        source: "IOBROKER",
        role: "SYSTEM",
        details: { actionTitle: humanActionTitle(action.type), actionType: action.type },
        correlationId: action.correlationId
      });
    }
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
  if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(action.status)) {
    return action;
  }
  const now = new Date();
  const status = input.success ? "SUCCEEDED" : "FAILED";
  const resolvedCapabilityState = input.capabilityState
    || (input.success && action.type === "switch_on" ? "ON" : null)
    || (input.success && action.type === "switch_off" ? "OFF" : null)
    || (isVoiceAction(action.type) ? voiceEventForResult(input.success).state : null);
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
  if (action.capabilityId && (resolvedCapabilityState || input.capabilityStateJson)) {
    await prisma.automationCapability.update({
      where: { id: action.capabilityId },
      data: {
        state: resolvedCapabilityState || action.capability?.state || "UNKNOWN",
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
    title: input.success ? `Bridge-Aktion ausgeführt: ${humanActionTitle(action.type)}` : `Bridge-Aktion fehlgeschlagen: ${humanActionTitle(action.type)}`,
    source: "IOBROKER",
    role: "SYSTEM",
    details: input.success ? { actionTitle: humanActionTitle(action.type), actionType: action.type, ...jsonObject(input.result) } : { actionTitle: humanActionTitle(action.type), actionType: action.type, error: input.error || "bridge_action_failed" },
    raw: { result: input.result || null, deviceState: input.deviceState || null, capabilityState: resolvedCapabilityState || null },
    correlationId: action.correlationId
  });
  if (action.capabilityId && isSwitchAction(action.type)) {
    const switchEvent = input.success ? switchEventForState(resolvedCapabilityState) : { type: "switch_error", title: "Schalter meldet einen Fehler" };
    if (switchEvent) {
      await recordAutomationEvent({
        tenantId: input.tenantId,
        sessionId: action.sessionId,
        actionId: action.id,
        actorId: action.actorId,
        deviceId: action.deviceId,
        capabilityId: action.capabilityId,
        type: switchEvent.type,
        title: switchEvent.title,
        source: "IOBROKER",
        role: "SYSTEM",
        details: input.success
          ? { actionTitle: humanActionTitle(action.type), actionType: action.type, capabilityState: resolvedCapabilityState }
          : { actionTitle: humanActionTitle(action.type), actionType: action.type, error: input.error || "bridge_action_failed" },
        raw: { result: input.result || null, deviceState: input.deviceState || null, capabilityState: resolvedCapabilityState || null },
        correlationId: action.correlationId
      });
    }
  }
  if (action.capabilityId && isVoiceAction(action.type)) {
    const voiceEvent = voiceEventForResult(input.success);
    await recordAutomationEvent({
      tenantId: input.tenantId,
      sessionId: action.sessionId,
      actionId: action.id,
      actorId: action.actorId,
      deviceId: action.deviceId,
      capabilityId: action.capabilityId,
      type: voiceEvent.type,
      title: voiceEvent.title,
      source: "IOBROKER",
      role: "SYSTEM",
      details: input.success
        ? { actionTitle: humanActionTitle(action.type), actionType: action.type, capabilityState: resolvedCapabilityState }
        : { actionTitle: humanActionTitle(action.type), actionType: action.type, error: input.error || "bridge_action_failed" },
      raw: { result: input.result || null, deviceState: input.deviceState || null, capabilityState: resolvedCapabilityState || null },
      correlationId: action.correlationId
    });
  }
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
      title: "Kamera-Wiederherstellung beendet: keine Wiederholung mehr offen",
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
      reason: "Automatische Kamera-Wiederherstellung"
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
    title: `Kamera-Wiederherstellung geplant: Versuch ${nextRetry} von ${maxRetries}`,
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
  if (ruleTrigger === "session_finished" && eventType === "session_finished") return true;
  if (ruleTrigger === "action_succeeded" && eventType === "action_succeeded") return true;
  if (ruleTrigger === "action_failed" && eventType === "action_failed") return true;
  if (ruleTrigger === "image_uploaded" && eventType === "image_uploaded") return true;
  if (ruleTrigger === "camera_online" && eventType === "camera_online") return true;
  if (ruleTrigger === "camera_offline" && eventType === "camera_offline") return true;
  if (ruleTrigger === "switched_on" && eventType === "switched_on") return true;
  if (ruleTrigger === "switched_off" && eventType === "switched_off") return true;
  if (ruleTrigger === "switch_error" && eventType === "switch_error") return true;
  if (ruleTrigger === "speech_started" && eventType === "speech_started") return true;
  if (ruleTrigger === "speech_finished" && eventType === "speech_finished") return true;
  if (ruleTrigger === "voice_error" && eventType === "voice_error") return true;
  if (ruleTrigger === "capability_event" && eventType === "capability_event") return true;
  if (ruleTrigger === "device_state_changed" && eventType === "device_state_changed") return true;
  if (ruleTrigger === "quota_open" && eventType === "quota_open") return true;
  if (ruleTrigger === "event_absent" && ["session_started", "session_pending_end", "session_finished", "action_succeeded", "action_failed", "image_uploaded", "camera_online", "camera_offline", "switched_on", "switched_off", "switch_error", "speech_started", "speech_finished", "voice_error", "capability_event", "device_state_changed", "quota_open"].includes(eventType)) return true;
  return false;
}

function triggerTargetMatches(triggerJson: unknown, event: { deviceId?: string | null; capabilityId?: string | null }) {
  const trigger = asRecord(triggerJson);
  const deviceId = clean(trigger.deviceId);
  const capabilityId = clean(trigger.capabilityId);
  if (deviceId && deviceId !== event.deviceId) return false;
  if (capabilityId && capabilityId !== event.capabilityId) return false;
  return true;
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
  if (type === "last_image_younger_than") {
    const conditionCapabilityId = clean(condition.capabilityId);
    const capabilityId = conditionCapabilityId || input.capabilityId;
    if (!capabilityId) return { passed: false, reason: "Keine Kamera ausgewählt" };
    const maxAgeSeconds = Math.max(1, numberFromPayload(condition, "maxAgeSeconds", numberFromPayload(condition, "seconds", 300)));
    const capability = await prisma.automationCapability.findFirst({
      where: { id: capabilityId, tenantId: input.tenantId },
      select: { kind: true, title: true, device: { select: { name: true } } }
    });
    if (!capability) return { passed: false, reason: "Kamera ist auf dieser Seite nicht verfügbar" };
    if (capability.kind !== "Camera") return { passed: false, reason: "Die gewählte Fähigkeit ist keine Kamera" };
    const threshold = new Date(Date.now() - maxAgeSeconds * 1000);
    const latestImage = await prisma.automationImageRequest.findFirst({
      where: {
        tenantId: input.tenantId,
        capabilityId,
        status: "UPLOADED",
        fileId: { not: null },
        uploadedAt: { not: null }
      },
      orderBy: { uploadedAt: "desc" },
      select: { uploadedAt: true }
    });
    const passed = Boolean(latestImage?.uploadedAt && latestImage.uploadedAt >= threshold);
    const cameraName = `${capability.device?.name || "Gerät"} · ${capability.title || "Kamera"}`;
    return {
      passed,
      reason: passed
        ? `${cameraName} hat ein aktuelles Bild`
        : latestImage?.uploadedAt
          ? `${cameraName} hat kein Bild jünger als ${maxAgeSeconds} Sekunden`
          : `${cameraName} hat noch kein empfangenes Bild`
    };
  }
  if (type === "switch_state_for") {
    const conditionCapabilityId = clean(condition.capabilityId);
    const capabilityId = conditionCapabilityId || input.capabilityId;
    if (!capabilityId) return { passed: false, reason: "Kein Schalter ausgewählt" };
    const expected = clean(condition.state || condition.expected || condition.value);
    if (!["ON", "OFF"].includes(expected)) return { passed: false, reason: "Kein gültiger Schaltzustand ausgewählt" };
    const requiredMinutes = Math.max(1, numberFromPayload(condition, "minutes", numberFromPayload(condition, "stateAgeMinutes", 5)));
    const capability = await prisma.automationCapability.findFirst({
      where: { id: capabilityId, tenantId: input.tenantId },
      select: { kind: true, title: true, state: true, updatedAt: true, device: { select: { name: true } } }
    });
    if (!capability) return { passed: false, reason: "Schalter ist auf dieser Seite nicht verfügbar" };
    if (capability.kind !== "Switch") return { passed: false, reason: "Die gewählte Fähigkeit ist kein Schalter" };
    const threshold = new Date(Date.now() - requiredMinutes * 60_000);
    const passed = capability.state === expected && capability.updatedAt <= threshold;
    const switchName = `${capability.device?.name || "Gerät"} · ${capability.title || "Schalter"}`;
    return {
      passed,
      reason: passed
        ? `${switchName} ist seit mindestens ${requiredMinutes} Minuten ${expected === "ON" ? "eingeschaltet" : "ausgeschaltet"}`
        : capability.state === expected
          ? `${switchName} ist noch nicht lange genug ${expected === "ON" ? "eingeschaltet" : "ausgeschaltet"}`
          : `${switchName} ist aktuell nicht ${expected === "ON" ? "eingeschaltet" : "ausgeschaltet"}`
    };
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
  for (const rule of rules.filter((item) => triggerMatches(item.triggerType, event.type) && triggerTargetMatches(item.triggerJson, event))) {
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
  triggerJson?: unknown;
  conditionJson?: unknown;
  timingJson?: unknown;
  actionJson?: unknown;
  startAt?: Date;
  scrubMinute?: number;
  controllerActionMinute?: number | null;
}, context?: Parameters<typeof simulateAutomationRuleTimeline>[1]) {
  return simulateAutomationRuleTimeline(input, context);
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
  const session = await prisma.automationSession.findFirst({ where: { id: input.sessionId, tenantId: input.user.tenantId } });
  if (!session) throw new Error("session_not_found");
  const access = await automationSessionAccess(input.user, session);
  if (!access.canRequestImage) throw new Error("automation_action_not_allowed");
  const requestId = correlationId("img");
  const action = await createAutomationAction({
    tenantId: input.user.tenantId,
    sessionId: session.id,
    actorId: input.user.id,
    type: "camera_request_image",
    source: "SYSTEM",
    role: access.role || "OWNER",
    deviceId: input.deviceId || null,
    capabilityId: input.capabilityId || null,
    payload: {
      requestId,
      reason: input.reason || null,
      maxRetries: 2,
      retryCount: 0,
      timeoutSeconds: 20,
      bootDelaySeconds: 20,
      policy: { role: access.role, reason: access.reason, action: "camera_request_image", state: session.state, allowed: true }
    },
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
    role: access.role || "OWNER",
    details: { requestId, policy: { role: access.role, reason: access.reason, action: "camera_request_image", state: session.state, allowed: true } },
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
