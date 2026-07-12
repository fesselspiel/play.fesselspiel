import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Camera, ChevronLeft, ChevronRight, Clock, Plus, Timer } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, EmptyState, PageGuide, PageHeader, Panel } from "@/components/ui";
import { accessibleOwnerIds, mediaVisibilityScope, ownerScope } from "@/lib/access";
import { activityStatusDisplay, activityStatusTone, type ActivityStatusValue } from "@/lib/activity-status";
import { currentUser } from "@/lib/auth";
import { appTimeZone, formatDate, formatDateInput, formatDateTime, formatMinutes, parseDateInput } from "@/lib/dates";
import { hasFeature, requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";

const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const weekdayLabels = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

type CalendarItem = {
  id: string;
  dayKey: string;
  title: string;
  href: string;
  kind: "request" | "activity" | "tracker" | "media" | "event";
  color: string;
  label: string;
  startsAt: Date;
  badgeTone?: "red" | "neutral" | "green";
  meta?: string;
};

function clampMonth(value: string | undefined) {
  const parsed = Number(value || "");
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 12 ? parsed : new Date().getMonth() + 1;
}

function clampYear(value: string | undefined) {
  const parsed = Number(value || "");
  return Number.isFinite(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : new Date().getFullYear();
}

function monthUrl(year: number, month: number, date?: string) {
  const params = new URLSearchParams({ year: String(year), month: String(month) });
  if (date) params.set("date", date);
  return `/calendar?${params.toString()}`;
}

function addMonths(year: number, month: number, delta: number) {
  const next = new Date(year, month - 1 + delta, 1);
  return { year: next.getFullYear(), month: next.getMonth() + 1 };
}

function startOfMonth(year: number, month: number) {
  return parseDateInput(`${year}-${String(month).padStart(2, "0")}-01`) || new Date(year, month - 1, 1);
}

function startOfNextMonth(year: number, month: number) {
  const next = addMonths(year, month, 1);
  return startOfMonth(next.year, next.month);
}

function calendarDays(year: number, month: number) {
  const first = startOfMonth(year, month);
  const firstWeekday = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - firstWeekday);
  return Array.from({ length: 42 }, (_, index) => {
    const value = new Date(start);
    value.setDate(start.getDate() + index);
    return {
      date: value,
      dayKey: formatDateInput(value),
      inMonth: value.getMonth() === month - 1,
      day: Number(new Intl.DateTimeFormat("de-DE", { day: "numeric", timeZone: appTimeZone }).format(value))
    };
  });
}

function dayMap(items: CalendarItem[]) {
  const map = new Map<string, CalendarItem[]>();
  for (const item of items) {
    map.set(item.dayKey, [...(map.get(item.dayKey) || []), item]);
  }
  return map;
}

function visibleChips(items: CalendarItem[]) {
  const priority = ["request", "activity", "tracker", "event", "media"];
  return [...items].sort((a, b) => priority.indexOf(a.kind) - priority.indexOf(b.kind) || a.startsAt.getTime() - b.startsAt.getTime()).slice(0, 3);
}

export default async function CalendarPage({ searchParams }: { searchParams: { year?: string; month?: string; date?: string } }) {
  await requireFeature("activities");
  const user = await currentUser();
  if (!user) redirect("/login");
  const year = clampYear(searchParams.year);
  const month = clampMonth(searchParams.month);
  const selectedDate = parseDateInput(searchParams.date) || new Date();
  const selectedDayKey = formatDateInput(selectedDate);
  const monthStart = startOfMonth(year, month);
  const monthEnd = startOfNextMonth(year, month);
  const scope = await ownerScope(user);
  const ownerIds = await accessibleOwnerIds(user);
  const trackersEnabled = await hasFeature("trackers");
  const mediaEnabled = await hasFeature("media");
  const [activities, trackerEntries, media, events, diaryAuditLogs] = await Promise.all([
    prisma.activityPlan.findMany({
      where: { ...scope, plannedAt: { gte: monthStart, lt: monthEnd } },
      orderBy: { plannedAt: "asc" }
    }),
    trackersEnabled
      ? prisma.trackerEntry.findMany({
          where: { ...scope, startTime: { gte: monthStart, lt: monthEnd } },
          include: { trackerType: true },
          orderBy: { startTime: "asc" }
        })
      : [],
    mediaEnabled
      ? prisma.media.findMany({
          where: { ...(await mediaVisibilityScope(user)), createdAt: { gte: monthStart, lt: monthEnd } },
          orderBy: { createdAt: "asc" }
        })
      : [],
    prisma.event.findMany({
      where: { ...scope, startsAt: { gte: monthStart, lt: monthEnd } },
      orderBy: { startsAt: "asc" }
    }),
    prisma.auditLog.findMany({
      where: {
        actorId: { in: ownerIds },
        createdAt: { gte: monthStart, lt: monthEnd },
        OR: [
          { entityType: { in: ["wiki", "Wiki", "diary", "Diary", "journal", "Journal", "tagebuch", "Tagebuch"] } },
          { action: { contains: "wiki", mode: "insensitive" } },
          { action: { contains: "diary", mode: "insensitive" } },
          { action: { contains: "tagebuch", mode: "insensitive" } }
        ]
      },
      orderBy: { createdAt: "asc" }
    })
  ]);

  const items: CalendarItem[] = [
    ...activities.flatMap((activity) => {
      if (!activity.plannedAt) return [];
      const isRequest = activity.status === "REQUESTED";
      return [{
        id: activity.id,
        dayKey: formatDateInput(activity.plannedAt),
        title: activity.title,
        href: `/activities/${activity.slug}`,
        kind: isRequest ? "request" : "activity",
        color: isRequest ? "#FACC15" : "#1D9BF0",
        label: isRequest ? "Anfrage" : activityStatusDisplay(activity.status as ActivityStatusValue),
        startsAt: activity.plannedAt,
        badgeTone: isRequest ? "neutral" : activityStatusTone(activity.status as ActivityStatusValue),
        meta: activity.note || undefined
      } satisfies CalendarItem];
    }),
    ...trackerEntries.map((entry) => ({
      id: entry.id,
      dayKey: formatDateInput(entry.startTime),
      title: entry.title || entry.trackerType.title,
      href: `/trackers/${entry.trackerType.key}/${entry.slug || entry.id}`,
      kind: "tracker" as const,
      color: entry.trackerType.color || "#E30613",
      label: entry.trackerType.title,
      startsAt: entry.startTime,
      meta: entry.allDay ? "ganzer Tag" : entry.endTime ? formatMinutes(entry.durationMinutes) : "läuft"
    })),
    ...events.map((event) => ({
      id: event.id,
      dayKey: formatDateInput(event.startsAt),
      title: event.title,
      href: `/events/${event.id}/edit`,
      kind: "event" as const,
      color: "#7C3AED",
      label: "Tagebuch",
      startsAt: event.startsAt,
      meta: event.location || event.description || undefined
    })),
    ...diaryAuditLogs.map((entry) => ({
      id: entry.id,
      dayKey: formatDateInput(entry.createdAt),
      title: entry.title || "Tagebucheintrag",
      href: entry.href || `/messages#entry-${entry.id}`,
      kind: "event" as const,
      color: "#7C3AED",
      label: "Tagebuch",
      startsAt: entry.createdAt,
      meta: "Aus dem Tagebuch-Protokoll"
    })),
    ...media.map((entry) => ({
      id: entry.id,
      dayKey: formatDateInput(entry.createdAt),
      title: entry.title || "Bild",
      href: `/media?view=${entry.id}`,
      kind: "media" as const,
      color: "#F43F5E",
      label: entry.kind === "VIDEO" ? "Video" : "Bild",
      startsAt: entry.createdAt,
      meta: "Medienhinweis"
    }))
  ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const itemsByDay = dayMap(items);
  const selectedItems = itemsByDay.get(selectedDayKey) || [];
  const days = calendarDays(year, month);
  const previous = addMonths(year, month, -1);
  const next = addMonths(year, month, 1);
  const todayKey = formatDateInput(new Date());

  return (
    <AppShell>
      <PageHeader
        title="Kalender"
        subtitle="Monatsübersicht für Anfragen, Aktivitäten, Tracker, Tagebuch und Medienhinweise."
        action={
          <Link href={`/activities/new?date=${selectedDayKey}`} className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-redbrandHover">
            <Plus className="h-4 w-4" />
            Anfrage anlegen
          </Link>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Panel>
          <div className="mb-4 flex items-center justify-between gap-3">
            <Link href={monthUrl(previous.year, previous.month)} className="focus-ring inline-flex h-12 w-12 items-center justify-center rounded-full bg-redbrand/10 text-redbrand hover:bg-redbrand hover:text-white" aria-label="Vorheriger Monat">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-ink">{monthNames[month - 1]} {year}</h2>
              <p className="text-sm text-graphite">Aktivitäten, Anfragen und Tracker</p>
            </div>
            <Link href={monthUrl(next.year, next.month)} className="focus-ring inline-flex h-12 w-12 items-center justify-center rounded-full bg-redbrand/10 text-redbrand hover:bg-redbrand hover:text-white" aria-label="Nächster Monat">
              <ChevronRight className="h-5 w-5" />
            </Link>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-graphite sm:gap-2">
            {weekdayLabels.map((label) => <div key={label} className="py-1">{label}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {days.map((day) => {
              const dayItems = itemsByDay.get(day.dayKey) || [];
              const active = day.dayKey === selectedDayKey;
              const isToday = day.dayKey === todayKey;
              return (
                <Link
                  key={day.dayKey}
                  href={monthUrl(year, month, day.dayKey)}
                  className={`focus-ring min-h-[5.6rem] rounded-lg border p-1.5 text-left transition sm:min-h-[7rem] sm:p-2 ${active ? "border-redbrand bg-redbrand/5" : "border-line bg-surface hover:border-redbrand/50"} ${day.inMonth ? "" : "opacity-40"}`}
                >
                  <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full text-sm font-semibold ${isToday ? "bg-redbrand text-white" : "text-ink"}`}>{day.day}</span>
                  <span className="mt-1 flex flex-col gap-1">
                    {visibleChips(dayItems).map((item) => (
                      <span key={`${item.kind}-${item.id}`} className="block truncate rounded px-1.5 py-0.5 text-[0.68rem] font-semibold leading-4 text-ink" style={{ backgroundColor: `${item.color}26` }}>
                        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ backgroundColor: item.color }} />
                        {item.kind === "media" ? item.label : item.title}
                      </span>
                    ))}
                    {dayItems.length > 3 ? <span className="text-xs font-semibold text-graphite">+{dayItems.length - 3}</span> : null}
                  </span>
                </Link>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-graphite">
            {[
              ["Anfrage", "#FACC15"],
              ["Aktivität", "#1D9BF0"],
              ["Tracker", "#E30613"],
              ["Tagebuch", "#7C3AED"],
              ["Bild/Video", "#F43F5E"]
            ].map(([label, color]) => (
              <span key={label} className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />{label}</span>
            ))}
          </div>
        </Panel>
        <aside className="space-y-4">
          <Panel>
            <h2 className="text-lg font-semibold text-ink">{formatDate(selectedDate)}</h2>
            {selectedItems.length ? (
              <div className="mt-4 space-y-2">
                {selectedItems.map((item) => (
                  <Link key={`${item.kind}-${item.id}`} href={item.href} className="block rounded-md border border-line bg-paper p-3 transition hover:border-redbrand">
                    <div className="flex items-start gap-3">
                      <span className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: item.color }}>
                        {item.kind === "tracker" ? <Timer className="h-4 w-4" /> : item.kind === "media" ? <Camera className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-ink">{item.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-graphite">
                          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {formatDateTime(item.startsAt)}</span>
                          <Badge tone={item.badgeTone || "neutral"}>{item.label}</Badge>
                        </span>
                        {item.meta ? <span className="mt-2 block line-clamp-2 text-sm text-graphite">{item.meta}</span> : null}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="Keine Einträge">
                <div className="mt-3 flex flex-col gap-2">
                  <Link href={`/activities/new?date=${selectedDayKey}`} className="focus-ring inline-flex min-h-10 items-center justify-center rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-redbrandHover">Aktivität anfragen</Link>
                  <Link href={`/sessions?date=${selectedDayKey}#new-entry`} className="focus-ring inline-flex min-h-10 items-center justify-center rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-paper">Tracker nachtragen</Link>
                  <Link href="/media" className="focus-ring inline-flex min-h-10 items-center justify-center rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-paper">Bild hinzufügen</Link>
                </div>
              </EmptyState>
            )}
          </Panel>
        </aside>
      </div>
      <PageGuide title="Kalenderlogik">
        Die Monatsansicht bündelt geplante Aktivitäten, offene Anfragen, Tracker-Einträge, Tagebuch-/Termineinträge und Medienhinweise. Medien erscheinen bewusst nur als Hinweis, nicht als Bildinhalt im Kalender.
      </PageGuide>
    </AppShell>
  );
}
