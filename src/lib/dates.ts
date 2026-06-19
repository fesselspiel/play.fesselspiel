export const appTimeZone = "Europe/Berlin";

export function formatDateTime(value?: Date | null) {
  if (!value) return "Nicht geplant";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: appTimeZone }).format(value);
}

export function formatDateTimeLocal(value?: Date | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: appTimeZone
  }).formatToParts(value);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value || "00";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function formatDate(value?: Date | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: appTimeZone }).format(value);
}

export function minutesBetween(start: Date, end?: Date | null) {
  if (!end) return null;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

export function formatMinutes(minutes?: number | null) {
  if (!minutes) return "0 min";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} h ${rest} min` : `${rest} min`;
}
