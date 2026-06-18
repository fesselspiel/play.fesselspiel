import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, CalendarDays, Images, MessageCircle, Plus, ShieldCheck, Timer, ToyBrick } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, PageGuide, Panel, PageHeader, SoftPanel } from "@/components/ui";
import { ownerScope } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatMinutes } from "@/lib/dates";

const dayFormatter = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });
const timeFormatter = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
const keyFormatter = new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeZone: "Europe/Berlin" });

function dayKey(value: Date) {
  return keyFormatter.format(value);
}

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(todayStart);
  weekEnd.setDate(todayStart.getDate() + 7);
  const scope = await ownerScope(user);
  const [toyCount, plannedCount, sessionCount, mediaCount, messageCount, sessions, weekActivities, weekEvents] = await Promise.all([
    prisma.toy.count({ where: scope }),
    prisma.activityPlan.count({ where: { ...scope, status: "PLANNED" } }),
    prisma.segufixSession.count({ where: { ...scope, startTime: { gte: yearStart } } }),
    prisma.media.count({ where: scope }),
    prisma.message.count({ where: { OR: [{ senderId: user.id }, { recipientId: user.id }] } }),
    prisma.segufixSession.findMany({ where: scope, orderBy: { startTime: "desc" }, take: 4 }),
    prisma.activityPlan.findMany({
      where: { ...scope, status: "PLANNED", plannedAt: { gte: todayStart, lt: weekEnd } },
      include: { tools: true, positions: true },
      orderBy: { plannedAt: "asc" }
    }),
    prisma.event.findMany({
      where: { ...scope, startsAt: { gte: todayStart, lt: weekEnd } },
      orderBy: { startsAt: "asc" }
    })
  ]);

  const cards = [
    ["Lass uns spielen", plannedCount, Activity, "/activities"],
    ["Stellungen", "ansehen", ShieldCheck, "/positions"],
    ["Spielsachen", toyCount, ToyBrick, "/toys"],
    ["Sessions/Jahr", sessionCount, Timer, "/sessions"],
    ["Medien", mediaCount, Images, "/media"],
    ["Nachrichten", messageCount, MessageCircle, "/messages"]
  ] as const;
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(todayStart);
    date.setDate(todayStart.getDate() + index);
    const key = dayKey(date);
    const entries = [
      ...weekActivities
        .filter((activity) => activity.plannedAt && dayKey(activity.plannedAt) === key)
        .map((activity) => ({
          id: activity.id,
          title: activity.title,
          href: `/activities/${activity.slug}`,
          time: activity.plannedAt ? timeFormatter.format(activity.plannedAt) : "",
          type: "Plan",
          meta: `${activity.tools.length} Spielsachen · ${activity.positions.length} Stellungen`
        })),
      ...weekEvents
        .filter((event) => dayKey(event.startsAt) === key)
        .map((event) => ({
          id: event.id,
          title: event.title,
          href: "/activities",
          time: timeFormatter.format(event.startsAt),
          type: "Termin",
          meta: event.location || "Termin"
        }))
    ].sort((a, b) => a.time.localeCompare(b.time));
    return { date, key, entries, isToday: index === 0 };
  });

  return (
    <AppShell>
      <PageHeader
        title="Dashboard"
        subtitle="Private Uebersicht fuer Lass uns spielen, Stellungen, Spielsachen, Medien und Session-Dokumentation."
        action={
          <Link href="/activities/new" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-[#bc0711]">
            <Plus className="h-4 w-4" />
            Spielen
          </Link>
        }
      />
      <PageGuide>
        Das Dashboard ist die Startuebersicht fuer dein Portal. Nutze die Kennzahlen als schnelle Navigation zu Lass uns spielen, Stellungen, Spielsachen, Medien, Nachrichten und Sessions; darunter siehst du die naechsten Spielideen, Termine und die letzten Session-Eintraege.
      </PageGuide>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(([label, value, Icon, href]) => (
          <Link key={label} href={href}>
            <SoftPanel className="transition hover:bg-[#eeeeee]">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-graphite">{label}</span>
                <Icon className="h-5 w-5 text-redbrand" />
              </div>
              <div className="mt-3 text-3xl font-semibold text-ink">{value}</div>
            </SoftPanel>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel className="xl:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Gemeinsame Woche</h2>
              <p className="mt-1 text-sm text-graphite">Die naechsten sieben Tage mit Spielideen und Terminen.</p>
            </div>
            <Link href="/activities/new" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-redbrandHover">
              <Plus className="h-4 w-4" />
              Planen
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            {weekDays.map((day) => (
              <div key={day.key} className={`min-h-44 rounded-lg border p-3 ${day.entries.length ? "border-redbrand bg-redbrand/5" : "border-line bg-paper"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold uppercase text-graphite">{day.isToday ? "Heute" : dayFormatter.format(day.date).split(",")[0]}</div>
                    <div className="mt-1 text-lg font-semibold text-ink">{dayFormatter.format(day.date).replace(",", "")}</div>
                  </div>
                  <CalendarDays className={`h-5 w-5 ${day.entries.length ? "text-redbrand" : "text-graphite"}`} />
                </div>
                <div className="mt-4 space-y-2">
                  {day.entries.length ? (
                    day.entries.map((entry) => (
                      <Link key={`${entry.type}-${entry.id}`} href={entry.href} className="block rounded-md border border-line bg-surface p-2 text-sm hover:border-redbrand">
                        <div className="flex items-center justify-between gap-2">
                          <strong className="line-clamp-1">{entry.title}</strong>
                          <Badge tone={entry.type === "Plan" ? "red" : "neutral"}>{entry.type}</Badge>
                        </div>
                        <div className="mt-1 text-xs text-graphite">{entry.time} · {entry.meta}</div>
                      </Link>
                    ))
                  ) : (
                    <p className="rounded-md border border-dashed border-line bg-surface p-3 text-sm text-graphite">Noch nichts geplant.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <h2 className="mb-4 text-lg font-semibold">Letzte Segufix-Sessions</h2>
          <div className="space-y-3">
            {sessions.map((session) => (
              <div key={session.id} className="rounded-md border border-line p-3">
                <div className="flex items-center justify-between gap-3">
                  <strong>{formatDateTime(session.startTime)}</strong>
                  <span className="text-sm text-graphite">{formatMinutes(session.durationMinutes)}</span>
                </div>
                {session.notes ? <p className="mt-2 text-sm text-graphite">{session.notes}</p> : null}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
