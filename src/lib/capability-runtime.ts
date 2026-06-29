import { publicCapabilitySummary } from "@/lib/capabilities";
import { featureEnabled } from "@/lib/features";
import { prisma } from "@/lib/prisma";

type FeatureFlag = { key: string; enabled: boolean };

type CapabilitySummary = ReturnType<typeof publicCapabilitySummary>[number];

function dynamicTrackerCapability(tracker: { key: string; title: string; description?: string | null }): CapabilitySummary {
  const featureKey = `tracker.${tracker.key}`;
  return {
    key: featureKey,
    label: tracker.title,
    featureKey,
    aliases: [tracker.key, tracker.title, `${tracker.title} Tracker`].filter(Boolean),
    intents: [`${tracker.title} anzeigen`, `${tracker.title} starten`, `${tracker.title} stoppen`, `${tracker.title} kontingent`],
    route: `/sessions?tracker=${encodeURIComponent(tracker.key)}`,
    actions: [
      {
        key: "overview",
        label: `${tracker.title} anzeigen`,
        type: "read",
        description: tracker.description || `Zeigt Auswertung und Kontingent für ${tracker.title}.`,
        agentTool: undefined,
        telegramCommands: undefined,
        apiEndpoints: [
          { method: "GET", path: `/api/external/trackers/quotas?token=...&trackerKey=${tracker.key}`, description: `Kontingent für ${tracker.title} abfragen.` }
        ],
        auditActions: [`tracker_${tracker.key}_viewed`, `tracker_${tracker.key}_quota_viewed`]
      },
      {
        key: "start",
        label: `${tracker.title} starten`,
        type: "write",
        description: `Startet ${tracker.title} per API.`,
        agentTool: undefined,
        telegramCommands: undefined,
        apiEndpoints: [
          { method: "GET", path: `/api/external/trackers/${tracker.key}/start?token=...&note=...`, description: `${tracker.title} starten.` },
          { method: "POST", path: `/api/external/trackers/${tracker.key}/start`, description: `${tracker.title} per POST starten.` }
        ],
        auditActions: [`tracker_${tracker.key}_started`, `tracker_${tracker.key}_started_api`, `tracker_${tracker.key}_started_control`]
      },
      {
        key: "stop",
        label: `${tracker.title} beenden`,
        type: "write",
        description: `Beendet den laufenden Tracker ${tracker.title}.`,
        agentTool: undefined,
        telegramCommands: undefined,
        apiEndpoints: [
          { method: "GET", path: `/api/external/trackers/${tracker.key}/stop?token=...&note=...`, description: `${tracker.title} beenden.` },
          { method: "POST", path: `/api/external/trackers/${tracker.key}/stop`, description: `${tracker.title} per POST beenden.` }
        ],
        auditActions: [`tracker_${tracker.key}_stopped`, `tracker_${tracker.key}_stopped_api`, `tracker_${tracker.key}_stopped_control`]
      }
    ]
  };
}

export async function publicCapabilitySummaryForTenant(
  tenantId: string | null | undefined,
  features: FeatureFlag[] | undefined
) {
  const base = publicCapabilitySummary(features, featureEnabled);
  if (!featureEnabled(features, "trackers")) return base;

  const known = new Set(base.map((capability) => capability.featureKey));
  const trackers = await prisma.trackerType.findMany({
    where: {
      enabled: true,
      ...(tenantId ? { OR: [{ tenantId }, { tenantId: null }] } : { tenantId: null })
    },
    orderBy: { title: "asc" },
    select: { key: true, title: true, description: true }
  });

  const dynamic = trackers
    .filter((tracker) => !known.has(`tracker.${tracker.key}`))
    .filter((tracker) => featureEnabled(features, `tracker.${tracker.key}`))
    .map(dynamicTrackerCapability);

  return [...base, ...dynamic];
}
