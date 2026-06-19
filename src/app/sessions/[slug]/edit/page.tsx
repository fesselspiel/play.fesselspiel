import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Save, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Field, inputClass, PageGuide, PageHeader, selectClass } from "@/components/ui";
import { ownerScope } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { formatDateTimeLocal, minutesBetween } from "@/lib/dates";
import { moodAfter, moodBefore } from "@/lib/moods";
import { prisma } from "@/lib/prisma";
import { uniqueSessionSlug } from "@/lib/session-slug";

type MoodBeforeValue = keyof typeof moodBefore;
type MoodAfterValue = keyof typeof moodAfter;

async function updateSession(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id"));
  const session = await prisma.segufixSession.findFirst({ where: { id, ...(await ownerScope(user)) } });
  if (!session) notFound();
  const startTime = new Date(String(formData.get("startTime")));
  const endRaw = String(formData.get("endTime") || "");
  const endTime = endRaw ? new Date(endRaw) : null;
  await prisma.segufixSession.update({
    where: { id: session.id },
    data: {
      slug: session.slug || await uniqueSessionSlug(startTime, session.id),
      startTime,
      endTime,
      durationMinutes: minutesBetween(startTime, endTime),
      notes: String(formData.get("notes") || "").trim(),
      moodBefore: String(formData.get("moodBefore") || "NEUTRAL") as MoodBeforeValue,
      moodBeforeText: String(formData.get("moodBeforeText") || "").trim(),
      moodAfter: String(formData.get("moodAfter") || "RELAXED") as MoodAfterValue,
      moodAfterText: String(formData.get("moodAfterText") || "").trim()
    }
  });
  redirect(`/sessions?year=${startTime.getFullYear()}#session-${session.id}`);
}

async function deleteSession(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id"));
  const session = await prisma.segufixSession.findFirst({ where: { id, ...(await ownerScope(user)) } });
  if (!session) notFound();
  const year = session.startTime.getFullYear();
  await prisma.segufixSession.delete({ where: { id: session.id } });
  redirect(`/sessions?year=${year}`);
}

export default async function EditSessionPage({ params }: { params: { slug: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const session = await prisma.segufixSession.findFirst({ where: { ...(await ownerScope(user)), OR: [{ id: params.slug }, { slug: params.slug }] } });
  if (!session) notFound();

  return (
    <AppShell>
      <PageHeader title="Session bearbeiten" />
      <PageGuide title="Zeiten, Stimmung und Notizen aktualisieren">
        Korrigiere hier Zeiten, Stimmungen und Notizen einer Session. Die Dauer wird aus Start- und Endzeit neu berechnet; Loeschen entfernt den Eintrag aus Kalender und Auswertungen.
      </PageGuide>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <form action={updateSession} className="max-w-2xl space-y-4">
          <input type="hidden" name="id" value={session.id} />
          <Field label="Startzeit"><input className={inputClass} name="startTime" type="datetime-local" required defaultValue={formatDateTimeLocal(session.startTime)} /></Field>
          <Field label="Endzeit"><input className={inputClass} name="endTime" type="datetime-local" defaultValue={formatDateTimeLocal(session.endTime)} /></Field>
          <Field label="Stimmung vorher">
            <select className={selectClass} name="moodBefore" defaultValue={session.moodBefore || "NEUTRAL"}>
              {Object.entries(moodBefore).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Stimmung vorher Text"><textarea className={inputClass} name="moodBeforeText" rows={2} defaultValue={session.moodBeforeText || ""} /></Field>
          <Field label="Stimmung nachher">
            <select className={selectClass} name="moodAfter" defaultValue={session.moodAfter || "RELAXED"}>
              {Object.entries(moodAfter).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Stimmung nachher Text"><textarea className={inputClass} name="moodAfterText" rows={2} defaultValue={session.moodAfterText || ""} /></Field>
          <Field label="Notizen"><textarea className={inputClass} name="notes" rows={4} defaultValue={session.notes || ""} /></Field>
          <div className="flex flex-wrap gap-2">
            <Button><Save className="h-4 w-4" /> Aenderungen speichern</Button>
            <Link href={`/sessions?year=${session.startTime.getFullYear()}#session-${session.id}`} className="focus-ring inline-flex min-h-10 items-center justify-center rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
              Abbrechen
            </Link>
          </div>
        </form>
        <form action={deleteSession} className="rounded-lg border border-line bg-paper p-5">
          <input type="hidden" name="id" value={session.id} />
          <h2 className="text-lg font-semibold">Loeschen</h2>
          <p className="mt-2 text-sm text-graphite">Entfernt diese Session aus Historie, Auswertung und Kalender.</p>
          <Button variant="danger" className="mt-4 w-full"><Trash2 className="h-4 w-4" /> Session loeschen</Button>
        </form>
      </div>
    </AppShell>
  );
}
