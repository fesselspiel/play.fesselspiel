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

export function formatDateInput(value?: Date | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: appTimeZone
  }).formatToParts(value);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value || "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function timeZoneOffsetMs(value: Date) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone: appTimeZone
  }).formatToParts(value);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value || "0");
  const zonedAsUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return zonedAsUtc - value.getTime();
}

export function parseDateTimeLocal(value?: string | null) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const utcGuess = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0));
  const offset = timeZoneOffsetMs(utcGuess);
  return new Date(utcGuess.getTime() - offset);
}

export function parseDateInput(value?: string | null) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const utcGuess = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0));
  const offset = timeZoneOffsetMs(utcGuess);
  return new Date(utcGuess.getTime() - offset);
}

export function parseApiDateTime(value?: unknown) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return parseDateInput(raw);
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return parseDateTimeLocal(raw) || (() => {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  })();
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
