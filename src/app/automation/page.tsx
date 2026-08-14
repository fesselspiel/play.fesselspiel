import Link from "next/link";
import { redirect } from "next/navigation";
import { Camera, CircleStop, Timer } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AutomationSessionStartForm } from "@/components/automation-session-start-form";
import { SubmitButton } from "@/components/submit-button";
import { Field, inputClass, PageGuide, PageHeader, Panel, SoftPanel } from "@/components/ui";
import { actionLabels, knownAutomationLabel, labelAutomationValue } from "@/lib/automation-rule-model";
import { currentUser } from "@/lib/auth";
import { formatDateTime, minutesBetween } from "@/lib/dates";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";
import { createAutomationImageRequest, requestAutomationEnd, startAutomationSession } from "@/lib/session-automation";

function detailsObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function automationEventLabel(event: { type: string; title: string }) {
  return knownAutomationLabel("eventTypes", event.type) || event.title || "Unbekanntes Ereignis";
}

function actorLabel(actor?: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null } | null) {
  return actor?.profile?.displayName || actor?.name || actor?.username || actor?.email || "System";
}

function timeModelLabel(timing: Record<string, unknown>) {
  const type = String(timing.type || "");
  if (type === "random_delay") return `Zufällige Verzögerung${timing.resolvedDelayMinutes ? `, festgelegt auf ${timing.resolvedDelayMinutes} Minuten` : ""}`;
  if (type === "fixed_delay") return `Feste Verzögerung${timing.resolvedDelayMinutes ? `, ${timing.resolvedDelayMinutes} Minuten` : ""}`;
  return "Sofort";
}

function humanDetailValue(value: unknown) {
  if (value instanceof Date) return formatDateTime(value);
  if (typeof value === "string") {
    const date = new Date(value);
    if (/^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(date.getTime())) return formatDateTime(date);
    return value;
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (value === null || value === undefined || value === "") return "Nicht gespeichert";
  return JSON.stringify(value);
}

function humanEventDetails(details: Record<string, unknown>) {
  const labels: Record<string, string> = {
    reason: "Anlass",
    error: "Fehler",
    timeoutSeconds: "Timeout",
    maxRetries: "Wiederholungen",
    bootDelaySeconds: "Boot-Wartezeit",
    dueAt: "Geplant für",
    requestedAt: "Angefordert",
    source: "Quelle",
    role: "Rolle",
    status: "Status"
  };
  return Object.entries(details)
    .filter(([key, value]) => labels[key] && value !== null && value !== undefined && value !== "")
    .map(([key, value]) => [labels[key], humanDetailValue(value)] as const);
}

async function startAutomation(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("automation");
  if (formData.get("safetyConfirmed") !== "on") redirect("/automation?error=safety_required");
  await startAutomationSession({
    user,
    templateId: String(formData.get("templateId") || "") || null,
    trackerTypeId: String(formData.get("trackerTypeId") || "") || null,
    title: String(formData.get("title") || "") || null,
    notes: String(formData.get("notes") || "") || null,
    source: "WEB",
    role: "OWNER"
  });
  redirect("/automation");
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
    role: "OWNER",
    override: formData.get("override") === "on",
    reason: String(formData.get("reason") || "") || null
  });
  redirect("/automation");
}

async function requestImage(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("automation");
  await createAutomationImageRequest({
    user,
    sessionId: String(formData.get("sessionId") || ""),
    deviceId: String(formData.get("deviceId") || "") || null,
    capabilityId: String(formData.get("capabilityId") || "") || null,
    reason: String(formData.get("reason") || "") || null
  });
  redirect("/automation");
}

