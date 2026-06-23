export const homeSections = [
  { key: "playReady", label: "Spielampel" },
  { key: "quickActions", label: "Spielaktionen" },
  { key: "favorites", label: "Favoriten" },
  { key: "trackerTodos", label: "Tracker-Todos" },
  { key: "orders", label: "Aufträge" },
  { key: "requestedPlans", label: "Spielplan-Anfragen" },
  { key: "runningTrackers", label: "Laufende Tracker" },
  { key: "week", label: "Gemeinsame Woche" },
  { key: "feed", label: "Feed" },
  { key: "recentTrackers", label: "Letzte Tracker-Einträge" }
] as const;

export type HomeSectionKey = typeof homeSections[number]["key"];

export function normalizeHomeLayout(value: unknown) {
  const validKeys = new Set(homeSections.map((section) => section.key));
  const incoming = Array.isArray(value) ? value.map(String).filter((key): key is HomeSectionKey => validKeys.has(key as HomeSectionKey)) : [];
  const merged = [...incoming];
  for (const section of homeSections) {
    if (!merged.includes(section.key)) merged.push(section.key);
  }
  return merged;
}

export function homeSectionOrder(value: unknown, key: HomeSectionKey) {
  const index = normalizeHomeLayout(value).indexOf(key);
  return index >= 0 ? index : homeSections.findIndex((section) => section.key === key);
}
