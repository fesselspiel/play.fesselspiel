import { redirect } from "next/navigation";
import { currentSessionContext } from "@/lib/auth";
import { featureCatalog as capabilityFeatureCatalog } from "@/lib/capabilities";
import { currentTenant } from "@/lib/tenancy";

export const featureCatalog = capabilityFeatureCatalog;

export type FeatureKey = typeof featureCatalog[number]["key"];

export function featureEnabled(features: { key: string; enabled: boolean }[] | undefined, key: string): boolean {
  const feature = features?.find((entry) => entry.key === key);
  const direct = feature?.enabled !== false;
  if (!direct) return false;
  if (key === "selfBondage") return direct && featureEnabled(features, "positions");
  if (key === "orders") return direct && featureEnabled(features, "activities") && featureEnabled(features, "selfBondage");
  if (key.startsWith("tracker.")) return direct && featureEnabled(features, "trackers");
  return true;
}

export function hasVisibleTrackerFeature(features: { key: string; enabled: boolean }[] | undefined): boolean {
  return featureEnabled(features, "trackers") && Boolean(features?.some((entry) => entry.key.startsWith("tracker.") && featureEnabled(features, entry.key)));
}

export async function hasFeature(key: FeatureKey | string) {
  const context = await currentSessionContext();
  const tenant = context.user?.tenant || context.tenant || await currentTenant();
  return featureEnabled(tenant?.features, key);
}

export async function requireFeature(key: FeatureKey | string) {
  if (!(await hasFeature(key))) redirect(`/feature-disabled?feature=${encodeURIComponent(key)}`);
}

export function apiFeatureDisabled(feature: string) {
  return Response.json({ ok: false, error: "feature_disabled", feature }, { status: 403 });
}

export function telegramFeatureDisabled() {
  return "<b>Dieses Feature ist gerade nicht aktiv</b>\nAuf dieser Seite ist dafür momentan nichts eingerichtet. Falls du es erwartest, sprich kurz mit der Person, die diese Seite verwaltet.";
}
