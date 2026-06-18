export const themes = [
  { id: "red", name: "Fesselspiel Rot", description: "Klassisch, klar und kontrastreich.", swatches: ["#E30613", "#111111", "#F5F5F5"] },
  { id: "pink", name: "Neon Pink", description: "Kraftvoll, warm und etwas verspielter.", swatches: ["#EC4899", "#111827", "#FDF2F8"] },
  { id: "sky", name: "Hellblau", description: "Kuehl, ruhig und sehr leicht.", swatches: ["#0EA5E9", "#0F172A", "#F0F9FF"] },
  { id: "yellow", name: "Gelb", description: "Hell, direkt und energisch.", swatches: ["#EAB308", "#18181B", "#FEFCE8"] },
  { id: "orange", name: "Orange", description: "Warm, aktiv und freundlich.", swatches: ["#F97316", "#1C1917", "#FFF7ED"] },
  { id: "violet", name: "Violett", description: "Elegant, ruhig und etwas dunkler.", swatches: ["#8B5CF6", "#18181B", "#F5F3FF"] },
  { id: "emerald", name: "Gruen", description: "Frisch, sachlich und entspannt.", swatches: ["#10B981", "#10231D", "#ECFDF5"] },
  { id: "mono", name: "Mono Schwarz", description: "Reduziert, kontrastreich und neutral.", swatches: ["#111111", "#555555", "#F5F5F5"] }
] as const;

export type ThemeId = (typeof themes)[number]["id"];

export function normalizeTheme(value?: string | null): ThemeId {
  return themes.some((theme) => theme.id === value) ? (value as ThemeId) : "red";
}