export default async function AutomationPage(props: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  await requireFeature("automation");
  const user = await currentUser();
  if (!user) redirect("/login");
  const searchParams = props.searchParams ? await props.searchParams : {};
  const error = typeof searchParams.error === "string" ? searchParams.error : "";
  const tenantId = user.tenantId || "";
  const [trackers, templates, sessions, devices, events, tenantUsers] = await Promise.all([
    prisma.trackerType.findMany({
      where: { enabled: true, allowOpenSession: true, ...(tenantId ? { OR: [{ tenantId }, { tenantId: null }] } : { tenantId: null }) },
      orderBy: { title: "asc" }
    }),
    prisma.automationSessionTemplate.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true, description: true, defaultTrackerTypeId: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    }),
    prisma.automationSession.findMany({
      where: { tenantId, ownerId: user.id },
      include: {
        trackerType: true,
        trackerEntry: true,
        imageRequests: { include: { file: true, device: true, capability: true, requester: { include: { profile: true } } }, orderBy: { requestedAt: "desc" } },
        events: {
          include: { actor: { include: { profile: true } }, device: true, capability: true, rule: true, action: true },
          orderBy: { createdAt: "desc" },
          take: 20
        }
      },
      orderBy: [{ state: "asc" }, { createdAt: "desc" }],
      take: 20
    }),
    prisma.automationDevice.findMany({ where: { tenantId }, include: { capabilities: true }, orderBy: { name: "asc" } }),
    prisma.automationEvent.findMany({
      where: { tenantId, type: { not: "bridge_heartbeat" } },
      include: {
        actor: { include: { profile: true } },
        session: { select: { id: true, title: true, state: true } },
        rule: { select: { id: true, name: true } },
        ruleVersion: { select: { version: true, descriptionText: true } },
        action: { select: { id: true, type: true, status: true, dueAt: true, error: true } },
        device: true,
        capability: true,
        parentEvent: { select: { id: true, type: true, title: true, createdAt: true } },
        childEvents: { select: { id: true, type: true, title: true, createdAt: true }, orderBy: { createdAt: "asc" }, take: 3 }
      },
      orderBy: { createdAt: "desc" },
      take: 80
    }),
    prisma.user.findMany({
      where: { OR: [{ tenantId }, { memberships: { some: { tenantId, active: true } } }] },
      include: { profile: true },
      take: 200
    })
  ]);
  const userNames = new Map(tenantUsers.map((item) => [item.id, item.profile?.displayName || item.name || item.username || item.email]));
  const running = sessions.filter((session) => session.state === "RUNNING" || session.state === "PENDING_END");
  const history = sessions.filter((session) => session.state !== "RUNNING" && session.state !== "PENDING_END");
  const cameraCapabilities = devices.flatMap((device) => device.capabilities.filter((capability) => capability.kind.toLowerCase() === "camera").map((capability) => ({ device, capability })));

  return (
    <AppShell>
      <PageHeader
        title="Automation"
        action={<Link href="/settings/automation" className="focus-ring inline-flex min-h-11 items-center rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white shadow-soft hover:bg-redbrand/90">Regeln und Geräte</Link>}
      />
      <PageGuide title="Session-Automation">
        Automation verbindet Tracker-Sessions mit Regeln, Zeitfenstern, Geräten, Kamera-Anfragen und der ioBroker-Gerätebrücke. Zeitlogik und Status liegen im Portal, externe Systeme führen nur die geplanten Gerätebefehle aus.
      </PageGuide>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Panel>
            <h2 className="text-lg font-semibold text-ink">Session starten</h2>
            {templates.length ? (
              <AutomationSessionStartForm action={startAutomation} templates={templates} trackers={trackers} safetyError={error === "safety_required"} />
            ) : (
              <SoftPanel className="mt-4">Noch keine Session-Vorlage eingerichtet. Ein Administrator kann unter „Session-Vorlagen“ den ersten Ablauf anlegen.</SoftPanel>
            )}
          </Panel>

          <Panel>
            <h2 className="text-lg font-semibold text-ink">Aktive Sessions</h2>
            <div className="mt-4 space-y-3">
              {running.length ? running.map((session) => (
                <details key={session.id} open className="rounded-lg border border-line bg-paper p-4">
                  <summary className="cursor-pointer list-none font-semibold text-ink [&::-webkit-details-marker]:hidden">
                    {session.title} · gestartet {formatDateTime(session.startedAt)} · {labelAutomationValue("states", session.state)}
                  </summary>
                  <div className="mt-3 space-y-3 text-sm text-graphite">
                    <Link href={`/automation/sessions/${session.id}`} className="inline-flex min-h-10 items-center rounded-md bg-redbrand px-3 py-2 text-sm font-semibold text-white shadow-soft hover:bg-redbrand/90">
                      Detail öffnen
                    </Link>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-md border border-line bg-surface p-3">
                        <div className="text-xs uppercase tracking-wide text-graphite">Aktueller Zustand</div>
                        <div className="mt-1 font-semibold text-ink">{labelAutomationValue("states", session.state)}</div>
                      </div>
                      <div className="rounded-md border border-line bg-surface p-3">
                        <div className="text-xs uppercase tracking-wide text-graphite">Gekoppelter Tracker</div>
                        <div className="mt-1 font-semibold text-ink">{session.trackerType?.title || "Kein Tracker"}</div>
                      </div>
                      <div className="rounded-md border border-line bg-surface p-3">
                        <div className="text-xs uppercase tracking-wide text-graphite">Gestartet</div>
                        <div className="mt-1 font-semibold text-ink">{formatDateTime(session.startedAt)}</div>
                      </div>
                      <div className="rounded-md border border-line bg-surface p-3">
                        <div className="text-xs uppercase tracking-wide text-graphite">Bisherige Dauer</div>
                        <div className="mt-1 font-semibold text-ink">{session.startedAt ? `${minutesBetween(session.startedAt, new Date())} Minuten` : "Noch nicht gestartet"}</div>
                      </div>
                    </div>
                    {session.pendingEndAt ? (
                      <div className="rounded-lg border border-redbrand/40 bg-redbrand/10 p-4 text-ink">
                        <div className="font-semibold">Ende ist vorgemerkt</div>
                        <p className="mt-1 text-sm">Ein Ende wurde angefordert. Das bereits bestimmte Zeitfenster bleibt bei erneutem normalem Stop unverändert.</p>
                        <div className="mt-2 text-sm">Angefordert: {typeof detailsObject(session.stateJson).pendingEndRequestedAt === "string" ? formatDateTime(new Date(String(detailsObject(session.stateJson).pendingEndRequestedAt))) : "Zeitpunkt nicht gespeichert"}</div>
                        <div className="text-sm">Ausgelöst von: {typeof detailsObject(session.stateJson).pendingEndRequestedBy === "string" ? (userNames.get(String(detailsObject(session.stateJson).pendingEndRequestedBy)) || "Unbekannter Benutzer") : "Nicht gespeichert"}</div>
                        <div className="text-sm">Zeitmodell: {timeModelLabel(detailsObject(detailsObject(session.stateJson).pendingEndTiming))}</div>
                        <div className="mt-2 text-sm">Geplanter Ausführungszeitpunkt: {formatDateTime(session.pendingEndAt)}</div>
                        <div className="text-sm">Restzeit: {Math.max(0, minutesBetween(new Date(), session.pendingEndAt) ?? 0)} Minuten</div>
                        <form action={endAutomation} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                          <input type="hidden" name="sessionId" value={session.id} />
                          <input type="hidden" name="override" value="on" />
                          <Field label="Grund für sofortiges Beenden">
                            <input name="reason" className={inputClass} placeholder="Optional" />
                          </Field>
                          <div className="flex items-end">
                            <SubmitButton pendingLabel="Beendet..."><CircleStop className="h-4 w-4" /> Jetzt trotzdem beenden</SubmitButton>
                          </div>
                        </form>
                      </div>
                    ) : null}
                    {session.state === "RUNNING" ? (
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
                    {cameraCapabilities.length ? (
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
                    {session.imageRequests.length ? (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {session.imageRequests.map((request) => (
                          <div key={request.id} className="rounded-md border border-line bg-surface p-2 text-xs text-graphite">
                            {request.file ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={`/api/files/${request.file.id}`} alt="" className="aspect-square w-full rounded object-cover" />
                            ) : <div className="flex aspect-square items-center justify-center rounded bg-canvas text-xs">{labelAutomationValue("imageStatuses", request.status)}</div>}
                            <div className="mt-2 font-semibold text-ink">{labelAutomationValue("imageStatuses", request.status)}</div>
                            <div>{formatDateTime(request.requestedAt)}</div>
                            {request.device || request.capability ? <div>{[request.device?.name, request.capability?.title].filter(Boolean).join(" · ")}</div> : null}
                            {request.requester ? <div>Angefordert von: {actorLabel(request.requester)}</div> : null}
                            {request.reason ? <div>Anlass: {request.reason}</div> : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <details open className="rounded-md border border-line bg-surface p-3">
                      <summary className="cursor-pointer list-none font-semibold text-ink [&::-webkit-details-marker]:hidden">Ereignisverlauf dieser Session</summary>
                      <div className="mt-3 space-y-2">
                        {session.events.length ? session.events.map((event) => (
                          <div key={event.id} className="rounded-md border border-line bg-paper p-3">
                            <div className="font-semibold text-ink">{formatDateTime(event.createdAt)} · {automationEventLabel(event)}</div>
                            <div className="mt-1 text-sm text-graphite">
                              Ausgelöst von: {actorLabel(event.actor)} · Quelle: {labelAutomationValue("sources", event.source)} · Rolle: {labelAutomationValue("roles", event.role)}
                            </div>
                            {event.device || event.capability || event.rule ? (
                              <div className="mt-1 text-sm text-graphite">
                                {[event.rule ? `Regel: ${event.rule.name}` : "", event.device ? `Gerät: ${event.device.name}` : "", event.capability ? `Fähigkeit: ${event.capability.title}` : ""].filter(Boolean).join(" · ")}
                              </div>
                            ) : null}
                            <details className="mt-2 rounded bg-surface p-2">
                              <summary className="cursor-pointer list-none text-xs font-semibold text-ink [&::-webkit-details-marker]:hidden">Technische Details</summary>
                              <pre className="mt-2 max-h-52 overflow-auto text-xs text-graphite">{JSON.stringify({ type: event.type, correlationId: event.correlationId, ruleId: event.ruleId, ruleVersionId: event.ruleVersionId, actionId: event.actionId, deviceId: event.deviceId, capabilityId: event.capabilityId, details: event.detailsJson, raw: event.rawJson }, null, 2)}</pre>
                            </details>
                          </div>
                        )) : <div className="text-sm text-graphite">Noch keine Ereignisse für diese Session.</div>}
                      </div>
                    </details>
                    <details className="rounded-md border border-line bg-surface p-3">
                      <summary className="cursor-pointer list-none font-semibold text-ink [&::-webkit-details-marker]:hidden">Technische Details</summary>
                      <pre className="mt-2 overflow-auto text-xs">{JSON.stringify({ id: session.id, correlationId: session.correlationId, state: session.state, trackerTypeId: session.trackerTypeId, trackerEntryId: session.trackerEntryId, stateJson: session.stateJson }, null, 2)}</pre>
                    </details>
                  </div>
                </details>
              )) : <SoftPanel><Timer className="h-5 w-5 text-redbrand" /> Keine aktive Automation-Session.</SoftPanel>}
            </div>
          </Panel>

          <Panel>
            <h2 className="text-lg font-semibold text-ink">Session-Historie</h2>
            <div className="mt-4 space-y-2">
              {history.length ? history.map((session) => (
                <details key={session.id} className="rounded-lg border border-line bg-paper p-4">
                  <summary className="cursor-pointer list-none font-semibold text-ink [&::-webkit-details-marker]:hidden">
                    {session.title} · gestartet {formatDateTime(session.startedAt)} · {labelAutomationValue("states", session.state)}
                  </summary>
                  <div className="mt-3 space-y-3">
                    <Link href={`/automation/sessions/${session.id}`} className="inline-flex min-h-10 items-center rounded-md bg-redbrand px-3 py-2 text-sm font-semibold text-white shadow-soft hover:bg-redbrand/90">
                      Detail öffnen
                    </Link>
                    <div className="grid gap-2 text-sm text-graphite sm:grid-cols-2">
                      <div>Tracker: <span className="font-semibold text-ink">{session.trackerType?.title || "Kein Tracker"}</span></div>
                      <div>Start: <span className="font-semibold text-ink">{formatDateTime(session.startedAt)}</span></div>
                      <div>Ende: <span className="font-semibold text-ink">{formatDateTime(session.finishedAt || session.cancelledAt)}</span></div>
                      <div>Dauer: <span className="font-semibold text-ink">{session.startedAt && (session.finishedAt || session.cancelledAt) ? `${minutesBetween(session.startedAt, session.finishedAt || session.cancelledAt)} Minuten` : "Nicht berechnet"}</span></div>
                    </div>
                  </div>
                  <details className="mt-3 rounded-md border border-line bg-surface p-3">
                    <summary className="cursor-pointer list-none text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">Ereignisse anzeigen</summary>
                    <div className="mt-3 space-y-2">
                      {session.events.length ? session.events.map((event) => (
                        <div key={event.id} className="rounded-md border border-line bg-paper p-3 text-sm text-graphite">
                          <div className="font-semibold text-ink">{formatDateTime(event.createdAt)} · {automationEventLabel(event)}</div>
                          <div>Ausgelöst von: {actorLabel(event.actor)} · Quelle: {labelAutomationValue("sources", event.source)}</div>
                        </div>
                      )) : <div>Keine Ereignisse gespeichert.</div>}
                    </div>
                  </details>
                </details>
              )) : <SoftPanel><Timer className="h-5 w-5 text-redbrand" /> Noch keine abgeschlossenen Automation-Sessions.</SoftPanel>}
            </div>
          </Panel>
        </div>

        <Panel>
          <h2 className="text-lg font-semibold text-ink">Ereignisverlauf</h2>
          <div className="mt-3 space-y-2">
            {events.map((event) => {
              const details = detailsObject(event.detailsJson);
              const detailEntries = humanEventDetails(details);
              return (
                <details id={`automation-overview-event-${event.id}`} key={event.id} className="scroll-mt-24 rounded-md border border-line bg-paper p-3">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
                    {formatDateTime(event.createdAt)} · {automationEventLabel(event)}
                  </summary>
                  <div className="mt-3 space-y-2 text-sm text-graphite">
                    <div className="rounded-md border border-line bg-surface p-3">
                      <div className="font-semibold text-ink">{event.title}</div>
                      <div className="mt-1">Ausgelöst von: {actorLabel(event.actor)} · Quelle: {labelAutomationValue("sources", event.source)} · Rolle: {labelAutomationValue("roles", event.role)}</div>
                    </div>
                    {event.session || event.rule || event.action || event.device || event.capability ? (
                      <div className="grid gap-2">
                        {event.session ? (
                          <Link href={`/automation/sessions/${event.session.id}`} className="rounded-md border border-line bg-surface p-3 hover:border-redbrand">
                            <div className="text-xs uppercase text-graphite">Session</div>
                            <div className="mt-1 font-semibold text-ink">{event.session.title}</div>
                            <div>Status: {labelAutomationValue("states", event.session.state)}</div>
                          </Link>
                        ) : null}
                        {event.rule ? (
                          <div className="rounded-md border border-line bg-surface p-3">
                            <div className="text-xs uppercase text-graphite">Regel</div>
                            <div className="mt-1 font-semibold text-ink">{event.rule.name}</div>
                            {event.ruleVersion ? <div>Version {event.ruleVersion.version}</div> : null}
                            {event.ruleVersion?.descriptionText ? <div className="mt-1">{event.ruleVersion.descriptionText}</div> : null}
                          </div>
                        ) : null}
                        {event.action ? (
                          <div className="rounded-md border border-line bg-surface p-3">
                            <div className="text-xs uppercase text-graphite">Aktion</div>
                            <div className="mt-1 font-semibold text-ink">{actionLabels[event.action.type as keyof typeof actionLabels] || "Automation-Aktion"}</div>
                            <div>Status: {labelAutomationValue("actionStatuses", event.action.status)}</div>
                            {event.action.dueAt ? <div>Fällig: {formatDateTime(event.action.dueAt)}</div> : null}
                            {event.action.error ? <div>Fehler: {event.action.error}</div> : null}
                          </div>
                        ) : null}
                        {event.device || event.capability ? (
                          <div className="rounded-md border border-line bg-surface p-3">
                            <div className="text-xs uppercase text-graphite">Gerät</div>
                            {event.device ? <div className="mt-1 font-semibold text-ink">{event.device.name}</div> : null}
                            {event.capability ? <div>{event.capability.title} · {labelAutomationValue("capabilityKinds", event.capability.kind)} · {labelAutomationValue("health", event.capability.state)}</div> : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {detailEntries.length ? (
                      <div className="rounded-md border border-line bg-surface p-3">
                        <div className="text-xs uppercase text-graphite">Details</div>
                        <div className="mt-2 grid gap-1">
                          {detailEntries.slice(0, 5).map(([label, value]) => (
                            <div key={label} className="grid gap-1 sm:grid-cols-[140px_1fr]">
                              <span className="font-medium text-ink">{label}</span>
                              <span>{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {event.parentEvent || event.childEvents.length ? (
                      <div className="rounded-md border border-line bg-surface p-3">
                        <div className="text-xs uppercase text-graphite">Ursache und Folge</div>
                        {event.parentEvent ? (
                          <a className="mt-1 block font-medium text-redbrand hover:underline" href={`#automation-overview-event-${event.parentEvent.id}`}>
                            Ausgelöst durch: {formatDateTime(event.parentEvent.createdAt)} · {automationEventLabel(event.parentEvent)}
                          </a>
                        ) : null}
                        {event.childEvents.map((child) => (
                          <a key={child.id} className="block font-medium text-redbrand hover:underline" href={`#automation-overview-event-${child.id}`}>
                            Folge: {formatDateTime(child.createdAt)} · {automationEventLabel(child)}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <details className="mt-2 rounded bg-surface p-2">
                    <summary className="cursor-pointer list-none text-xs font-semibold text-ink [&::-webkit-details-marker]:hidden">Technische Details</summary>
                    <pre className="mt-2 max-h-52 overflow-auto text-xs text-graphite">{JSON.stringify({ type: event.type, source: event.source, role: event.role, correlationId: event.correlationId, sessionId: event.sessionId, ruleId: event.ruleId, ruleVersionId: event.ruleVersionId, actionId: event.actionId, deviceId: event.deviceId, capabilityId: event.capabilityId, details: event.detailsJson, raw: event.rawJson }, null, 2)}</pre>
                  </details>
                </details>
              );
            })}
          </div>
          <Link href="/settings/automation" className="mt-4 inline-flex text-sm font-semibold text-redbrand">Regeln konfigurieren</Link>
        </Panel>
      </div>
    </AppShell>
  );
}
