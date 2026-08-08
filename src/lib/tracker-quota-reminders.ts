import { appTimeZone } from "./dates";
import type { TrackerReminderSchedule } from "./external-tracker-types";

type Progress = { required: number; complete: boolean };

export type ReminderQuotaStatus = {
  daily: Progress;
  weekly: Progress;
  weekStartsOn: number;
  monthlyMinutes: Progress;
  monthlyDays: Progress;
  periods: {
    daily: { key: string };
    weekly: { key: string };
    monthly: { key: string };
  };
};

export type TrackerQuotaReminderDecision = {
  period: "daily" | "weekly" | "monthly";
  periodKey: string;
  repeatMinutes: number;
};

function zonedParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
    timeZone: appTimeZone
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "0";
  return {
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value("weekday")),
    dayOfMonth: Number(value("day")),
    minutes: Number(value("hour")) * 60 + Number(value("minute"))
  };
}

function isLastLocalDayOfMonth(date: Date) {
  const today = new Intl.DateTimeFormat("en-US", { month: "numeric", timeZone: appTimeZone }).format(date);
  const tomorrow = new Intl.DateTimeFormat("en-US", { month: "numeric", timeZone: appTimeZone })
    .format(new Date(date.getTime() + 24 * 60 * 60_000));
  return today !== tomorrow;
}

function isOrdinalWeekday(date: Date, dayOfMonth: number, ordinal: number) {
  if (ordinal >= 1 && ordinal <= 4) return Math.floor((dayOfMonth - 1) / 7) + 1 === ordinal;
  if (ordinal !== 5) return false;
  const nextWeek = new Date(date.getTime() + 7 * 24 * 60 * 60_000);
  const currentMonth = new Intl.DateTimeFormat("en-US", { month: "numeric", timeZone: appTimeZone }).format(date);
  const nextMonth = new Intl.DateTimeFormat("en-US", { month: "numeric", timeZone: appTimeZone }).format(nextWeek);
  return currentMonth !== nextMonth;
}

function occursOnDayOffset(dayOffset: number, repeatMinutes: number) {
  if (dayOffset < 0) return false;
  if (repeatMinutes < 1440) return dayOffset === 0;
  return dayOffset % (repeatMinutes / 1440) === 0;
}

export function trackerQuotaReminderDecisions(
  status: ReminderQuotaStatus,
  schedule: TrackerReminderSchedule,
  now = new Date()
): TrackerQuotaReminderDecision[] {
  const local = zonedParts(now);
  const decisions: TrackerQuotaReminderDecision[] = [];
  const weekDayOffset =
    (local.weekday - status.weekStartsOn + 7) % 7 -
    ((schedule.weekly.weekday ?? 0) - status.weekStartsOn + 7) % 7;

  if (
    schedule.daily.enabled &&
    status.daily.required > 0 &&
    !status.daily.complete &&
    local.minutes >= schedule.daily.startMinutes
  ) {
    decisions.push({ period: "daily", periodKey: status.periods.daily.key, repeatMinutes: schedule.daily.repeatMinutes });
  }

  if (
    schedule.weekly.enabled &&
    status.weekly.required > 0 &&
    !status.weekly.complete &&
    ((schedule.weekly.weekdays?.length ?? 0) > 0
      ? schedule.weekly.weekdays!.includes(local.weekday)
      : occursOnDayOffset(weekDayOffset, schedule.weekly.repeatMinutes)) &&
    local.minutes >= schedule.weekly.startMinutes
  ) {
    decisions.push({ period: "weekly", periodKey: status.periods.weekly.key, repeatMinutes: schedule.weekly.repeatMinutes });
  }

  const monthlyOpen =
    (status.monthlyMinutes.required > 0 && !status.monthlyMinutes.complete) ||
    (status.monthlyDays.required > 0 && !status.monthlyDays.complete);
  const monthlyDayMatches = (schedule.monthly.monthlyOrdinal ?? 0) > 0
    ? local.weekday === schedule.monthly.monthlyWeekday && isOrdinalWeekday(now, local.dayOfMonth, schedule.monthly.monthlyOrdinal ?? 0)
    : schedule.monthly.dayOfMonth === 0
      ? isLastLocalDayOfMonth(now)
      : occursOnDayOffset(local.dayOfMonth - (schedule.monthly.dayOfMonth ?? 1), schedule.monthly.repeatMinutes);
  if (
    schedule.monthly.enabled &&
    monthlyOpen &&
    monthlyDayMatches &&
    local.minutes >= schedule.monthly.startMinutes
  ) {
    decisions.push({ period: "monthly", periodKey: status.periods.monthly.key, repeatMinutes: schedule.monthly.repeatMinutes });
  }

  return decisions;
}
