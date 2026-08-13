import { redirect } from "next/navigation";
import { CheckCircle2, Link2, ShieldCheck } from "lucide-react";
import { createApiToken } from "@/lib/api-tokens";
import { encryptedPairingCredential, extendPairingExpiry } from "@/lib/automation-bridge-pairing";
import { currentSessionContext } from "@/lib/auth";
import { featureEnabled } from "@/lib/features";
import { mqttTopicBase } from "@/lib/mqtt-bridge";
import { prisma } from "@/lib/prisma";
import { recordAutomationEvent } from "@/lib/session-automation";
import { trackerVisibleToUser } from "@/lib/external-tracker-types";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { Panel, PageHeader, selectClass } from "@/components/ui";

function pairingError(code: string): never {
  redirect(`/settings/automation/pair?error=${encodeURIComponent(code)}`);
}

async function approvePairing(formData: FormData) {
  "use server";
  const { actor: user } = await currentSessionContext();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/settings/automation/pair?request=${String(formData.get("requestId") || "")}`)}`);
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") pairingError("not_allowed");
  if (!user.tenantId || !user.tenant) pairingError("tenant_required");
  if (!featureEnabled(user.tenant.features, "automation") || !featureEnabled(user.tenant.features, "externalApi") || !featureEnabled(user.tenant.features, "trackers") || !featureEnabled(user.tenant.features, "scheduledRules")) pairingError("feature_disabled");
  const requestId = String(formData.get("requestId") || "");
  const pairing = await prisma.automationBridgePairing.findUnique({ where: { id: requestId } });
  if (!pairing || pairing.tenantId !== user.tenantId) pairingError("wrong_site");
  if (pairing.status !== "PENDING" || pairing.expiresAt <= new Date()) pairingError("pairing_expired");
  const trackerTypeId = String(formData.get("trackerTypeId") || "").trim();
  const tracker = trackerTypeId ? await prisma.trackerType.findFirst({
    where: { id: trackerTypeId, enabled: true, OR: [{ tenantId: user.tenantId }, { tenantId: null }] }
  }) : null;
  if (!tracker || !trackerVisibleToUser(tracker, user.id)) pairingError("invalid_tracker");
  const { token, record } = await createApiToken(user.id, `ioBroker ${pairing.installationName || pairing.installationId}`, user.tenantId);
  try {
    const updated = await prisma.automationBridgePairing.updateMany({
      where: { id: pairing.id, tenantId: user.tenantId, status: "PENDING", expiresAt: { gt: new Date() } },
      data: {
        status: "APPROVED",
        approvedById: user.id,
        apiTokenId: record.id,
        trackerTypeId: tracker.id,
        credentialEnc: encryptedPairingCredential(token),
        approvedAt: new Date(),
        expiresAt: extendPairingExpiry()
      }
    });
    if (updated.count !== 1) {
      await prisma.apiToken.delete({ where: { id: record.id } });
      pairingError("pairing_expired");
    }
    await prisma.automationBridge.upsert({
      where: { tenantId: user.tenantId },
      update: {
        enabled: true,
        mqttBaseTopic: mqttTopicBase(user.tenant.slug),
        mqttClientId: pairing.installationId,
        metadataJson: { installationId: pairing.installationId, installationName: pairing.installationName, pairedAt: new Date().toISOString(), transport: "HTTPS_POLLING" }
      },
      create: {
        tenantId: user.tenantId,
        enabled: true,
        mqttBaseTopic: mqttTopicBase(user.tenant.slug),
        mqttClientId: pairing.installationId,
        metadataJson: { installationId: pairing.installationId, installationName: pairing.installationName, pairedAt: new Date().toISOString(), transport: "HTTPS_POLLING" }
      }
    });
    await recordAutomationEvent({
      tenantId: user.tenantId,
      actorId: user.id,
      type: "bridge_paired",
      title: `ioBroker-Bridge verbunden: ${pairing.installationName || pairing.installationId}`,
      source: "WEB",
      role: "OWNER",
      details: { installationId: pairing.installationId, trackerTypeId: tracker.id, trackerTitle: tracker.title }
    });
  } catch (error) {
    await prisma.apiToken.deleteMany({ where: { id: record.id } });
    throw error;
  }
  redirect(`/settings/automation/pair?connected=1&request=${encodeURIComponent(pairing.id)}`);
}

