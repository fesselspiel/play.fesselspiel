export function featureEnabled(features: { key: string; enabled: boolean }[] | undefined, key: string): boolean {
  const feature = features?.find((entry) => entry.key === key);
  const direct = feature?.enabled !== false;
  if (!direct) return false;
  if (key === "selfBondage") return direct && featureEnabled(features, "positions");
  if (key === "orders") return direct && featureEnabled(features, "activities") && featureEnabled(features, "selfBondage");
  if (key.startsWith("tracker.")) return direct && featureEnabled(features, "trackers");
  return true;
}

export function navItemVisible(features: { key: string; enabled: boolean }[] | undefined, feature: string | null) {
  if (!feature) return true;
  if (feature === "trackers") return hasVisibleTrackerFeature(features);
  return featureEnabled(features, feature);
}

export function hasVisibleTrackerFeature(features: { key: string; enabled: boolean }[] | undefined): boolean {
  return featureEnabled(features, "trackers") && Boolean(features?.some((entry) => entry.key.startsWith("tracker.") && featureEnabled(features, entry.key)));
}
