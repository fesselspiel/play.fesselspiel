import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Camera, CircleStop, Clock, Cpu, ShieldCheck, Timer } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { Field, inputClass, PageHeader, Panel, SoftPanel } from "@/components/ui";
import { actionLabels, labelAutomationValue } from "@/lib/automation-rule-model";
import { currentUser } from "@/lib/auth";
import { formatDateTime, minutesBetween } from "@/lib/dates";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";
import { automationSessionAccess, createAutomationImageRequest, requestAutomationEnd } from "@/lib/session-automation";

function detailsObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function displayUserName(user?: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null } | null) {
  return user?.profile?.displayName || user?.name || user?.username || user?.email || "System";
}

function eventLabel(event: { type: string; title: string }) {
  const label = labelAutomationValue("eventTypes", event.type);
  return label === event.type ? event.title : label;
}

function timeModelLabel(timing: Record<string, unknown>) {
  const type = String(timing.type || "");
  if (type === "random_delay") return `Zufällige Verzögerung${timing.resolvedDelayMinutes ? `, festgelegt auf ${timing.resolvedDelayMinutes} Minuten` : ""}`;
  if (type === "fixed_delay") return `Feste Verzögerung${timing.resolvedDelayMinutes ? `, ${timing.resolvedDelayMinutes} Minuten` : ""}`;
  return "Sofort";
}

