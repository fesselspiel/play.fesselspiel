import type { Prisma } from "@prisma/client";
import { slugify } from "@/lib/slug";

export type TrackerTypeWithCount = Prisma.TrackerTypeGetPayload<{
  include: { _count: { select: { entries: true } } };
}>;

export function canManageTrackerTypes(user: { role?: string | null; tenantId?: string | null }) {
  return Boolean(user.tenantId && (user.role === "ADMIN" || user.role === "SUPER_ADMIN"));
}

export function normalizeTrackerKey(value: unknown) {
  return slugify(String(value || "")).replace(/-/g, "_").slice(0, 40);
}

function nullableInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function booleanValue(value: unknown, fallback: boolean) {
  if (value === undefined) return fallback;
  return value === true || value === "true" || value === "1" || value === 1 || value === "on";
}

export const trackerReminderIntervals = [60, 180, 360, 720, 1440] as const;

export type TrackerReminderRule = {
  enabled: boolean;
  startMinutes: number;
  repeatMinutes: number;
  weekday?: number;
  dayOfMonth?: number;
};

export type TrackerReminderSchedule = {
  daily: TrackerReminderRule;
  weekly: TrackerReminderRule;
  monthly: TrackerReminderRule;
};

function reminderInterval(value: unknown, fallback: number) {
  const parsed = Number(value);
  return trackerReminderIntervals.includes(parsed as typeof trackerReminderIntervals[number]) ? parsed : fallback;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function minuteOfDay(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(1439, Math.max(0, parsed)) : fallback;
}

export function trackerReminderSchedule(
  value: unknown,
  fallback: {
    enabled?: boolean | null;
    interval?: number | null;
    weekStartsOn?: number | null;
    dailyQuota?: number | null;
    weeklyQuota?: number | null;
    monthlyDaysQuota?: number | null;
    monthlyMinutesQuota?: number | null;
  } = {}
): TrackerReminderSchedule {
  const schedule = objectValue(value);
  const interval = reminderInterval(fallback.interval, 1440);
  const legacyEnabled = fallback.enabled === true;
  const normalizeRule = (key: "daily" | "weekly" | "monthly", defaults: TrackerReminderRule) => {
    const rule = objectValue(schedule[key]);
    return {
      ...defaults,
      enabled: booleanValue(rule.enabled, defaults.enabled),
      startMinutes: minuteOfDay(rule.startMinutes, defaults.startMinutes),
      repeatMinutes: reminderInterval(rule.repeatMinutes, defaults.repeatMinutes)
    };
  };
  const daily = normalizeRule("daily", {
    enabled: legacyEnabled && Boolean(fallback.dailyQuota),
    startMinutes: 1080,
    repeatMinutes: interval
  });
  const weeklyRaw = objectValue(schedule.weekly);
  const weekly = {
    ...normalizeRule("weekly", {
      enabled: legacyEnabled && Boolean(fallback.weeklyQuota),
      startMinutes: 1080,
      repeatMinutes: interval,
      weekday: ((fallback.weekStartsOn ?? 1) + 6) % 7
    }),
    weekday: Math.min(6, Math.max(0, Number(weeklyRaw.weekday ?? ((fallback.weekStartsOn ?? 1) + 6) % 7)))
  };
  const monthlyRaw = objectValue(schedule.monthly);
  const monthly = {
    ...normalizeRule("monthly", {
      enabled: legacyEnabled && Boolean(fallback.monthlyDaysQuota || fallback.monthlyMinutesQuota),
      startMinutes: 1080,
      repeatMinutes: interval,
      dayOfMonth: 0
    }),
    dayOfMonth: Math.min(28, Math.max(0, Number(monthlyRaw.dayOfMonth ?? 0)))
  };
  return { daily, weekly, monthly };
}

export function trackerAllowedUserIds(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.map(String).map((entry) => entry.trim()).filter(Boolean))] : [];
}

export function trackerVisibleToUser(
  tracker: { visibility?: string | null; allowedUserIds?: unknown },
  userId: string
) {
  return tracker.visibility !== "USERS" || trackerAllowedUserIds(tracker.allowedUserIds).includes(userId);
}

