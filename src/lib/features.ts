import { redirect } from "next/navigation";
import { currentSessionContext } from "@/lib/auth";
import { featureCatalog as capabilityFeatureCatalog } from "@/lib/capabilities";
import { featureEnabled } from "@/lib/feature-utils";
import { currentTenant } from "@/lib/tenancy";
export { featureEnabled, hasVisibleTrackerFeature, navItemVisible } from "@/lib/feature-utils";

export const featureCatalog = capabilityFeatureCatalog;

export type FeatureKey = typeof featureCatalog[number]["key"];

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
