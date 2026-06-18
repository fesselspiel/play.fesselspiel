import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Save, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Field, inputClass, PageGuide, PageHeader } from "@/components/ui";
import { ownerScope } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { formatDateTimeLocal } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

async function updateEvent(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id"));
  const event = await prisma.event.findFirst({ where: { id, ...(await ownerScope(user)) } });
  if (!event) notFound();
  await prisma.event.update({
    where: { id: event.id },
    data: {
      title: String(formData.get("title") || "").trim(),
      location: String(formData.get("location") || "").trim(),
      startsAt: new Date(String(formData.get("startsAt"))),
      description: String(formData.get("description") || "").trim()
    }
  });
  redirect("/events");
}

async function deleteEvent(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id"));
  const event = await prisma.event.findFirst({ where: { id, ...(await ownerScope(user)) } });
  if (!event) notFound();
  await prisma.event.delete({ where: { id: event.id } });
  redirect("/events");
}

export default async function EditEventPage({ params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const event = await prisma.event.findFirst({ where: { id: params.id, ...(await ownerScope(user)) } });
  if (!event) notFound();

  return (
    <AppShell>
      <PageHeader title="Event bearbeiten" subtitle={event.title} />
      <PageGuide>
        Aendere hier Titel, Ort, Startzeit und Beschreibung des Events. Beim Loeschen werden der Termin und seine Check-ins entfernt.
      </PageGuide>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <form action={updateEvent} className="max-w-2xl space-y-4">
          <input type="hidden" name="id" value={event.id} />
          <Field label="Titel"><input className={inputClass} name="title" required defaultValue={event.title} /></Field>
          <Field label="Ort"><input className={inputClass} name="location" defaultValue={event.location || ""} /></Field>
          <Field label="Start"><input className={inputClass} name="startsAt" type="datetime-local" required defaultValue={formatDateTimeLocal(event.startsAt)} /></Field>
          <Field label="Beschreibung"><textarea className={inputClass} name="description" rows={4} defaultValue={event.description || ""} /></Field>
          <div className="flex flex-wrap gap-2">
            <Button><Save className="h-4 w-4" /> Aenderungen speichern</Button>
            <Link href="/events" className="focus-ring inline-flex min-h-10 items-center justify-center rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
              Abbrechen
            </Link>
          </div>
        </form>
        <form action={deleteEvent} className="rounded-lg border border-line bg-paper p-5">
          <input type="hidden" name="id" value={event.id} />
          <h2 className="text-lg font-semibold">Loeschen</h2>
          <p className="mt-2 text-sm text-graphite">Entfernt den Termin inklusive Check-ins.</p>
          <Button variant="danger" className="mt-4 w-full"><Trash2 className="h-4 w-4" /> Event loeschen</Button>
        </form>
      </div>
    </AppShell>
  );
}
