import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PublicFeature, publicFeatures } from "@/lib/public-features";

export type PublicContentOverrides = Record<string, unknown>;

function strings(value: unknown, fallback: string[]) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") return value.split("\n").map((line) => line.trim()).filter(Boolean);
  return fallback;
}

function stringValue(overrides: PublicContentOverrides, key: string, fallback: string) {
  const value = overrides[key];
  return typeof value === "string" ? value : fallback;
}

export async function publicContentOverrides(tenantId?: string | null) {
  if (!tenantId) return {};
  const rows = await prisma.publicContentOverride.findMany({ where: { tenantId } });
  return Object.fromEntries(rows.map((row) => [row.key, row.value])) as PublicContentOverrides;
}

export function landingContent(overrides: PublicContentOverrides) {
  return {
    heroEyebrow: stringValue(overrides, "landing.heroEyebrow", "Private Planung für Paare, Kreise und Seiten"),
    heroTitle: stringValue(overrides, "landing.heroTitle", "Eine App für alles, was ihr plant, teilt, dokumentiert und später wiederfinden wollt."),
    heroText: stringValue(overrides, "landing.heroText", "Playplaner bündelt Spielplanung, Szenen, Ausrüstung, Bilder, Tracker, Telegram-Agent, Chat, Packlisten und Automationen in einem geschützten privaten Bereich."),
    featuresTitle: stringValue(overrides, "landing.featuresTitle", "Alle Funktionen als eigene Bereiche"),
    featuresText: stringValue(overrides, "landing.featuresText", "Jede Funktion hat ihre eigene Seite mit einfacher Erklärung, mobiler Vorschau und Walkthrough. Die echten Inhalte bleiben geschützt und erscheinen erst nach dem Login."),
    workflowTitle: stringValue(overrides, "landing.workflowTitle", "Vom Impuls zur dokumentierten Session."),
    workflowText: stringValue(overrides, "landing.workflowText", "Die Webseite erklärt öffentlich, was möglich ist. Nach dem Login führt die App Schritt für Schritt durch Planung, Bilder, Tracker, Chat und Automationen.")
  };
}

export function mergePublicFeatures(overrides: PublicContentOverrides): PublicFeature[] {
  return publicFeatures.map((feature) => mergePublicFeature(feature, overrides));
}

export function mergePublicFeature(feature: PublicFeature, overrides: PublicContentOverrides): PublicFeature {
  const prefix = `feature.${feature.slug}`;
  return {
    ...feature,
    navTitle: stringValue(overrides, `${prefix}.navTitle`, feature.navTitle),
    title: stringValue(overrides, `${prefix}.title`, feature.title),
    eyebrow: stringValue(overrides, `${prefix}.eyebrow`, feature.eyebrow),
    summary: stringValue(overrides, `${prefix}.summary`, feature.summary),
    description: strings(overrides[`${prefix}.description`], feature.description),
    highlights: strings(overrides[`${prefix}.highlights`], feature.highlights),
    walkthrough: strings(overrides[`${prefix}.walkthrough`], feature.walkthrough),
    cta: stringValue(overrides, `${prefix}.cta`, feature.cta)
  };
}

export async function savePublicContentOverride(input: {
  tenantId: string;
  key: string;
  value: Prisma.InputJsonValue;
  updatedById?: string | null;
}) {
  return prisma.publicContentOverride.upsert({
    where: { tenantId_key: { tenantId: input.tenantId, key: input.key } },
    update: { value: input.value, updatedById: input.updatedById || null },
    create: {
      tenantId: input.tenantId,
      key: input.key,
      value: input.value,
      updatedById: input.updatedById || null
    }
  });
}
