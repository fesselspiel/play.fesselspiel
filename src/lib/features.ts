import { notFound } from "next/navigation";
import { currentTenant } from "@/lib/tenancy";

export const featureCatalog = [
  { key: "positions", label: "Szenen" },
  { key: "toys", label: "Spielsachen" },
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

export function featureEnabled(features: { key: string; enabled: boolean }[] | undefined, key: string) {
  const feature = features?.find((entry) => entry.key === key);
  return feature?.enabled !== false;
}

export async function hasFeature(key: FeatureKey | string) {
  const tenant = await currentTenant();
  return featureEnabled(tenant?.features, key);
}

export async function requireFeature(key: FeatureKey | string) {
  if (!(await hasFeature(key))) notFound();
}

