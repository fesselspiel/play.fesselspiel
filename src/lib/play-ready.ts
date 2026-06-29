export type PlayReadyState = "red" | "yellow" | "green";

export function normalizePlayReadyState(value: unknown, fallback: PlayReadyState = "red"): PlayReadyState {
  const normalized = String(value || "").trim().toLowerCase();
  if (["green", "gruen", "grün", "true", "1", "yes", "on", "lust", "voll"].includes(normalized)) return "green";
  if (["yellow", "gelb", "flexibel", "maybe", "neutral"].includes(normalized)) return "yellow";
  if (["red", "rot", "false", "0", "no", "off", "nicht"].includes(normalized)) return "red";
  return fallback;
}

export function playReadyStateFromBoolean(value: boolean | null | undefined): PlayReadyState {
  return value ? "green" : "red";
}

export function effectivePlayReadyState(settings?: { playReady?: boolean | null; playReadyState?: string | null } | null): PlayReadyState {
  return normalizePlayReadyState(settings?.playReadyState, playReadyStateFromBoolean(settings?.playReady));
}

export function playReadyStateToBoolean(state: PlayReadyState) {
  return state === "green";
}

export function nextPlayReadyState(state: PlayReadyState): PlayReadyState {
  if (state === "green") return "yellow";
  return "green";
}

export function playReadyLabel(state: PlayReadyState) {
  if (state === "green") return "voll Lust";
  if (state === "yellow") return "flexibel";
  return "gerade nicht";
}

export function playReadyDisplayLabel(state: PlayReadyState) {
  if (state === "green") return "Voll Lust";
  if (state === "yellow") return "Flexibel";
  return "Gerade nicht";
}

export function playReadyColorLabel(state: PlayReadyState) {
  if (state === "green") return "Grün";
  if (state === "yellow") return "Gelb";
  return "Rot";
}

export function playReadyRemainingText(expiresAt: Date, now: Date) {
  const remainingMs = expiresAt.getTime() - now.getTime();
  if (remainingMs <= 0) return "läuft jetzt ab";
  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `noch ${hours} Std. ${minutes} Min.`;
  if (hours) return `noch ${hours} Std.`;
  return `noch ${minutes} Min.`;
}
