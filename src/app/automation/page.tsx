import Link from "next/link";
import { redirect } from "next/navigation";
import { Camera, CircleStop, Play, Timer } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { Field, inputClass, PageGuide, PageHeader, Panel, SoftPanel } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";
import { createAutomationImageRequest, requestAutomationEnd, startAutomationSession } from "@/lib/session-automation";

async function startAutomation(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("automation");
  await startAutomationSession({
    user,
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

export default async function AutomationPage() {
  await requireFeature("automation");
  const user = await currentUser();
  if (!user) redirect("/login");
  const tenantId = user.tenantId || "";
  const [trackers, sessions, devices, events] = await Promise.all([
    prisma.trackerType.findMany({
      where: { enabled: true, allowOpenSession: true, ...(tenantId ? { OR: [{ tenantId }, { tenantId: null }] } : { tenantId: null }) },
      orderBy: { title: "asc" }
    }),
    prisma.automationSession.findMany({
      where: { tenantId, ownerId: user.id },
      include: { trackerType: true, trackerEntry: true, imageRequests: { include: { file: true }, orderBy: { requestedAt: "desc" } } },
      orderBy: [{ state: "asc" }, { createdAt: "desc" }],
      take: 20
    }),
    prisma.automationDevice.findMany({ where: { tenantId }, include: { capabilities: true }, orderBy: { name: "asc" } }),
    prisma.automationEvent.findMany({ where: { tenantId }, include: { actor: { include: { profile: true } }, device: true, capability: true }, orderBy: { createdAt: "desc" }, take: 80 })
  ]);
  const running = sessions.filter((session) => session.state === "RUNNING" || session.state === "PENDING_END");
  const cameraCapabilities = devices.flatMap((device) => device.capabilities.filter((capability) => capability.kind.toLowerCase() === "camera").map((capability) => ({ device, capability })));

  return (
    <AppShell>
      <PageHeader
        title="Automation"
        action={<Link href="/settings/automation" className="focus-ring inline-flex min-h-11 items-center rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white shadow-soft hover:bg-redbrand/90">Regeln und Geräte</Link>}
      />
      <PageGuide title="Session-Automation">
        Automation verbindet Tracker-Sessions mit Regeln, Zeitfenstern, Geräten, Kamera-Anfragen und dem ioBroker-Bridge-Protokoll. Timing und Status liegen im Portal, externe Systeme führen nur Commands aus.
      </PageGuide>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Panel>
            <h2 className="text-lg font-semibold text-ink">Session starten</h2>
            <form action={startAutomation} className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Tracker">
                <select name="trackerTypeId" className={inputClass} required>
                  {trackers.map((tracker) => <option key={tracker.id} value={tracker.id}>{tracker.title}</option>)}
                </select>
              </Field>
              <Field label="Titel">
                <input name="title" className={inputClass} placeholder="Optional" />
              </Field>
              <Field label="Notiz">
                <input name="notes" className={inputClass} placeholder="Optional" />
              </Field>
              <div className="flex items-end">
                <SubmitButton pendingLabel="Startet..."><Play className="h-4 w-4" /> Starten</SubmitButton>
              </div>
            </form>
          </Panel>

          <Panel>
            <h2 className="text-lg font-semibold text-ink">Aktive Sessions</h2>
            <div className="mt-4 space-y-3">
              {running.length ? running.map((session) => (
                <details key={session.id} open className="rounded-lg border border-line bg-paper p-4">
                  <summary className="cursor-pointer list-none font-semibold text-ink [&::-webkit-details-marker]:hidden">
                    {session.title} · {session.state === "PENDING_END" ? "Ende geplant" : "läuft"}
                  </summary>
                  <div className="mt-3 space-y-3 text-sm text-graphite">
                    <p>Gestartet: {formatDateTime(session.startedAt)}</p>
                    {session.pendingEndAt ? <p>Geplantes Ende: {formatDateTime(session.pendingEndAt)}</p> : null}
                    <form action={endAutomation} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <input type="hidden" name="sessionId" value={session.id} />
                      <Field label="Verzögerung Minuten">
                        <input name="delayMinutes" type="number" min={0} defaultValue={0} className={inputClass} />
                      </Field>
                      <Field label="Grund">
                        <input name="reason" className={inputClass} placeholder="Optional" />
                      </Field>
                      <div className="flex items-end">
                        <SubmitButton pendingLabel="Plant..."><CircleStop className="h-4 w-4" /> Beenden</SubmitButton>
                      </div>
                    </form>
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
                          <SubmitButton pendingLabel="Fragt an..."><Camera className="h-4 w-4" /> Bild</SubmitButton>
                        </div>
                      </form>
                    ) : null}
                    {session.imageRequests.length ? (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {session.imageRequests.map((request) => (
                          <div key={request.id} className="rounded-md border border-line bg-surface p-2">
                            {request.file ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={`/api/files/${request.file.id}`} alt="" className="aspect-square w-full rounded object-cover" />
                            ) : <div className="flex aspect-square items-center justify-center rounded bg-canvas text-xs">{request.status}</div>}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </details>
              )) : <SoftPanel><Timer className="h-5 w-5 text-redbrand" /> Keine aktive Automation-Session.</SoftPanel>}
            </div>
          </Panel>
        </div>

        <Panel>
          <h2 className="text-lg font-semibold text-ink">Protokoll</h2>
          <div className="mt-3 space-y-2">
            {events.map((event) => (
              <details key={event.id} className="rounded-md border border-line bg-paper p-3">
                <summary className="cursor-pointer list-none text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  {formatDateTime(event.createdAt)} · {event.title}
                </summary>
                <pre className="mt-2 max-h-52 overflow-auto rounded bg-surface p-2 text-xs text-graphite">{JSON.stringify({ type: event.type, source: event.source, role: event.role, details: event.detailsJson, raw: event.rawJson }, null, 2)}</pre>
              </details>
            ))}
          </div>
          <Link href="/settings/automation" className="mt-4 inline-flex text-sm font-semibold text-redbrand">Regeln konfigurieren</Link>
        </Panel>
      </div>
    </AppShell>
  );
}
