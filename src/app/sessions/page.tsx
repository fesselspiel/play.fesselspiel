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
import { stopSegufixSession } from "@/lib/session-actions";

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
      moodAfter: String(formData.get("moodAfter") || "RELAXED") as MoodAfterValue,
      moodBeforeText: "",
      moodAfterText: ""
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

async function createKgSession(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const startTime = new Date(String(formData.get("startTime")));
  const endRaw = String(formData.get("endTime") || "");
  const endTime = endRaw ? new Date(endRaw) : null;
  const session = await prisma.kgSession.create({
    data: {
      ownerId: user.id,
      startTime,
      endTime,
      durationMinutes: minutesBetween(startTime, endTime),
      notes: String(formData.get("notes") || "").trim()
    }
  });
  await logAction({
    actorId: user.id,
    action: "kg_created",
    entityType: "kgSession",
    entityId: session.id,
    title: "KG-Tracker-Eintrag angelegt",
    href: "/sessions?tracker=kg"
  });
  redirect("/sessions?tracker=kg");
}

const months = ["Januar", "Februar", "Maerz", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export default async function SessionsPage({ searchParams }: { searchParams: { year?: string; tracker?: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const year = Number(searchParams.year || new Date().getFullYear());
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);
  const scope = await ownerScope(user);
  const tracker = searchParams.tracker === "kg" ? "kg" : "segufix";
  if (tracker === "kg") {
    const kgSessions = await prisma.kgSession.findMany({ where: { ...scope, startTime: { gte: yearStart, lt: yearEnd } }, orderBy: { startTime: "desc" } });
    const totalMinutes = kgSessions.reduce((sum, session) => sum + (session.durationMinutes || 0), 0);
    const avgDuration = kgSessions.length ? Math.round(totalMinutes / kgSessions.length) : 0;
    const openSessions = kgSessions.filter((session) => !session.endTime);
    const byDay = new Map<string, typeof kgSessions>();
    for (const session of kgSessions) {
      const key = `${session.startTime.getMonth()}-${session.startTime.getDate()}`;
      byDay.set(key, [...(byDay.get(key) || []), session]);
    }
    return (
      <AppShell>
        <PageHeader title="KG Time Tracker" />
        <nav className="mb-5 flex border-b border-line" aria-label="Tracker">
          <Link href={`/sessions?year=${year}`} className="-mb-px rounded-t-md border border-transparent px-3 py-2 text-sm font-semibold text-graphite hover:bg-paper hover:text-ink">Segufix Time Tracker</Link>
          <Link href={`/sessions?tracker=kg&year=${year}`} aria-current="page" className="-mb-px rounded-t-md border border-line border-b-surface bg-surface px-3 py-2 text-sm font-semibold text-sky-700">KG Time Tracker</Link>
        </nav>
        <PageGuide title="KG-Tragezeiten minutengenau dokumentieren">
          Der KG Time Tracker erfasst Tragezeiten mit Startminute, Endminute, Dauer und Sessionbeschreibung. Die Jahresübersicht nutzt Blau, damit sie klar vom roten Segufix-Kalender unterscheidbar ist.
        </PageGuide>
        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <Panel>
            <h2 className="mb-4 text-lg font-semibold">KG-Zeit erfassen</h2>
            <form action={createKgSession} className="space-y-4">
              <Field label="Startzeit"><input className={inputClass} name="startTime" type="datetime-local" step={60} required /></Field>
              <Field label="Endzeit"><input className={inputClass} name="endTime" type="datetime-local" step={60} /></Field>
              <Field label="Sessionbeschreibung"><textarea className={inputClass} name="notes" rows={4} /></Field>
              <Button><Save className="h-4 w-4" /> KG-Zeit speichern</Button>
            </form>
          </Panel>
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <SoftPanel><div className="text-sm text-graphite">Einträge</div><div className="mt-2 text-2xl font-semibold">{kgSessions.length}</div></SoftPanel>
              <SoftPanel><div className="text-sm text-graphite">Gesamtzeit</div><div className="mt-2 text-2xl font-semibold">{formatMinutes(totalMinutes)}</div></SoftPanel>
              <SoftPanel><div className="text-sm text-graphite">Durchschnitt</div><div className="mt-2 text-2xl font-semibold">{formatMinutes(avgDuration)}</div></SoftPanel>
            </div>
            {openSessions.length ? (
              <Panel>
                <h2 className="mb-3 text-lg font-semibold">Laufender KG-Tracker</h2>
                <div className="space-y-2">
                  {openSessions.map((session) => (
                    <Link key={session.id} href={`/sessions/kg/${session.id}`} className="block rounded-md border border-sky-600 bg-sky-600/10 p-3 text-sm hover:bg-sky-600/15">
                      <strong>{formatDateTime(session.startTime)}</strong>
                      <span className="ml-2 text-graphite">ohne Endzeit</span>
                    </Link>
                  ))}
                </div>
              </Panel>
            ) : null}
            <Panel>
              <div className="mb-4 flex items-center justify-between gap-3">
                <a href={`/sessions?tracker=kg&year=${year - 1}`} className="rounded-md border border-line px-3 py-2 text-sm">Zurück</a>
                <h2 className="text-lg font-semibold">{year}</h2>
                <a href={`/sessions?tracker=kg&year=${year + 1}`} className="rounded-md border border-line px-3 py-2 text-sm">Weiter</a>
              </div>
              <div className="grid calendar-grid gap-1 text-xs">
                <div />
                {Array.from({ length: 31 }, (_, i) => <div key={i} className="calendar-day-number text-center text-graphite">{i + 1}</div>)}
                {months.map((month, monthIndex) => (
                  <div key={month} className="contents">
                    <div key={`${month}-label`} className="calendar-month-label py-1 font-medium text-graphite">{month}</div>
                    {Array.from({ length: 31 }, (_, dayIndex) => {
                      const day = dayIndex + 1;
                      const date = new Date(year, monthIndex, day);
                      const valid = date.getMonth() === monthIndex;
                      const daySessions = byDay.get(`${monthIndex}-${day}`) || [];
                      const minutes = daySessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
                      const className = `calendar-cell h-5 rounded-sm ${!valid ? "bg-transparent" : daySessions.length ? "bg-sky-600" : "bg-paper"}`;
                      if (!daySessions.length) return <span key={`${month}-${day}`} className={className} />;
                      return <a key={`${month}-${day}`} href={`/sessions/kg/${daySessions[0].id}`} title={`${daySessions.length} KG-Einträge, ${formatMinutes(minutes)}`} className={className} />;
                    })}
                  </div>
                ))}
              </div>
            </Panel>
            <Panel>
              <h2 className="mb-4 text-lg font-semibold">Historie</h2>
              <div className="space-y-3">
                {kgSessions.map((session) => (
                  <Link key={session.id} href={`/sessions/kg/${session.id}`} className="block rounded-md border border-line p-3 hover:bg-paper">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <strong>{formatDateTime(session.startTime)}</strong>
                      <span className="text-sm text-graphite">{formatMinutes(session.durationMinutes)}</span>
                    </div>
                    <p className="mt-1 text-sm text-graphite">Ende: {formatDateTime(session.endTime)}</p>
                    {session.notes ? <p className="mt-2 text-sm text-graphite">{session.notes}</p> : null}
                  </Link>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      </AppShell>
    );
  }
  const sessions = await prisma.segufixSession.findMany({ where: { ...scope, startTime: { gte: yearStart, lt: yearEnd } }, orderBy: { startTime: "desc" } });
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
      <nav className="mb-5 flex border-b border-line" aria-label="Tracker">
        <Link href={`/sessions?year=${year}`} aria-current="page" className="-mb-px rounded-t-md border border-line border-b-surface bg-surface px-3 py-2 text-sm font-semibold text-redbrand">Segufix Time Tracker</Link>
        <Link href={`/sessions?tracker=kg&year=${year}`} className="-mb-px rounded-t-md border border-transparent px-3 py-2 text-sm font-semibold text-graphite hover:bg-paper hover:text-ink">KG Time Tracker</Link>
      </nav>
      <PageGuide title="Session-Erfassung, Jahresübersicht und Auswertung">
        Der Timetracker dokumentiert Sessions mit Start, Ende, Dauer, Stimmung und Kommentar. Erfasse links neue Einträge, nutze den Jahreskalender zur Orientierung und bearbeite bestehende Sessions in der Historie.
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
            <Field label="Stimmung nachher">
              <select className={selectClass} name="moodAfter" defaultValue="RELAXED">
                {Object.entries(moodAfter).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Sessionkommentar"><textarea className={inputClass} name="notes" rows={5} /></Field>
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
                  <div key={session.id} className="rounded-md border border-redbrand bg-redbrand/10 p-3 text-sm">
                    <Link href={`/sessions/${sessionSlugs.get(session.id)}`} className="block hover:text-redbrand">
                      <strong>{session.notes?.split("\n")[0] || "Segufix-Session"}</strong>
                      <span className="ml-2 text-graphite">seit {formatDateTime(session.startTime)}</span>
                    </Link>
                    {session.ownerId === user.id ? (
                      <form action={stopSegufixSession} className="mt-3">
                        <input type="hidden" name="id" value={session.id} />
                        <Button>Session beenden</Button>
                      </form>
                    ) : null}
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}
          <Panel>
            <div className="mb-4 flex items-center justify-between gap-3">
              <a href={`/sessions?year=${year - 1}`} className="rounded-md border border-line px-3 py-2 text-sm">Zurück</a>
              <h2 className="text-lg font-semibold">{year}</h2>
              <a href={`/sessions?year=${year + 1}`} className="rounded-md border border-line px-3 py-2 text-sm">Weiter</a>
            </div>
            <div className="grid calendar-grid gap-1 text-xs">
              <div />
              {Array.from({ length: 31 }, (_, i) => <div key={i} className="calendar-day-number text-center text-graphite">{i + 1}</div>)}
              {months.map((month, monthIndex) => (
                <div key={month} className="contents">
                  <div key={`${month}-label`} className="calendar-month-label py-1 font-medium text-graphite">{month}</div>
                  {Array.from({ length: 31 }, (_, dayIndex) => {
                    const day = dayIndex + 1;
                    const date = new Date(year, monthIndex, day);
                    const valid = date.getMonth() === monthIndex;
                    const daySessions = byDay.get(`${monthIndex}-${day}`) || [];
                    const minutes = daySessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
                    const className = `calendar-cell h-5 rounded-sm ${!valid ? "bg-transparent" : daySessions.length ? "bg-redbrand" : "bg-paper"}`;
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
                <article key={session.id} id={`session-${session.id}`} className="rounded-md border border-line p-3 hover:bg-paper">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link href={`/sessions/${sessionSlugs.get(session.id)}`} className="min-w-0 flex-1">
                      <strong className="block">{formatDateTime(session.startTime)}</strong>
                      <p className="mt-2 text-sm text-graphite">Vorher: {session.moodBefore ? moodBefore[session.moodBefore] : neutralMood} · Nachher: {session.moodAfter ? moodAfter[session.moodAfter] : neutralMood}</p>
                      {session.notes ? <p className="mt-2 text-sm text-graphite">{session.notes}</p> : null}
                    </Link>
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
                </article>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
