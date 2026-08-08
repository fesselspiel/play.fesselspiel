import { appTimeZone } from "./dates";

type Progress = { required: number; complete: boolean };

export type ReminderQuotaStatus = {
  daily: Progress;
  weekly: Progress;
  weeklyMode: string;
  weekStartsOn: number;
  monthlyMinutes: Progress;
  monthlyDays: Progress;
};

function zonedNumber(date: Date, part: "hour" | "month") {
  const options: Intl.DateTimeFormatOptions = { timeZone: appTimeZone };
  if (part === "hour") {
    options.hour = "numeric";
    options.hourCycle = "h23";
  } else {
    options.month = "numeric";
  }
  return Number(new Intl.DateTimeFormat("en-US", options).format(date));
}

function zonedWeekday(date: Date) {
  const value = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: appTimeZone }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value);
}

function isLastLocalDayOfMonth(date: Date) {
  const tomorrow = new Date(date.getTime() + 24 * 60 * 60_000);
  return zonedNumber(date, "month") !== zonedNumber(tomorrow, "month");
}

export function trackerQuotaReminderReason(status: ReminderQuotaStatus, now = new Date()) {
  // Keep reminders quiet until the user has had most of the relevant day available.
  if (zonedNumber(now, "hour") < 18) return null;

  if (status.daily.required > 0 && !status.daily.complete) return "daily";

  if (status.weekly.required > 0 && !status.weekly.complete) {
    if (status.weeklyMode === "rolling") return "weekly-rolling";
    const finalWeekday = (status.weekStartsOn + 6) % 7;
    if (zonedWeekday(now) === finalWeekday) return "weekly";
  }

  const monthlyOpen =
    (status.monthlyMinutes.required > 0 && !status.monthlyMinutes.complete) ||
    (status.monthlyDays.required > 0 && !status.monthlyDays.complete);
  if (monthlyOpen && isLastLocalDayOfMonth(now)) return "monthly";

  return null;
}
