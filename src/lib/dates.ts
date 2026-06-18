export function formatDateTime(value?: Date | null) {
  if (!value) return "Nicht geplant";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

export function formatDateTimeLocal(value?: Date | null) {
  if (!value) return "";
  const offset = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

export function formatDate(value?: Date | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(value);
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
