import type { ScheduledRule } from "@prisma/client";
import { logAction, userDisplayName } from "@/lib/audit";
import { formatMinutes } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { actionLabel } from "@/lib/notification-actions";
import { quotaSummaryText, trackerQuotaStatusForUser } from "@/lib/tracker-quotas";
import { effectivePlayReadyState, nextPlayReadyState, normalizePlayReadyState, playReadyColorLabel, playReadyLabel, playReadyStateToBoolean } from "@/lib/play-ready";

const defaultTimezone = "Europe/Berlin";

type RuleOwner = NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>> & {
  settings?: { playReady?: boolean | null; playReadyState?: string | null; playReadyExpiryMinutes?: number | null } | null;
  profile?: { displayName?: string | null } | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringValue(value: unknown, fallback = "") {
  return value == null ? fallback : String(value);
}

function zonedDateKey(date: Date, timezone = defaultTimezone) {
  return new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: timezone }).format(date);
}

function zonedWeekday(date: Date, timezone = defaultTimezone) {
  const value = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: timezone }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value);
}

function zonedDayOfMonth(date: Date, timezone = defaultTimezone) {
  return Number(new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: timezone }).format(date));
}

function localMinutes(date: Date, timezone = defaultTimezone) {
  const parts = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timezone }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value || "0");
  return hour * 60 + minute;
}

function nextRunFrom(rule: Pick<ScheduledRule, "scheduleType" | "timeOfDayMinutes" | "daysOfWeek" | "dayOfMonth" | "intervalMinutes" | "timezone">, from = new Date()) {
  if (rule.scheduleType === "INTERVAL") {
    return new Date(from.getTime() + Math.max(15, rule.intervalMinutes || 15) * 60_000);
  }
  const timezone = rule.timezone || defaultTimezone;
  const targetMinutes = rule.timeOfDayMinutes || 960;
  for (let offset = 0; offset <= 370; offset += 1) {
    const candidate = new Date(from.getTime() + offset * 24 * 60 * 60_000);
    if (rule.scheduleType === "WEEKLY" && rule.daysOfWeek.length && !rule.daysOfWeek.includes(zonedWeekday(candidate, timezone))) continue;
    if (rule.scheduleType === "MONTHLY" && rule.dayOfMonth && zonedDayOfMonth(candidate, timezone) !== rule.dayOfMonth) continue;
    if (offset === 0 && localMinutes(from, timezone) >= targetMinutes) continue;
    const currentMinutes = localMinutes(candidate, timezone);
    return new Date(candidate.getTime() + (targetMinutes - currentMinutes) * 60_000);
  }
  return new Date(from.getTime() + 24 * 60 * 60_000);
}

export function initialNextRun(input: Pick<ScheduledRule, "scheduleType" | "timeOfDayMinutes" | "daysOfWeek" | "dayOfMonth" | "intervalMinutes" | "timezone">) {
  return nextRunFrom(input);
}

async function conditionResult(rule: ScheduledRule, owner: RuleOwner) {
  const condition = asRecord(rule.conditionJson);
  if (rule.conditionType === "ALWAYS") return { met: true, message: "Immer ausführen", details: {} };
  if (rule.conditionType === "PLAY_READY_IS") {
    const expected = normalizePlayReadyState(condition.state, "green");
    const settings = await prisma.userSettings.findUnique({ where: { userId: owner.id } });
    const actual = effectivePlayReadyState(settings);
    return { met: actual === expected, message: `Ampel ist ${playReadyColorLabel(actual).toLowerCase()}`, details: { expected, actual } };
  }
  if (rule.conditionType === "TRACKER_OPEN") {
    const trackerKey = stringValue(condition.trackerKey);
    const open = await prisma.trackerEntry.findFirst({
      where: {
        tenantId: rule.tenantId,
        ownerId: owner.id,
        endTime: null,
        allDay: false,
        ...(trackerKey ? { trackerType: { key: trackerKey } } : {})
      },
      include: { trackerType: true }
    });
    return { met: Boolean(open), message: open ? `${open.trackerType.title} läuft` : "Kein laufender Tracker", details: { trackerKey, openId: open?.id || null } };
  }
  if (rule.conditionType === "TRACKER_QUOTA_OPEN" || rule.conditionType === "TRACKER_QUOTA_DONE") {
    const trackerKey = stringValue(condition.trackerKey);
    const statuses = await trackerQuotaStatusForUser(owner);
    const relevant = trackerKey ? statuses.filter((status) => status.tracker.key === trackerKey) : statuses;
    const open = relevant.find((status) => status.hasQuota && !status.complete);
    const done = relevant.find((status) => status.hasQuota && status.complete);
    const met = rule.conditionType === "TRACKER_QUOTA_OPEN" ? Boolean(open) : Boolean(done);
    const picked = open || done || relevant[0];
    return {
      met,
      message: picked ? quotaSummaryText(picked) : "Kein Kontingent gefunden",
      details: { trackerKey, summary: picked ? quotaSummaryText(picked) : "" }
    };
  }
  if (rule.conditionType === "AUDIT_ACTION") {
    const action = stringValue(condition.action);
    const lookbackMinutes = Math.max(15, numberValue(condition.lookbackMinutes, 1440));
    const actorMode = stringValue(condition.actorMode, "owner");
    const count = action
      ? await prisma.auditLog.count({
          where: {
            action,
            createdAt: { gte: new Date(Date.now() - lookbackMinutes * 60_000) },
            ...(actorMode === "owner" ? { actorId: owner.id } : {})
          }
        })
      : 0;
    return { met: count > 0, message: `${count} passende Protokolleinträge für ${actionLabel(action)}`, details: { action, lookbackMinutes, actorMode, count } };
  }
  return { met: false, message: "Unbekannte Bedingung", details: { conditionType: rule.conditionType } };
}

function renderTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => values[key] ?? "");
}

function parseHeaders(value: unknown) {
  const data = asRecord(value);
  return Object.fromEntries(Object.entries(data).map(([key, headerValue]) => [key, String(headerValue)]));
}

async function executeAction(rule: ScheduledRule, owner: RuleOwner, condition: Awaited<ReturnType<typeof conditionResult>>) {
  const action = asRecord(rule.actionJson);
  const values = {
    ruleName: rule.name,
    actor: userDisplayName(owner),
    condition: condition.message,
    tenantId: rule.tenantId,
    userId: owner.id
  };
  if (rule.actionType === "SET_PLAY_READY") {
    const state = stringValue(action.state, "green");
    const current = effectivePlayReadyState(owner.settings);
    const next = state === "toggle" ? nextPlayReadyState(current) : normalizePlayReadyState(state, "green");
    const nextReady = playReadyStateToBoolean(next);
    const expiryMinutes = owner.settings?.playReadyExpiryMinutes || 360;
    const tenant = await prisma.tenant.findUnique({ where: { id: rule.tenantId }, select: { playReadyExpiryEnabled: true } });
    const expiresAt = next === "green" && tenant?.playReadyExpiryEnabled !== false ? new Date(Date.now() + expiryMinutes * 60_000) : null;
    await prisma.userSettings.upsert({
      where: { userId: owner.id },
      update: { playReady: nextReady, playReadyState: next, playReadyUpdatedAt: new Date(), playReadyExpiresAt: expiresAt, playReadyExpiryMinutes: expiryMinutes },
      create: { userId: owner.id, playReady: nextReady, playReadyState: next, playReadyUpdatedAt: new Date(), playReadyExpiresAt: expiresAt, playReadyExpiryMinutes: expiryMinutes }
    });
    await logAction({
      actorId: owner.id,
      action: "scheduled_rule_executed",
      entityType: "scheduledRule",
      entityId: rule.id,
      title: `Zeitregel ausgeführt: ${rule.name}`,
      href: "/settings/scheduled",
      details: { actionType: rule.actionType, playReady: nextReady, playReadyState: next, label: playReadyLabel(next), expiresAt: expiresAt?.toISOString() || null, condition: condition.message }
    });
    return { status: "SENT", message: `Ampel auf ${playReadyColorLabel(next).toLowerCase()} gesetzt`, details: { playReady: nextReady, playReadyState: next, expiresAt } };
  }
  if (rule.actionType === "CREATE_AUDIT") {
    const auditAction = stringValue(action.action, "scheduled_rule_executed");
    const title = renderTemplate(stringValue(action.title, `Zeitregel ausgeführt: ${rule.name}`), values);
    await logAction({
      actorId: owner.id,
      action: auditAction,
      entityType: "scheduledRule",
      entityId: rule.id,
      title,
      href: stringValue(action.href, "/settings/scheduled"),
      details: { condition: condition.message, scheduledRuleId: rule.id }
    });
    return { status: "SENT", message: title, details: { auditAction } };
  }
  const url = renderTemplate(stringValue(action.url), values);
  const method = stringValue(action.method, "POST").toUpperCase();
  const payload = renderTemplate(stringValue(action.payloadTemplate, "{\"rule\":\"{ruleName}\",\"condition\":\"{condition}\",\"actor\":\"{actor}\"}"), values);
  if (!url) return { status: "FAILED", message: "Keine URL konfiguriert", details: {} };
  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...parseHeaders(action.headersJson) },
      body: method === "GET" ? undefined : payload
    });
    const text = response.ok ? "" : (await response.text().catch(() => "")).slice(0, 1000);
    await prisma.externalPushLog.create({
      data: {
        tenantId: rule.tenantId,
        action: "scheduled_rule_executed",
        url,
        status: response.ok ? "SENT" : "FAILED",
        statusCode: response.status,
        error: response.ok ? null : text
      }
    });
    await logAction({
      actorId: owner.id,
      action: response.ok ? "scheduled_rule_executed" : "scheduled_rule_failed",
      entityType: "scheduledRule",
      entityId: rule.id,
      title: response.ok ? `Zeitregel ausgeführt: ${rule.name}` : `Zeitregel fehlgeschlagen: ${rule.name}`,
      href: "/settings/scheduled",
      details: { url, method, statusCode: response.status, payload: payload.slice(0, 2000), condition: condition.message, error: text }
    });
    return { status: response.ok ? "SENT" : "FAILED", message: response.ok ? "URL aufgerufen" : text || `HTTP ${response.status}`, details: { url, method, statusCode: response.status } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    await prisma.externalPushLog.create({ data: { tenantId: rule.tenantId, action: "scheduled_rule_executed", url, status: "FAILED", error: message.slice(0, 1000) } });
    await logAction({
      actorId: owner.id,
      action: "scheduled_rule_failed",
      entityType: "scheduledRule",
      entityId: rule.id,
      title: `Zeitregel fehlgeschlagen: ${rule.name}`,
      href: "/settings/scheduled",
      details: { url, method, error: message, payload: payload.slice(0, 2000), condition: condition.message }
    });
    return { status: "FAILED", message, details: { url, method } };
  }
}

