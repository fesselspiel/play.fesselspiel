import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Save, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Field, inputClass, PageGuide, PageHeader } from "@/components/ui";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { formatDateTimeLocal, minutesBetween, parseDateTimeLocal } from "@/lib/dates";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";

async function updateKgSession(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("tracker.kg");
  const id = String(formData.get("id") || "");
  const session = await prisma.kgSession.findFirst({ where: { id, ...(await ownerScope(user)) } });
  if (!session) notFound();
  const startTime = parseDateTimeLocal(String(formData.get("startTime"))) || session.startTime;
  const endRaw = String(formData.get("endTime") || "");
  const endTime = endRaw ? parseDateTimeLocal(endRaw) : null;
  const updated = await prisma.kgSession.update({
    where: { id: session.id },
    data: {
      startTime,
      endTime,
      durationMinutes: minutesBetween(startTime, endTime),
      notes: String(formData.get("notes") || "").trim()
    }
  });
  await logAction({
    actorId: user.id,
    action: "kg_updated",
    entityType: "kgSession",
    entityId: updated.id,
    title: "KG-Tracker-Eintrag bearbeitet",
    href: `/sessions/kg/${updated.id}`
  });
  redirect(`/sessions/kg/${updated.id}`);
}

async function deleteKgSession(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("tracker.kg");
  const id = String(formData.get("id") || "");
  const session = await prisma.kgSession.findFirst({ where: { id, ...(await ownerScope(user)) } });
  if (!session) notFound();
  const year = session.startTime.getFullYear();
  await prisma.kgSession.delete({ where: { id: session.id } });
  await logAction({
    actorId: user.id,
    action: "kg_deleted",
    entityType: "kgSession",
    entityId: session.id,
    title: `KG-Tracker-Eintrag vom ${session.startTime.toLocaleDateString("de-DE")} gelöscht`,
    details: { startTime: session.startTime.toISOString() }
  });
  redirect(`/sessions?tracker=kg&year=${year}`);
}

export default async function EditKgSessionPage({ params }: { params: { id: string } }) {
  await requireFeature("tracker.kg");
  const user = await currentUser();
  if (!user) redirect("/login");
  const session = await prisma.kgSession.findFirst({ where: { id: params.id, ...(await ownerScope(user)) } });
  if (!session) notFound();

  return (
    <AppShell>
      <PageHeader title="KG-Eintrag bearbeiten" />
      <PageGuide title="KG-Zeiten und Beschreibung aktualisieren">
        Korrigiere hier Startzeit, Endzeit und Sessionbeschreibung. Die Dauer wird beim Speichern neu berechnet; Löschen entfernt den Eintrag aus Historie, Auswertung und Kalender.
      </PageGuide>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <form action={updateKgSession} className="max-w-2xl space-y-4">
          <input type="hidden" name="id" value={session.id} />
          <Field label="Startzeit"><input className={inputClass} name="startTime" type="datetime-local" step={60} required defaultValue={formatDateTimeLocal(session.startTime)} /></Field>
          <Field label="Endzeit"><input className={inputClass} name="endTime" type="datetime-local" step={60} defaultValue={formatDateTimeLocal(session.endTime)} /></Field>
          <Field label="Sessionbeschreibung"><textarea className={inputClass} name="notes" rows={6} defaultValue={session.notes || ""} /></Field>
          <div className="flex flex-wrap gap-2">
            <Button><Save className="h-4 w-4" /> Änderungen speichern</Button>
            <Link href={`/sessions/kg/${session.id}`} className="focus-ring inline-flex min-h-10 items-center justify-center rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
              Abbrechen
            </Link>
          </div>
        </form>
        <form action={deleteKgSession} className="rounded-lg border border-line bg-paper p-5">
          <input type="hidden" name="id" value={session.id} />
          <h2 className="text-lg font-semibold">Löschen</h2>
          <p className="mt-2 text-sm text-graphite">Entfernt diesen KG-Eintrag aus Historie, Auswertung und Kalender.</p>
          <Button variant="danger" className="mt-4 w-full"><Trash2 className="h-4 w-4" /> KG-Eintrag löschen</Button>
        </form>
      </div>
    </AppShell>
  );
}
