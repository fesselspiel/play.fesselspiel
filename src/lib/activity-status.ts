export const activityStatusLabel = {
  REQUESTED: "angefragt",
  PLANNED: "geplant",
  DONE: "durchgefuehrt",
  DISCARDED: "verworfen"
} as const;

export type ActivityStatusValue = keyof typeof activityStatusLabel;

export function activityStatusTone(status: ActivityStatusValue) {
  if (status === "REQUESTED") return "green" as const;
  if (status === "PLANNED") return "red" as const;
  return "neutral" as const;
}

export function quarterHourOptions() {
  return Array.from({ length: 24 * 4 }, (_, index) => {
    const hour = Math.floor(index / 4);
    const minute = (index % 4) * 15;
    const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    return { value, label: value };
  });
}
