import { actionLabels, labelAutomationValue, knownAutomationLabel, type AutomationActionKey } from "@/lib/automation-rule-model";
import { externalFileUrl, displayName } from "@/lib/external-mobile-serializers";

function iso(value?: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function actionLabel(type?: string | null) {
  return actionLabels[type as AutomationActionKey] || "Unbekannte Aktion";
}

function actorSummary(actor?: { id?: string | null; username?: string | null; email?: string | null; name?: string | null; profile?: { displayName?: string | null } | null } | null) {
  if (!actor?.id) return null;
  return {
    id: actor.id,
    username: actor.username || null,
    displayName: displayName(actor)
  };
}

function deviceSummary(device?: { id?: string | null; name?: string | null; integration?: string | null; health?: string | null } | null) {
  if (!device?.id) return null;
  return {
    id: device.id,
    name: device.name || "Unbekanntes Gerät",
    integration: device.integration || null,
    integrationLabel: labelAutomationValue("integrations", device.integration),
    health: device.health || null,
    healthLabel: labelAutomationValue("health", device.health)
  };
}

function capabilitySummary(capability?: { id?: string | null; key?: string | null; kind?: string | null; title?: string | null; state?: string | null; device?: { name?: string | null } | null } | null) {
  if (!capability?.id) return null;
  return {
    id: capability.id,
    key: capability.key || null,
    kind: capability.kind || null,
    kindLabel: labelAutomationValue("capabilityKinds", capability.kind),
    title: capability.title || "Unbekannte Fähigkeit",
    deviceName: capability.device?.name || null,
    state: capability.state || null,
    stateLabel: labelAutomationValue("health", capability.state)
  };
}

export function serializeAutomationAction(action: {
  id: string;
  type: string;
  status: string;
  source?: string | null;
  role?: string | null;
  dueAt?: Date | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  device?: { id?: string | null; name?: string | null; integration?: string | null; health?: string | null } | null;
  capability?: { id?: string | null; key?: string | null; kind?: string | null; title?: string | null; state?: string | null; device?: { name?: string | null } | null } | null;
  timingJson?: unknown;
  payloadJson?: unknown;
  resultJson?: unknown;
  error?: string | null;
  correlationId?: string | null;
}) {
  return {
    id: action.id,
    type: action.type,
    typeLabel: actionLabel(action.type),
    status: action.status,
    statusLabel: labelAutomationValue("actionStatuses", action.status),
    source: action.source || null,
    sourceLabel: labelAutomationValue("sources", action.source),
    role: action.role || null,
    roleLabel: labelAutomationValue("roles", action.role),
    dueAt: iso(action.dueAt),
    startedAt: iso(action.startedAt),
    finishedAt: iso(action.finishedAt),
    createdAt: iso(action.createdAt),
    updatedAt: iso(action.updatedAt),
    device: deviceSummary(action.device),
    capability: capabilitySummary(action.capability),
    error: action.error || null,
    correlationId: action.correlationId || null,
    technicalDetails: {
      timing: action.timingJson ?? {},
      payload: action.payloadJson ?? {},
      result: action.resultJson ?? null
    }
  };
}

export function serializeAutomationImageRequest(request: Request, image: {
  id: string;
  requestId: string;
  status: string;
  reason?: string | null;
  retryCount?: number | null;
  maxRetries?: number | null;
  timeoutSeconds?: number | null;
  bootDelaySeconds?: number | null;
  error?: string | null;
  requestedAt?: Date | null;
  uploadedAt?: Date | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  fileId?: string | null;
  file?: { id?: string | null; mimeType?: string | null; originalName?: string | null; sizeBytes?: number | null } | null;
  device?: { id?: string | null; name?: string | null; integration?: string | null; health?: string | null } | null;
  capability?: { id?: string | null; key?: string | null; kind?: string | null; title?: string | null; state?: string | null; device?: { name?: string | null } | null } | null;
  requester?: { id?: string | null; username?: string | null; email?: string | null; name?: string | null; profile?: { displayName?: string | null } | null } | null;
  metadataJson?: unknown;
}) {
  const fileId = image.fileId || image.file?.id || null;
  const url = fileId ? externalFileUrl(request, fileId) : null;
  return {
    id: image.id,
    requestId: image.requestId,
    status: image.status,
    statusLabel: labelAutomationValue("imageStatuses", image.status),
    reason: image.reason || null,
    retryCount: image.retryCount ?? 0,
    maxRetries: image.maxRetries ?? 0,
    timeoutSeconds: image.timeoutSeconds ?? null,
    bootDelaySeconds: image.bootDelaySeconds ?? null,
    error: image.error || null,
    requestedAt: iso(image.requestedAt),
    uploadedAt: iso(image.uploadedAt),
    createdAt: iso(image.createdAt),
    updatedAt: iso(image.updatedAt),
    requester: actorSummary(image.requester),
    device: deviceSummary(image.device),
    capability: capabilitySummary(image.capability),
    file: fileId ? {
      id: fileId,
      fileId,
      url,
      downloadUrl: url,
      requiresAuthorization: true,
      mimeType: image.file?.mimeType || null,
      originalName: image.file?.originalName || null,
      sizeBytes: image.file?.sizeBytes || null
    } : null,
    technicalDetails: {
      metadata: image.metadataJson ?? {}
    }
  };
}

export function serializeAutomationEvent(event: {
  id: string;
  type: string;
  title: string;
  source?: string | null;
  role?: string | null;
  createdAt?: Date | null;
  correlationId?: string | null;
  sessionId?: string | null;
  ruleId?: string | null;
  ruleVersionId?: string | null;
  actionId?: string | null;
  contextId?: string | null;
  parentEventId?: string | null;
  detailsJson?: unknown;
  rawJson?: unknown;
  actor?: { id?: string | null; username?: string | null; email?: string | null; name?: string | null; profile?: { displayName?: string | null } | null } | null;
  device?: { id?: string | null; name?: string | null; integration?: string | null; health?: string | null } | null;
  capability?: { id?: string | null; key?: string | null; kind?: string | null; title?: string | null; state?: string | null; device?: { name?: string | null } | null } | null;
}) {
  const typeLabel = knownAutomationLabel("eventTypes", event.type) || event.title || "Unbekanntes Ereignis";
  return {
    id: event.id,
    type: event.type,
    typeLabel,
    title: event.title || typeLabel,
    source: event.source || null,
    sourceLabel: labelAutomationValue("sources", event.source),
    role: event.role || null,
    roleLabel: labelAutomationValue("roles", event.role),
    createdAt: iso(event.createdAt),
    actor: actorSummary(event.actor),
    device: deviceSummary(event.device),
    capability: capabilitySummary(event.capability),
    correlationId: event.correlationId || null,
    summary: `${typeLabel}${event.device?.name ? ` · ${event.device.name}` : ""}${event.capability?.title ? ` · ${event.capability.title}` : ""}`,
    technicalDetails: {
      sessionId: event.sessionId || null,
      ruleId: event.ruleId || null,
      ruleVersionId: event.ruleVersionId || null,
      actionId: event.actionId || null,
      contextId: event.contextId || null,
      parentEventId: event.parentEventId || null,
      details: event.detailsJson ?? {},
      raw: event.rawJson ?? {}
    }
  };
}

export function serializeAutomationSession(request: Request, session: {
  id: string;
  slug?: string | null;
  title: string;
  state: string;
  source?: string | null;
  role?: string | null;
  correlationId?: string | null;
  startedAt?: Date | null;
  pendingEndAt?: Date | null;
  finishedAt?: Date | null;
  cancelledAt?: Date | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  notes?: string | null;
  stateJson?: unknown;
  metadataJson?: unknown;
  trackerType?: { id: string; key?: string | null; title: string; color?: string | null } | null;
  trackerEntry?: { id: string; slug?: string | null; startTime?: Date | null; endTime?: Date | null; durationMinutes?: number | null; allDay?: boolean | null } | null;
  actions?: Array<Parameters<typeof serializeAutomationAction>[0]>;
  events?: Array<Parameters<typeof serializeAutomationEvent>[0]>;
  imageRequests?: Array<Parameters<typeof serializeAutomationImageRequest>[1]>;
}) {
  const stateDetails = asRecord(session.stateJson);
  const pendingEnd = session.pendingEndAt ? {
    requestedAt: typeof stateDetails.pendingEndRequestedAt === "string" ? stateDetails.pendingEndRequestedAt : null,
    requestedBy: typeof stateDetails.pendingEndRequestedBy === "string" ? stateDetails.pendingEndRequestedBy : null,
    dueAt: iso(session.pendingEndAt),
    timing: stateDetails.pendingEndTiming || null,
    reason: typeof stateDetails.pendingEndReason === "string" ? stateDetails.pendingEndReason : null
  } : null;
  const href = `/automation/sessions/${session.id}`;
  return {
    id: session.id,
    slug: session.slug || null,
    title: session.title,
    state: session.state,
    stateLabel: labelAutomationValue("states", session.state),
    source: session.source || null,
    sourceLabel: labelAutomationValue("sources", session.source),
    role: session.role || null,
    roleLabel: labelAutomationValue("roles", session.role),
    correlationId: session.correlationId || null,
    startedAt: iso(session.startedAt),
    pendingEndAt: iso(session.pendingEndAt),
    pendingEnd,
    finishedAt: iso(session.finishedAt),
    cancelledAt: iso(session.cancelledAt),
    createdAt: iso(session.createdAt),
    updatedAt: iso(session.updatedAt),
    notes: session.notes || null,
    href,
    url: new URL(href, request.url).toString(),
    tracker: session.trackerType ? {
      id: session.trackerType.id,
      key: session.trackerType.key || null,
      title: session.trackerType.title,
      color: session.trackerType.color || null
    } : null,
    trackerEntry: session.trackerEntry ? {
      id: session.trackerEntry.id,
      slug: session.trackerEntry.slug || null,
      startTime: iso(session.trackerEntry.startTime),
      endTime: iso(session.trackerEntry.endTime),
      durationMinutes: session.trackerEntry.durationMinutes ?? null,
      allDay: Boolean(session.trackerEntry.allDay)
    } : null,
    actions: (session.actions || []).map(serializeAutomationAction),
    events: (session.events || []).map(serializeAutomationEvent),
    imageRequests: (session.imageRequests || []).map((image) => serializeAutomationImageRequest(request, image)),
    technicalDetails: {
      state: session.stateJson ?? {},
      metadata: session.metadataJson ?? {}
    }
  };
}