export async function runDueScheduledRules(now = new Date()) {
  const rules = await prisma.scheduledRule.findMany({
    where: { active: true, nextRunAt: { lte: now } },
    include: { owner: { include: { profile: true, settings: true } } },
    orderBy: { nextRunAt: "asc" },
    take: 50
  });
  let executed = 0;
  for (const rule of rules) {
    const nextRunAt = nextRunFrom(rule, now);
    const condition = await conditionResult(rule, rule.owner);
    if (!condition.met) {
      await prisma.$transaction([
        prisma.scheduledRuleRun.create({ data: { tenantId: rule.tenantId, ruleId: rule.id, status: "SKIPPED", conditionMet: false, message: condition.message, details: condition.details } }),
        prisma.scheduledRule.update({ where: { id: rule.id }, data: { lastRunAt: now, lastStatus: "SKIPPED", lastMessage: condition.message, nextRunAt } })
      ]);
      await logAction({
        actorId: rule.ownerId,
        action: "scheduled_rule_skipped",
        entityType: "scheduledRule",
        entityId: rule.id,
        title: `Zeitregel übersprungen: ${rule.name}`,
        href: "/settings/scheduled",
        details: { condition: condition.message }
      });
      continue;
    }
    const result = await executeAction(rule, rule.owner, condition);
    await prisma.$transaction([
      prisma.scheduledRuleRun.create({ data: { tenantId: rule.tenantId, ruleId: rule.id, status: result.status, conditionMet: true, message: result.message, details: result.details } }),
      prisma.scheduledRule.update({ where: { id: rule.id }, data: { lastRunAt: now, lastStatus: result.status, lastMessage: result.message, nextRunAt } })
    ]);
    executed += 1;
  }
  return { checked: rules.length, executed };
}

export function scheduleSummary(rule: Pick<ScheduledRule, "scheduleType" | "timeOfDayMinutes" | "daysOfWeek" | "dayOfMonth" | "intervalMinutes">) {
  if (rule.scheduleType === "INTERVAL") return `alle ${formatMinutes(rule.intervalMinutes || 15)}`;
  const hour = Math.floor((rule.timeOfDayMinutes || 0) / 60);
  const minute = (rule.timeOfDayMinutes || 0) % 60;
  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  if (rule.scheduleType === "WEEKLY") return `wöchentlich ${time}`;
  if (rule.scheduleType === "MONTHLY") return `monatlich am ${rule.dayOfMonth || 1}. um ${time}`;
  return `täglich ${time}`;
}
