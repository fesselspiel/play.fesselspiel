import { redirect } from "next/navigation";
import { currentTenant } from "@/lib/tenancy";

export const featureCatalog = [
  { key: "positions", label: "Szenen" },
  { key: "toys", label: "Spielsachen" },
  { key: "shopifyBondageSystem", label: "Bondage-System" },
  { key: "media", label: "Bilder" },
  { key: "activities", label: "Spielplanung" },
  { key: "selfBondage", label: "Self-Bondage" },
  { key: "trackers", label: "Tracker" },
  { key: "tracker.segufix", label: "Segufix Time Tracker" },
  { key: "tracker.kg", label: "KG Time Tracker" },
  { key: "telegram", label: "Telegram" },
  { key: "externalApi", label: "Externe API" },
  { key: "email", label: "E-Mail" },
  { key: "dataTransfer", label: "Datenexport und Import" },
  { key: "auditLog", label: "Protokoll" }
] as const;

export type FeatureKey = typeof featureCatalog[number]["key"];

export function featureEnabled(features: { key: string; enabled: boolean }[] | undefined, key: string): boolean {
  const feature = features?.find((entry) => entry.key === key);
  const direct = feature?.enabled !== false;
  if (!direct) return false;
  if (key === "selfBondage") return direct && featureEnabled(features, "positions");
  if (key.startsWith("tracker.")) return direct && featureEnabled(features, "trackers");
  return true;
}

export async function hasFeature(key: FeatureKey | string) {
  const tenant = await currentTenant();
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
