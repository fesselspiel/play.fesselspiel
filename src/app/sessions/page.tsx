import { redirect } from "next/navigation";
import Link from "next/link";
import { Pencil, Save } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Field, inputClass, PageGuide, PageHeader, Panel, selectClass, SoftPanel } from "@/components/ui";
import { logAction } from "@/lib/audit";
import { ownerScope } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatMinutes, minutesBetween } from "@/lib/dates";
import { moodAfter, moodBefore, moodScore, neutralMood } from "@/lib/moods";
import { ensureSessionSlug, uniqueSessionSlug } from "@/lib/session-slug";

type MoodBeforeValue = keyof typeof moodBefore;
type MoodAfterValue = keyof typeof moodAfter;

async function createSession(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const startTime = new Date(String(formData.get("startTime")));
  const endRaw = String(formData.get("endTime") || "");
  const endTime = endRaw ? new Date(endRaw) : null;
  const slug = await uniqueSessionSlug(startTime);
  const session = await prisma.segufixSession.create({
    data: {
      ownerId: user.id,
      slug,
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
  await logAction({
    actorId: user.id,
    action: "session_created",
    entityType: "session",
    entityId: session.id,
    title: "Session angelegt",
    href: `/sessions/${session.slug}`
  });
  redirect("/sessions");
}

const months = ["Januar", "Februar", "Maerz", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export default async function SessionsPage({ searchParams }: { searchParams: { year?: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const year = Number(searchParams.year || new Date().getFullYear());
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);
  const sessions = await prisma.segufixSession.findMany({ where: { ...(await ownerScope(user)), startTime: { gte: yearStart, lt: yearEnd } }, orderBy: { startTime: "desc" } });
  const sessionSlugs = new Map(await Promise.all(sessions.map(async (session) => [session.id, await ensureSessionSlug(session)] as const)));
  const totalMinutes = sessions.reduce((sum, session) => sum + (session.durationMinutes || 0), 0);
  const avgDuration = sessions.length ? Math.round(totalMinutes / sessions.length) : 0;
  const afterScores: number[] = sessions.map((s) => (s.moodAfter ? moodScore[s.moodAfter] : 0)).filter(Boolean);
  const avgAfter = afterScores.length ? (afterScores.reduce((a, b) => a + b, 0) / afterScores.length).toFixed(1) : "-";
  const openSessions = sessions.filter((session) => !session.endTime);
  const byDay = new Map<string, typeof sessions>();
  for (const session of sessions) {
    const key = `${session.startTime.getMonth()}-${session.startTime.getDate()}`;
    byDay.set(key, [...(byDay.get(key) || []), session]);
  }

  return (
    <AppShell>
      <PageHeader title="Segufix-Timetracker" />
      <PageGuide title="Session-Erfassung, Jahresuebersicht und Auswertung">
        Der Timetracker dokumentiert Sessions mit Start, Ende, Dauer, Stimmung und Notizen. Erfasse links neue Eintraege, nutze den Jahreskalender zur Orientierung und bearbeite bestehende Sessions in der Historie.
      </PageGuide>
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Panel>
          <h2 className="mb-4 text-lg font-semibold">Session erfassen</h2>
          <form action={createSession} className="space-y-4">
            <Field label="Startzeit"><input className={inputClass} name="startTime" type="datetime-local" required /></Field>
            <Field label="Endzeit"><input className={inputClass} name="endTime" type="datetime-local" /></Field>
            <Field label="Stimmung vorher">
              <select className={selectClass} name="moodBefore" defaultValue="NEUTRAL">
                {Object.entries(moodBefore).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Stimmung vorher Text"><textarea className={inputClass} name="moodBeforeText" rows={2} /></Field>
            <Field label="Stimmung nachher">
              <select className={selectClass} name="moodAfter" defaultValue="RELAXED">
                {Object.entries(moodAfter).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Stimmung nachher Text"><textarea className={inputClass} name="moodAfterText" rows={2} /></Field>
            <Field label="Notizen"><textarea className={inputClass} name="notes" rows={4} /></Field>
            <Button><Save className="h-4 w-4" /> Session speichern</Button>
          </form>
        </Panel>
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <SoftPanel><div className="text-sm text-graphite">Sessions</div><div className="mt-2 text-2xl font-semibold">{sessions.length}</div></SoftPanel>
            <SoftPanel><div className="text-sm text-graphite">Durchschnitt</div><div className="mt-2 text-2xl font-semibold">{formatMinutes(avgDuration)}</div></SoftPanel>
            <SoftPanel><div className="text-sm text-graphite">Stimmung nachher</div><div className="mt-2 text-2xl font-semibold">{avgAfter}/5</div></SoftPanel>
          </div>
          {openSessions.length ? (
            <Panel>
              <h2 className="mb-3 text-lg font-semibold">Laufende Sessions</h2>
              <div className="space-y-2">
                {openSessions.map((session) => (
                  <Link key={session.id} href={`/sessions/${sessionSlugs.get(session.id)}`} className="block rounded-md border border-redbrand bg-redbrand/10 p-3 text-sm hover:bg-redbrand/15">
                    <strong>{formatDateTime(session.startTime)}</strong>
                    <span className="ml-2 text-graphite">ohne Endzeit</span>
                  </Link>
                ))}
              </div>
            </Panel>
          ) : null}
          <Panel className="overflow-x-auto">
            <div className="mb-4 flex items-center justify-between gap-3">
              <a href={`/sessions?year=${year - 1}`} className="rounded-md border border-line px-3 py-2 text-sm">Zurueck</a>
              <h2 className="text-lg font-semibold">{year}</h2>
              <a href={`/sessions?year=${year + 1}`} className="rounded-md border border-line px-3 py-2 text-sm">Weiter</a>
            </div>
            <div className="grid calendar-grid gap-1 text-xs">
              <div />
              {Array.from({ length: 31 }, (_, i) => <div key={i} className="text-center text-graphite">{i + 1}</div>)}
              {months.map((month, monthIndex) => (
                <div key={month} className="contents">
                  <div key={`${month}-label`} className="py-1 font-medium text-graphite">{month}</div>
                  {Array.from({ length: 31 }, (_, dayIndex) => {
                    const day = dayIndex + 1;
                    const date = new Date(year, monthIndex, day);
                    const valid = date.getMonth() === monthIndex;
                    const daySessions = byDay.get(`${monthIndex}-${day}`) || [];
                    const minutes = daySessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
                    const className = `h-5 rounded-sm ${!valid ? "bg-transparent" : daySessions.length ? "bg-redbrand" : "bg-paper"}`;
                    if (!daySessions.length) return <span key={`${month}-${day}`} className={className} />;
                    return (
                      <a
                        key={`${month}-${day}`}
                        href={`/sessions/${sessionSlugs.get(daySessions[0].id)}`}
                        title={daySessions.length ? `${daySessions.length} Sessions, ${formatMinutes(minutes)}` : ""}
                        className={className}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </Panel>
          <Panel>
            <h2 className="mb-4 text-lg font-semibold">Historie</h2>
            <div className="space-y-3">
              {sessions.map((session) => (
                <article key={session.id} id={`session-${session.id}`} className="rounded-md border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <strong>{formatDateTime(session.startTime)}</strong>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-graphite">{formatMinutes(session.durationMinutes)}</span>
                      <Link href={`/sessions/${sessionSlugs.get(session.id)}`} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm font-semibold hover:bg-paper">
                        Details
                      </Link>
                      <Link href={`/sessions/${sessionSlugs.get(session.id)}/edit`} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line px-3 py-1.5 text-sm font-semibold hover:bg-paper">
                        <Pencil className="h-4 w-4" />
                        Bearbeiten
                      </Link>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-graphite">Vorher: {session.moodBefore ? moodBefore[session.moodBefore] : neutralMood} · Nachher: {session.moodAfter ? moodAfter[session.moodAfter] : neutralMood}</p>
                  {session.notes ? <p className="mt-2 text-sm text-graphite">{session.notes}</p> : null}
                </article>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
