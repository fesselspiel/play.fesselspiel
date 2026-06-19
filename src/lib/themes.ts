export const themes = [
  {
    id: "red",
    name: "Fesselspiel Rot",
    description: "Klassisch, klar und kontrastreich.",
    swatches: ["#E30613", "#111111", "#F5F5F5"],
    darkSwatches: ["#FF3340", "#F8FAFC", "#050506"]
  },
  {
    id: "pink",
    name: "Neon Pink",
    description: "Kraftvoll, warm und etwas verspielter.",
    swatches: ["#EC4899", "#111827", "#FDF2F8"],
    darkSwatches: ["#F472B6", "#F8FAFC", "#050506"]
  },
  {
    id: "sky",
    name: "Hellblau",
    description: "Kuehl, ruhig und sehr leicht.",
    swatches: ["#0EA5E9", "#0F172A", "#F0F9FF"],
    darkSwatches: ["#38BDF8", "#F8FAFC", "#050506"]
  },
  {
    id: "yellow",
    name: "Gelb",
    description: "Hell, direkt und energisch.",
    swatches: ["#EAB308", "#18181B", "#FEFCE8"],
    darkSwatches: ["#FACC15", "#FAFAFA", "#050506"]
  },
  {
    id: "orange",
    name: "Orange",
    description: "Warm, aktiv und freundlich.",
    swatches: ["#F97316", "#1C1917", "#FFF7ED"],
    darkSwatches: ["#FB923C", "#FAFAFA", "#050506"]
  },
  {
    id: "violet",
    name: "Violett",
    description: "Elegant, ruhig und etwas dunkler.",
    swatches: ["#8B5CF6", "#18181B", "#F5F3FF"],
    darkSwatches: ["#A78BFA", "#F8FAFC", "#050506"]
  },
  {
    id: "emerald",
    name: "Grün",
    description: "Frisch, sachlich und entspannt.",
    swatches: ["#10B981", "#10231D", "#ECFDF5"],
    darkSwatches: ["#34D399", "#F8FAFC", "#050506"]
  },
  {
    id: "mono",
    name: "Mono Schwarz",
    description: "Reduziert, kontrastreich und neutral.",
    swatches: ["#111111", "#555555", "#F5F5F5"],
    darkSwatches: ["#F5F5F5", "#A1A1AA", "#050506"]
  }
] as const;

export type ThemeId = (typeof themes)[number]["id"];
export type ThemeMode = "light" | "dark";

export function normalizeTheme(value?: string | null): ThemeId {
  return themes.some((theme) => theme.id === value) ? (value as ThemeId) : "red";
}

export function normalizeThemeMode(value?: boolean | string | null): ThemeMode {
  return value === true || value === "dark" || value === "on" || value === "true" ? "dark" : "light";
}