export function trackerTypeData(body: Record<string, unknown>, current?: TrackerTypeWithCount) {
  const title = String(body.title ?? current?.title ?? "").trim();
  const color = String(body.color ?? current?.color ?? "#E30613").trim() || "#E30613";
  return {
    title,
    description: String(body.description ?? current?.description ?? "").trim(),
    color,
    enabled: booleanValue(body.enabled, current?.enabled ?? true),
    allowOpenSession: booleanValue(body.allowOpenSession, current?.allowOpenSession ?? true),
    autoCloseOpenSession: booleanValue(body.autoCloseOpenSession, current?.autoCloseOpenSession ?? true),
    quotaDailyMinutes: body.quotaDailyMinutes === undefined ? current?.quotaDailyMinutes ?? null : nullableInteger(body.quotaDailyMinutes),
    quotaWeeklyMinutes: body.quotaWeeklyMinutes === undefined ? current?.quotaWeeklyMinutes ?? null : nullableInteger(body.quotaWeeklyMinutes),
    quotaWeeklyTail: booleanValue(body.quotaWeeklyTail, current?.quotaWeeklyTail ?? false),
    quotaWeekStartsOn: Math.min(6, Math.max(0, Number(body.quotaWeekStartsOn ?? current?.quotaWeekStartsOn ?? 1) || 1)),
    quotaMonthlyDays: body.quotaMonthlyDays === undefined ? current?.quotaMonthlyDays ?? null : nullableInteger(body.quotaMonthlyDays),
    quotaMonthlyMinutes: body.quotaMonthlyMinutes === undefined ? current?.quotaMonthlyMinutes ?? null : nullableInteger(body.quotaMonthlyMinutes),
    quotaReminderEnabled: booleanValue(body.quotaReminderEnabled, current?.quotaReminderEnabled ?? false),
    quotaReminderIntervalMinutes: reminderInterval(
      body.quotaReminderIntervalMinutes,
      current?.quotaReminderIntervalMinutes ?? 1440
    ),
    quotaReminderSchedule: trackerReminderSchedule(
      body.quotaReminderSchedule === undefined ? current?.quotaReminderSchedule : body.quotaReminderSchedule,
      {
        enabled: booleanValue(body.quotaReminderEnabled, current?.quotaReminderEnabled ?? false),
        interval: reminderInterval(body.quotaReminderIntervalMinutes, current?.quotaReminderIntervalMinutes ?? 1440),
        weekStartsOn: Number(body.quotaWeekStartsOn ?? current?.quotaWeekStartsOn ?? 1),
        dailyQuota: body.quotaDailyMinutes === undefined ? current?.quotaDailyMinutes : nullableInteger(body.quotaDailyMinutes),
        weeklyQuota: body.quotaWeeklyMinutes === undefined ? current?.quotaWeeklyMinutes : nullableInteger(body.quotaWeeklyMinutes),
        monthlyDaysQuota: body.quotaMonthlyDays === undefined ? current?.quotaMonthlyDays : nullableInteger(body.quotaMonthlyDays),
        monthlyMinutesQuota: body.quotaMonthlyMinutes === undefined ? current?.quotaMonthlyMinutes : nullableInteger(body.quotaMonthlyMinutes)
      }
    ),
    visibility: body.visibility === "USERS" ? "USERS" : body.visibility === undefined ? current?.visibility ?? "ALL" : "ALL",
    allowedUserIds: body.allowedUserIds === undefined ? trackerAllowedUserIds(current?.allowedUserIds) : trackerAllowedUserIds(body.allowedUserIds)
  };
}

export function serializeTrackerType(
  tracker: TrackerTypeWithCount,
  options: { canEdit: boolean; featureEnabled: boolean }
) {
  return {
    id: tracker.id,
    key: tracker.key,
    title: tracker.title,
    description: tracker.description,
    color: tracker.color,
    icon: tracker.icon,
    enabled: tracker.enabled,
    featureEnabled: options.featureEnabled,
    allowOpenSession: tracker.allowOpenSession,
    autoCloseOpenSession: tracker.autoCloseOpenSession,
    quotaDailyMinutes: tracker.quotaDailyMinutes,
    quotaWeeklyMinutes: tracker.quotaWeeklyMinutes,
    quotaWeeklyTail: tracker.quotaWeeklyTail,
    quotaWeekStartsOn: tracker.quotaWeekStartsOn,
    quotaMonthlyDays: tracker.quotaMonthlyDays,
    quotaMonthlyMinutes: tracker.quotaMonthlyMinutes,
    quotaReminderEnabled: tracker.quotaReminderEnabled,
    quotaReminderIntervalMinutes: tracker.quotaReminderIntervalMinutes,
    quotaReminderSchedule: trackerReminderSchedule(tracker.quotaReminderSchedule, {
      enabled: tracker.quotaReminderEnabled,
      interval: tracker.quotaReminderIntervalMinutes,
      weekStartsOn: tracker.quotaWeekStartsOn,
      dailyQuota: tracker.quotaDailyMinutes,
      weeklyQuota: tracker.quotaWeeklyMinutes,
      monthlyDaysQuota: tracker.quotaMonthlyDays,
      monthlyMinutesQuota: tracker.quotaMonthlyMinutes
    }),
    visibility: tracker.visibility,
    allowedUserIds: trackerAllowedUserIds(tracker.allowedUserIds),
    fields: tracker.fields,
    entryCount: tracker._count.entries,
    permissions: {
      canEdit: options.canEdit,
      canDelete: options.canEdit && tracker._count.entries === 0
    }
  };
}