function humanJsonValue(value: unknown) {
  if (value instanceof Date) return formatDateTime(value);
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return formatDateTime(date);
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function humanDetailEntries(details: Record<string, unknown>) {
  const labels: Record<string, string> = {
    reason: "Grund",
    dueAt: "Fällig",
    finishedAt: "Beendet",
    pendingEndAt: "Vorgemerktes Ende",
    resolvedDelayMinutes: "Berechnete Wartezeit",
    requestId: "Bildanforderung",
    actionTitle: "Aktion",
    error: "Fehler",
    trackerTypeId: "Tracker",
    trackerEntryId: "Tracker-Eintrag"
  };
  return Object.entries(details).filter(([key]) => labels[key]).map(([key, value]) => [labels[key], humanJsonValue(value) || String(value || "")] as const);
}

async function endAutomation(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("automation");
  const sessionId = String(formData.get("sessionId") || "");
  const delayMinutes = Number(formData.get("delayMinutes") || 0);
  await requestAutomationEnd({
    user,
    sessionId,
    timing: delayMinutes > 0 ? { type: "fixed_delay", minutes: delayMinutes } : { type: "immediate" },
    source: "WEB",
    override: formData.get("override") === "on",
    reason: String(formData.get("reason") || "") || null
  });
  redirect(`/automation/sessions/${encodeURIComponent(sessionId)}`);
}

async function requestImage(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("automation");
  const sessionId = String(formData.get("sessionId") || "");
  await createAutomationImageRequest({
    user,
    sessionId,
    deviceId: String(formData.get("deviceId") || "") || null,
    capabilityId: String(formData.get("capabilityId") || "") || null,
    reason: String(formData.get("reason") || "") || null
  });
  redirect(`/automation/sessions/${encodeURIComponent(sessionId)}`);
}

export default async function AutomationSessionDetailPage(props: { params: Promise<{ id: string }> }) {
  await requireFeature("automation");
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.tenantId) redirect("/");
  const params = await props.params;
  const session = await prisma.automationSession.findFirst({
    where: {
      id: params.id,
      tenantId: user.tenantId
    },
    include: {
      owner: { include: { profile: true } },
      trackerType: true,
      trackerEntry: true,
      imageRequests: { include: { file: true, device: true, capability: true, requester: { include: { profile: true } } }, orderBy: { requestedAt: "desc" } },
      actions: { include: { actor: { include: { profile: true } }, device: true, capability: true, rule: true, ruleVersion: true }, orderBy: { createdAt: "desc" } },
      events: {
        include: {
          actor: { include: { profile: true } },
          device: true,
          capability: true,
          rule: true,
          ruleVersion: true,
          action: true,
          context: true,
          parentEvent: { select: { id: true, type: true, title: true, createdAt: true } },
          childEvents: { select: { id: true, type: true, title: true, createdAt: true }, orderBy: { createdAt: "asc" }, take: 5 }
        },
        orderBy: { createdAt: "desc" },
        take: 120
      }
    }
  });
  if (!session) notFound();
  const access = await automationSessionAccess(user, session);
  if (!access.canView) notFound();
  const [devices, tenantUsers] = await Promise.all([
    prisma.automationDevice.findMany({ where: { tenantId: user.tenantId }, include: { capabilities: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { OR: [{ tenantId: user.tenantId }, { memberships: { some: { tenantId: user.tenantId, active: true } } }] },
      include: { profile: true },
      take: 200
    })
  ]);
  const userNames = new Map(tenantUsers.map((item) => [item.id, displayUserName(item)]));
  const cameraCapabilities = devices.flatMap((device) => device.capabilities.filter((capability) => capability.kind.toLowerCase() === "camera").map((capability) => ({ device, capability })));
  const canRequestImage = access.canRequestImage && cameraCapabilities.length > 0;
  const stateJson = detailsObject(session.stateJson);
  const pendingTiming = detailsObject(stateJson.pendingEndTiming);

  return (
    <AppShell>
      <PageHeader
        title={session.title}
        action={<Link href="/automation" className="focus-ring inline-flex min-h-11 items-center rounded-md border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink hover:border-redbrand hover:text-redbrand"><ArrowLeft className="mr-2 h-4 w-4" /> Zur Automation</Link>}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Panel>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-line bg-paper p-3">
                <div className="text-xs uppercase tracking-wide text-graphite">Zustand</div>
                <div className="mt-1 text-lg font-semibold text-ink">{labelAutomationValue("states", session.state)}</div>
              </div>
              <div className="rounded-md border border-line bg-paper p-3">
                <div className="text-xs uppercase tracking-wide text-graphite">Session-Benutzer</div>
                <div className="mt-1 text-lg font-semibold text-ink">{displayUserName(session.owner)}</div>
              </div>
              <div className="rounded-md border border-line bg-paper p-3">
                <div className="text-xs uppercase tracking-wide text-graphite">Deine Rolle</div>
                <div className="mt-1 text-lg font-semibold text-ink">{access.role ? labelAutomationValue("roles", access.role) : "Kein Zugriff"}</div>
                <div className="mt-1 text-xs text-graphite">{access.reason}</div>
              </div>
              <div className="rounded-md border border-line bg-paper p-3">
                <div className="text-xs uppercase tracking-wide text-graphite">Gekoppelter Tracker</div>
                <div className="mt-1 font-semibold text-ink">{session.trackerType?.title || "Kein Tracker"}</div>
              </div>
              <div className="rounded-md border border-line bg-paper p-3">
                <div className="text-xs uppercase tracking-wide text-graphite">Bisherige Dauer</div>
                <div className="mt-1 font-semibold text-ink">
                  {session.startedAt ? `${minutesBetween(session.startedAt, session.finishedAt || session.cancelledAt || new Date())} Minuten` : "Noch nicht gestartet"}
                </div>
              </div>
              <div className="rounded-md border border-line bg-paper p-3">
                <div className="text-xs uppercase tracking-wide text-graphite">Startzeit</div>
                <div className="mt-1 font-semibold text-ink">{formatDateTime(session.startedAt)}</div>
              </div>
              <div className="rounded-md border border-line bg-paper p-3">
                <div className="text-xs uppercase tracking-wide text-graphite">Ende</div>
                <div className="mt-1 font-semibold text-ink">{formatDateTime(session.finishedAt || session.cancelledAt)}</div>
              </div>
            </div>
          </Panel>

          {session.pendingEndAt ? (
            <Panel>
              <div className="flex items-start gap-3">
                <Clock className="mt-1 h-5 w-5 text-redbrand" />
                <div>
                  <h2 className="text-lg font-semibold text-ink">Ende ist vorgemerkt</h2>
                  <p className="mt-1 text-sm text-graphite">Ein normaler erneuter Stop verändert dieses Fenster nicht. Nur eine bewusste Sofort-Beendigung beendet die Session vor dem geplanten Zeitpunkt.</p>
                </div>
              </div>
              <div className="mt-4 grid gap-2 text-sm text-graphite sm:grid-cols-2">
                <div>Angefordert: <span className="font-semibold text-ink">{typeof stateJson.pendingEndRequestedAt === "string" ? formatDateTime(new Date(String(stateJson.pendingEndRequestedAt))) : "Nicht gespeichert"}</span></div>
                <div>Ausgelöst von: <span className="font-semibold text-ink">{typeof stateJson.pendingEndRequestedBy === "string" ? userNames.get(String(stateJson.pendingEndRequestedBy)) || "Unbekannter Benutzer" : "Nicht gespeichert"}</span></div>
                <div>Zeitmodell: <span className="font-semibold text-ink">{timeModelLabel(pendingTiming)}</span></div>
                <div>Ausführung: <span className="font-semibold text-ink">{formatDateTime(session.pendingEndAt)}</span></div>
                <div>Restzeit: <span className="font-semibold text-ink">{Math.max(0, minutesBetween(new Date(), session.pendingEndAt) ?? 0)} Minuten</span></div>
              </div>
            </Panel>
          ) : null}

          <Panel>
            <h2 className="text-lg font-semibold text-ink">Erlaubte Aktionen</h2>
            {access.canRequestEnd || canRequestImage ? (
              <div className="mt-4 space-y-3">
                {session.state === "RUNNING" && access.canRequestEnd ? (
                  <form action={endAutomation} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <input type="hidden" name="sessionId" value={session.id} />
                    <Field label="Verzögerung Minuten">
                      <input name="delayMinutes" type="number" min={0} defaultValue={0} className={inputClass} />
                    </Field>
                    <Field label="Grund">
                      <input name="reason" className={inputClass} placeholder="Optional" />
                    </Field>
                    <div className="flex items-end">
                      <SubmitButton pendingLabel="Plant..."><CircleStop className="h-4 w-4" /> Session beenden</SubmitButton>
                    </div>
                  </form>
                ) : null}
                {session.state === "PENDING_END" && access.canOverrideEnd ? (
                  <form action={endAutomation} className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input type="hidden" name="sessionId" value={session.id} />
                    <input type="hidden" name="override" value="on" />
                    <Field label="Grund für sofortiges Beenden">
                      <input name="reason" className={inputClass} placeholder="Optional" />
                    </Field>
                    <div className="flex items-end">
                      <SubmitButton pendingLabel="Beendet..."><CircleStop className="h-4 w-4" /> Jetzt trotzdem beenden</SubmitButton>
                    </div>
                  </form>
                ) : null}
                {canRequestImage ? (
                  <form action={requestImage} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <input type="hidden" name="sessionId" value={session.id} />
                    <Field label="Kamera">
                      <select name="capabilityId" className={inputClass}>
                        {cameraCapabilities.map(({ device, capability }) => (
                          <option key={capability.id} value={capability.id}>{device.name} · {capability.title}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Anlass">
                      <input name="reason" className={inputClass} placeholder="Optional" />
                    </Field>
                    <div className="flex items-end">
                      <SubmitButton pendingLabel="Fragt an..."><Camera className="h-4 w-4" /> Bild anfordern</SubmitButton>
                    </div>
                  </form>
                ) : null}
              </div>
            ) : (
              <SoftPanel><ShieldCheck className="h-5 w-5 text-redbrand" /> Für deinen aktuellen Zustand und deine Rolle gibt es keine direkte Aktion.</SoftPanel>
            )}
          </Panel>

          <Panel>
            <h2 className="text-lg font-semibold text-ink">Angeforderte Bilder</h2>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {session.imageRequests.length ? session.imageRequests.map((request) => (
                <div key={request.id} className="rounded-md border border-line bg-paper p-2 text-sm text-graphite">
                  {request.file ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/files/${request.file.id}`} alt="" className="aspect-square w-full rounded object-cover" />
                  ) : <div className="flex aspect-square items-center justify-center rounded bg-canvas text-xs">{labelAutomationValue("imageStatuses", request.status)}</div>}
                  <div className="mt-2 font-semibold text-ink">{labelAutomationValue("imageStatuses", request.status)}</div>
                  <div>{formatDateTime(request.requestedAt)}</div>
                  {request.device || request.capability ? <div>{[request.device?.name, request.capability?.title].filter(Boolean).join(" · ")}</div> : null}
                </div>
              )) : <SoftPanel><Camera className="h-5 w-5 text-redbrand" /> Noch keine Bildanforderung.</SoftPanel>}
            </div>
          </Panel>

          <Panel>
            <h2 className="text-lg font-semibold text-ink">Geplante Aktionen</h2>
            <p className="mt-1 text-sm text-graphite">Hier stehen Aktionen, die durch Regeln oder manuelle Bedienung geplant wurden. Geräteaktionen werden erst an die Gerätebrücke übergeben und danach quittiert.</p>
            <div className="mt-4 space-y-2">
              {session.actions.length ? session.actions.map((action) => (
                <details key={action.id} className="rounded-md border border-line bg-paper p-3">
                  <summary className="cursor-pointer list-none font-semibold text-ink [&::-webkit-details-marker]:hidden">
                    {actionLabels[action.type as keyof typeof actionLabels] || "Aktion"} · {labelAutomationValue("actionStatuses", action.status)}
                  </summary>
                  <div className="mt-2 grid gap-1 text-sm text-graphite sm:grid-cols-2">
                    <div>Quelle: {labelAutomationValue("sources", action.source)}</div>
                    <div>Rolle: {labelAutomationValue("roles", action.role)}</div>
                    <div>Fällig: {formatDateTime(action.dueAt)}</div>
                    <div>Ausgeführt: {formatDateTime(action.finishedAt)}</div>
                    {action.actor ? <div>Ausgelöst von: {displayUserName(action.actor)}</div> : null}
                    {action.rule ? <div>Regel: {action.rule.name}</div> : null}
                    {action.device || action.capability ? <div>Gerät: {[action.device?.name, action.capability?.title].filter(Boolean).join(" · ")}</div> : null}
                    {action.error ? <div>Fehler: {action.error}</div> : null}
                  </div>
                  <details className="mt-2 rounded bg-surface p-2">
                    <summary className="cursor-pointer list-none text-xs font-semibold text-ink [&::-webkit-details-marker]:hidden">Technische Details</summary>
                    <pre className="mt-2 max-h-52 overflow-auto text-xs text-graphite">{JSON.stringify({ id: action.id, type: action.type, status: action.status, correlationId: action.correlationId, ruleId: action.ruleId, ruleVersionId: action.ruleVersionId, contextId: action.contextId, deviceId: action.deviceId, capabilityId: action.capabilityId, timing: action.timingJson, payload: action.payloadJson, result: action.resultJson, error: action.error }, null, 2)}</pre>
                  </details>
                </details>
              )) : <SoftPanel><Cpu className="h-5 w-5 text-redbrand" /> Noch keine geplanten Aktionen.</SoftPanel>}
            </div>
          </Panel>
        </div>

        <Panel>
          <h2 className="text-lg font-semibold text-ink">Ereignisverlauf</h2>
          <div className="mt-4 space-y-2">
            {session.events.length ? session.events.map((event) => {
              const details = detailsObject(event.detailsJson);
              const humanDetails = humanDetailEntries(details);
              return (
                <details key={event.id} className="rounded-md border border-line bg-paper p-3">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
                    {formatDateTime(event.createdAt)} · {eventLabel(event)}
                  </summary>
                  <div className="mt-2 space-y-2 text-sm text-graphite">
                    <div>Ausgelöst von: {displayUserName(event.actor)} · Quelle: {labelAutomationValue("sources", event.source)} · Rolle: {labelAutomationValue("roles", event.role)}</div>
                    {event.rule ? <div>Regel: <span className="font-semibold text-ink">{event.rule.name}</span>{event.ruleVersion ? ` · Version ${event.ruleVersion.version}` : ""}</div> : null}
                    {event.action ? <div>Aktion: <span className="font-semibold text-ink">{actionLabels[event.action.type as keyof typeof actionLabels] || event.action.type}</span> · {labelAutomationValue("actionStatuses", event.action.status)}</div> : null}
                    {event.device || event.capability ? <div>Gerät: {[event.device?.name, event.capability?.title].filter(Boolean).join(" · ")}</div> : null}
                    {humanDetails.length ? (
                      <div className="rounded-md border border-line bg-surface p-2">
                        {humanDetails.map(([label, value]) => <div key={label}>{label}: <span className="font-semibold text-ink">{value}</span></div>)}
                      </div>
                    ) : null}
                    {event.parentEvent || event.childEvents.length ? (
                      <div className="rounded-md border border-line bg-surface p-2">
                        {event.parentEvent ? <div>Ausgelöst durch: {formatDateTime(event.parentEvent.createdAt)} · {eventLabel(event.parentEvent)}</div> : null}
                        {event.childEvents.map((child) => <div key={child.id}>Folge: {formatDateTime(child.createdAt)} · {eventLabel(child)}</div>)}
                      </div>
                    ) : null}
                  </div>
                  <details className="mt-2 rounded bg-surface p-2">
                    <summary className="cursor-pointer list-none text-xs font-semibold text-ink [&::-webkit-details-marker]:hidden">Technische Details</summary>
                    <pre className="mt-2 max-h-64 overflow-auto text-xs text-graphite">{JSON.stringify({ eventId: event.id, type: event.type, source: event.source, role: event.role, correlationId: event.correlationId, sessionId: event.sessionId, ruleId: event.ruleId, ruleVersionId: event.ruleVersionId, actionId: event.actionId, contextId: event.contextId, parentEventId: event.parentEventId, deviceId: event.deviceId, capabilityId: event.capabilityId, details: event.detailsJson, raw: event.rawJson, executionContext: event.context ? { variables: event.context.variablesJson, conditions: event.context.conditionsJson, policy: event.context.policyJson, timing: event.context.timingJson, parentContextId: event.context.parentContextId } : null }, null, 2)}</pre>
                  </details>
                </details>
              );
            }) : <SoftPanel><Timer className="h-5 w-5 text-redbrand" /> Noch kein Ereignis gespeichert.</SoftPanel>}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
