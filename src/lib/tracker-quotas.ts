import { prisma } from "@/lib/prisma";

type QuotaUser = { id: string; tenantId?: string | null };
type QuotaTracker = {
  id: string;
  key: string;
  title: string;
  color: string;
  quotaDailyMinutes?: number | null;
  quotaWeeklyMinutes?: number | null;
  quotaWeeklyTail?: boolean | null;
  quotaWeekStartsOn?: number | null;
  quotaMonthlyDays?: number | null;
  quotaMonthlyMinutes?: number | null;
};

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date, startsOn = 1) {
  const start = startOfDay(date);
  const normalizedStartsOn = Math.min(6, Math.max(0, Number(startsOn)));
  const diff = (start.getDay() - normalizedStartsOn + 7) % 7;
  start.setDate(start.getDate() - diff);
  return start;
}

function rollingWeekStart(date: Date) {
  const start = new Date(date);
  start.setDate(start.getDate() - 7);
  return start;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function nextDay(date: Date) {
  const value = startOfDay(date);
  value.setDate(value.getDate() + 1);
  return value;
}

function nextMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function overlapMinutes(startTime: Date, endTime: Date | null, periodStart: Date, periodEnd: Date) {
  const start = Math.max(startTime.getTime(), periodStart.getTime());
  const end = Math.min((endTime || new Date()).getTime(), periodEnd.getTime());
  return Math.max(0, Math.round((end - start) / 60000));
}

function progress(required: number | null | undefined, done: number) {
  const target = Math.max(0, Number(required || 0));
  return {
    required: target,
    done,
    remaining: Math.max(0, target - done),
    percent: target ? Math.min(100, Math.round((done / target) * 100)) : 100,
    complete: !target || done >= target
  };
}

async function completedMinutesForTracker(tracker: QuotaTracker, user: QuotaUser, periodStart: Date, periodEnd: Date) {
  const entries = await prisma.trackerEntry.findMany({
    where: {
      trackerTypeId: tracker.id,
      ownerId: user.id,
      allDay: false,
      startTime: { lt: periodEnd },
      OR: [{ endTime: null }, { endTime: { gte: periodStart } }]
    },
    select: { startTime: true, endTime: true, durationMinutes: true }
  });
  return entries.reduce((sum, entry) => sum + overlapMinutes(entry.startTime, entry.endTime, periodStart, periodEnd), 0);
}

async function completedDaysForTracker(tracker: QuotaTracker, user: QuotaUser, periodStart: Date, periodEnd: Date) {
  const dayKeys = new Set<string>();
  const entries = await prisma.trackerEntry.findMany({
    where: {
      trackerTypeId: tracker.id,
      ownerId: user.id,
      startTime: { gte: periodStart, lt: periodEnd }
    },
    select: { startTime: true }
  });
  entries.forEach((entry) => dayKeys.add(entry.startTime.toISOString().slice(0, 10)));
  return dayKeys.size;
}

export async function trackerQuotaStatusForUser(user: QuotaUser, now = new Date()) {
  const trackers = await prisma.trackerType.findMany({
    where: {
      enabled: true,
      AND: [
        user.tenantId ? { OR: [{ tenantId: user.tenantId }, { tenantId: null }] } : { tenantId: null },
        {
          OR: [
            { quotaDailyMinutes: { not: null } },
            { quotaWeeklyMinutes: { not: null } },
            { quotaMonthlyDays: { not: null } },
            { quotaMonthlyMinutes: { not: null } }
          ]
        }
      ]
    },
    orderBy: { title: "asc" }
  });
  const dayStart = startOfDay(now);
  const monthStart = startOfMonth(now);
  const dayEnd = nextDay(now);
  const monthEnd = nextMonth(now);

  return Promise.all(trackers.map(async (tracker) => {
    const weekStart = tracker.quotaWeeklyTail ? rollingWeekStart(now) : startOfWeek(now, tracker.quotaWeekStartsOn ?? 1);
    const [dailyMinutes, weeklyMinutes, monthlyMinutes, monthlyDays] = await Promise.all([
      completedMinutesForTracker(tracker, user, dayStart, dayEnd),
      completedMinutesForTracker(tracker, user, weekStart, now),
      completedMinutesForTracker(tracker, user, monthStart, monthEnd),
      completedDaysForTracker(tracker, user, monthStart, monthEnd)
    ]);
    const daily = progress(tracker.quotaDailyMinutes, dailyMinutes);
    const weekly = progress(tracker.quotaWeeklyMinutes, weeklyMinutes);
    const monthlyMinutesProgress = progress(tracker.quotaMonthlyMinutes, monthlyMinutes);
    const monthlyDaysProgress = progress(tracker.quotaMonthlyDays, monthlyDays);
    const relevant = [daily, weekly, monthlyMinutesProgress, monthlyDaysProgress].filter((entry) => entry.required > 0);
    return {
      tracker: {
        id: tracker.id,
        key: tracker.key,
        title: tracker.title,
        color: tracker.color,
        colorHex: tracker.color,
        hexColor: tracker.color,
        trackerColor: tracker.color
      },
      daily,
      weekly,
      weeklyMode: tracker.quotaWeeklyTail ? "rolling" : "calendar",
      weekStartsOn: tracker.quotaWeekStartsOn ?? 1,
      periods: {
        daily: { startsAt: dayStart.toISOString(), endsAt: dayEnd.toISOString(), key: dateKey(dayStart) },
        weekly: { startsAt: weekStart.toISOString(), endsAt: now.toISOString(), key: dateKey(weekStart) },
        monthly: { startsAt: monthStart.toISOString(), endsAt: monthEnd.toISOString(), key: dateKey(monthStart) }
      },
      quotaEntityId: `trackerQuota:${user.id}:${tracker.id}:${dateKey(dayStart)}:${dateKey(weekStart)}:${dateKey(monthStart)}`,
      monthlyMinutes: monthlyMinutesProgress,
      monthlyDays: monthlyDaysProgress,
      complete: relevant.length ? relevant.every((entry) => entry.complete) : true,
      hasQuota: relevant.length > 0
    };
  }));
}

export function quotaSummaryText(status: Awaited<ReturnType<typeof trackerQuotaStatusForUser>>[number]) {
  const parts = [];
  if (status.daily.required) parts.push(`heute ${status.daily.done}/${status.daily.required} Min.`);
  if (status.weekly.required) parts.push(`Woche ${status.weekly.done}/${status.weekly.required} Min.`);
  if (status.monthlyDays.required) parts.push(`Monat ${status.monthlyDays.done}/${status.monthlyDays.required} Tage`);
  if (status.monthlyMinutes.required) parts.push(`Monat ${status.monthlyMinutes.done}/${status.monthlyMinutes.required} Min.`);
  return parts.join(" · ");
}
