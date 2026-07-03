import { redirect } from "next/navigation";
import Link from "next/link";
import { MapPin, Pencil, Save } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ShareButton } from "@/components/share-button";
import { Button, Field, inputClass, PageGuide, PageHeader, Panel, SoftPanel } from "@/components/ui";
import { ownerScope } from "@/lib/access";
import { logAction, userDisplayName } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/dates";
import { shareTargetsForUser } from "@/lib/share";

async function createEvent(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const event = await prisma.event.create({
    data: {
      tenantId: user.tenantId || undefined,
      ownerId: user.id,
      title: String(formData.get("title") || "").trim(),
      location: String(formData.get("location") || "").trim(),
      startsAt: new Date(String(formData.get("startsAt"))),
      description: String(formData.get("description") || "").trim()
    }
  });
  await logAction({
    actorId: user.id,
    action: "event_created",
    entityType: "event",
    entityId: event.id,
    title: `Event geplant: ${event.title} (${formatDateTime(event.startsAt)})`,
    href: `/events/${event.id}/edit`,
    details: { tenantId: event.tenantId, eventId: event.id, startsAt: event.startsAt.toISOString(), actor: userDisplayName(user) }
  });
  redirect("/events");
}

async function checkIn(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const eventId = String(formData.get("eventId"));
  const event = await prisma.event.findFirst({ where: { id: eventId, ...(await ownerScope(user)) } });
  if (!event) redirect("/events");
  await prisma.checkIn.upsert({
    where: { eventId_userId: { eventId, userId: user.id } },
    update: { note: String(formData.get("note") || "").trim() },
    create: { eventId, userId: user.id, note: String(formData.get("note") || "").trim() }
  });
  await logAction({
    actorId: user.id,
    action: "event_checkin_created",
    entityType: "event",
    entityId: event.id,
    title: `${userDisplayName(user)} hat eingecheckt: ${event.title}`,
    href: `/events/${event.id}/edit`,
    details: { tenantId: event.tenantId, eventId: event.id, startsAt: event.startsAt.toISOString() }
  });
  redirect("/events");
}

export default async function EventsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const [events, shareTargets] = await Promise.all([
    prisma.event.findMany({ where: await ownerScope(user), include: { checkIns: true }, orderBy: { startsAt: "asc" } }),
    shareTargetsForUser(user)
  ]);
  return (
    <AppShell>
      <PageHeader title="Events" />
      <PageGuide title="Termine und Teilnahme dokumentieren">
        Events dienen zur Terminverwaltung und Teilnahme-Dokumentation. Lege links einen Termin an, nutze rechts Bearbeiten für Änderungen und trage Check-in-Notizen ein, wenn du teilgenommen hast.
      </PageGuide>
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Panel>
          <h2 className="mb-4 text-lg font-semibold">Termin anlegen</h2>
          <form action={createEvent} className="space-y-4">
            <Field label="Titel"><input className={inputClass} name="title" required /></Field>
            <Field label="Ort"><input className={inputClass} name="location" /></Field>
            <Field label="Start"><input className={inputClass} name="startsAt" type="datetime-local" required /></Field>
            <Field label="Beschreibung"><textarea className={inputClass} name="description" rows={4} /></Field>
            <Button><Save className="h-4 w-4" /> Speichern</Button>
          </form>
        </Panel>
        <div className="space-y-4">
          {events.map((event) => (
            <SoftPanel key={event.id}>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold">{event.title}</h2>
                <Link href={`/events/${event.id}/edit`} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm font-semibold hover:bg-paper">
                  <Pencil className="h-4 w-4" />
                  Bearbeiten
                </Link>
              </div>
              <p className="mt-1 text-sm text-graphite">{formatDateTime(event.startsAt)}</p>
              {event.location ? <p className="mt-1 flex items-center gap-2 text-sm text-graphite"><MapPin className="h-4 w-4" /> {event.location}</p> : null}
              <p className="mt-3 text-sm text-graphite">{event.description}</p>
              <div className="mt-3">
                <ShareButton entityType="event" entityId={event.id} title={event.title} href={`/events/${event.id}/edit`} text={event.description} targets={shareTargets} defaultChannel={user.settings?.shareDefaultChannel} messageTemplate={user.settings?.shareMessageTemplate} />
              </div>
              <form action={checkIn} className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input name="eventId" value={event.id} type="hidden" />
                <input className={inputClass} name="note" placeholder="Check-in Notiz" />
                <Button>Einchecken</Button>
              </form>
              <p className="mt-2 text-xs text-graphite">{event.checkIns.length} Check-ins</p>
            </SoftPanel>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