export default async function AutomationPairPage(props: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const searchParams = await props.searchParams;
  const requestId = typeof searchParams?.request === "string" ? searchParams.request : "";
  const error = typeof searchParams?.error === "string" ? searchParams.error : "";
  const connected = searchParams?.connected === "1";
  const { actor: user } = await currentSessionContext();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/settings/automation/pair?request=${requestId}`)}`);
  const allowed = (user.role === "ADMIN" || user.role === "SUPER_ADMIN") && Boolean(user.tenantId && user.tenant);
  const pairing = requestId ? await prisma.automationBridgePairing.findUnique({ where: { id: requestId } }) : null;
  const sameTenant = Boolean(pairing && user.tenantId && pairing.tenantId === user.tenantId);
  const featureAllowed = Boolean(user.tenant && featureEnabled(user.tenant.features, "automation") && featureEnabled(user.tenant.features, "externalApi") && featureEnabled(user.tenant.features, "trackers") && featureEnabled(user.tenant.features, "scheduledRules"));
  const trackers = allowed && sameTenant ? (await prisma.trackerType.findMany({
    where: { enabled: true, OR: [{ tenantId: user.tenantId }, { tenantId: null }] },
    orderBy: [{ title: "asc" }, { key: "asc" }]
  })).filter((tracker) => trackerVisibleToUser(tracker, user.id)) : [];
  const pending = pairing?.status === "PENDING" && pairing.expiresAt > new Date();

  return (
    <AppShell>
      <PageHeader title="ioBroker verbinden" subtitle="Sichere Kopplung der lokalen Gerätebridge mit dieser Playplaner-Seite" />
      <div className="mx-auto max-w-2xl">
        <Panel>
          {connected ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
              <h2 className="mt-3 text-xl font-semibold text-ink">ioBroker ist verbunden</h2>
              <p className="mt-2 text-sm text-graphite">Du kannst dieses Fenster schließen. Der Adapter übernimmt Zugang und Einstellungen automatisch.</p>
            </div>
          ) : !allowed ? (
            <div><h2 className="text-lg font-semibold text-ink">Keine Berechtigung</h2><p className="mt-2 text-sm text-graphite">Nur Administratoren dieser Seite und Superadmins dürfen eine Gerätebridge verbinden.</p></div>
          ) : !sameTenant ? (
            <div><h2 className="text-lg font-semibold text-ink">Falsche Playplaner-Seite</h2><p className="mt-2 text-sm text-graphite">Diese Kopplung wurde für eine andere Domain beziehungsweise einen anderen Mandanten begonnen. Öffne im Adapter die dort eingetragene Adresse erneut.</p></div>
          ) : !featureAllowed ? (
            <div><h2 className="text-lg font-semibold text-ink">Funktion nicht freigeschaltet</h2><p className="mt-2 text-sm text-graphite">Automation, externe API und Tracker müssen für diese Seite freigeschaltet sein.</p></div>
          ) : !pending ? (
            <div><h2 className="text-lg font-semibold text-ink">Kopplung abgelaufen</h2><p className="mt-2 text-sm text-graphite">Starte die Verbindung im ioBroker-Adapter noch einmal. Eine Anfrage ist nur zehn Minuten gültig.</p></div>
          ) : !trackers.length ? (
            <div><h2 className="text-lg font-semibold text-ink">Kein Tracker verfügbar</h2><p className="mt-2 text-sm text-graphite">Lege für diese Seite zuerst einen aktiven Tracker an, der für dieses Administratorkonto sichtbar ist.</p></div>
          ) : (
            <form action={approvePairing} className="space-y-5">
              <div className="rounded-lg bg-paper p-4">
                <div className="flex items-center gap-2 font-semibold text-ink"><ShieldCheck className="h-5 w-5 text-redbrand" /> Berechtigung wird von Playplaner geprüft</div>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[150px_1fr]">
                  <dt className="text-graphite">Playplaner-Seite</dt><dd className="font-semibold text-ink">{user.tenant?.name}</dd>
                  <dt className="text-graphite">Domain</dt><dd className="font-mono text-xs text-ink">{pairing?.requestedHostname}</dd>
                  <dt className="text-graphite">ioBroker</dt><dd className="text-ink">{pairing?.installationName || pairing?.installationId}</dd>
                  <dt className="text-graphite">Deine Rolle</dt><dd className="text-ink">{user.role === "SUPER_ADMIN" ? "Superadmin" : "Administrator"}</dd>
                </dl>
              </div>
              <label className="block text-sm font-medium text-graphite">
                <span className="mb-1 block">Tracker für Start/Stop</span>
                <select className={selectClass} name="trackerTypeId" required defaultValue={trackers.length === 1 ? trackers[0].id : ""}>
                  <option value="" disabled>Tracker auswählen</option>
                  {trackers.map((tracker) => <option key={tracker.id} value={tracker.id}>{tracker.title}</option>)}
                </select>
              </label>
              <input type="hidden" name="requestId" value={pairing?.id} />
              {error ? <p className="text-sm font-semibold text-redbrand">Die Verbindung konnte nicht bestätigt werden: {error}</p> : null}
              <SubmitButton className="w-full" pendingLabel="Wird sicher verbunden …"><Link2 className="h-4 w-4" /> Diese ioBroker-Installation verbinden</SubmitButton>
              <p className="text-xs leading-5 text-graphite">Die erteilten Zugangsdaten gelten ausschließlich für diese Playplaner-Seite. Ein Domainwechsel erfordert eine neue Bestätigung.</p>
            </form>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
