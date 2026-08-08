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
