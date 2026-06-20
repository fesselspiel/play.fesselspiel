import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, CalendarDays, Images, Lightbulb, MessageCircle, Plus, ShieldCheck, Timer, ToyBrick } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, PageGuide, Panel, PageHeader, SoftPanel } from "@/components/ui";
import { ownerScope } from "@/lib/access";
import { confirmRequestedActivity } from "@/lib/activity-actions";
import { activityStatusDisplay, activityStatusTone } from "@/lib/activity-status";
import { logAction } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatMinutes } from "@/lib/dates";
import { sendTelegramMessage, telegramHtml } from "@/lib/telegram";
import { ensureSessionSlug } from "@/lib/session-slug";
import { stopSegufixSession } from "@/lib/session-actions";

const dayFormatter = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });
const timeFormatter = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
const keyFormatter = new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeZone: "Europe/Berlin" });
const inputDateFormatter = new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Berlin" });

function dayKey(value: Date) {
  return keyFormatter.format(value);
}

function playReadyLabel(value: boolean) {
  return value ? "voll Lust" : "gerade nicht";
}

function playReadyEmoji(value: boolean) {
  return value ? "🟢" : "🔴";
}

async function togglePlayReady() {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id }, select: { playReady: true } });
  const previous = Boolean(settings?.playReady);
  const next = !previous;
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: {
      playReady: next,
      playReadyUpdatedAt: new Date()
    },
    create: {
      userId: user.id,
      playReady: true,
      playReadyUpdatedAt: new Date()
    }
  });
  const actor = await prisma.user.findUnique({
    where: { id: user.id },
    include: { profile: true }
  });
  const actorName = actor?.profile?.displayName || actor?.name || actor?.username || actor?.email || "Unbekannt";
  await logAction({
    actorId: user.id,
    action: "play_ready_changed",
    entityType: "userSettings",
    entityId: user.id,
    title: `Spielampel geändert: ${actorName} ist ${playReadyLabel(next)}`,
    details: { previous: playReadyLabel(previous), next: playReadyLabel(next) },
    href: "/"
  });
  const currentUserId = user.id;
  const currentCircleId = user.circleId;
  const telegramSettings = await prisma.userSettings.findMany({
    where: currentCircleId
      ? { telegramBotTokenEnc: { not: null }, user: { circleId: currentCircleId, active: true } }
      : { telegramBotTokenEnc: { not: null }, userId: currentUserId },
    include: { telegramChats: { where: { status: "ACTIVE" } } }
  });
  const seenTargets = new Set<string>();
  function matchesTelegramTarget(chat: { targetUserId: string | null; targetCircleId: string | null }) {
    if (chat.targetUserId || chat.targetCircleId) {
      return chat.targetUserId === currentUserId || Boolean(currentCircleId && chat.targetCircleId === currentCircleId);
    }
    return false;
  }
  const message = [
    "🚦 <b>Spielampel geändert</b>",
    "",
    `👤 <b>${telegramHtml(actorName)}</b>`,
    `${playReadyEmoji(next)} <b>Status:</b> ${telegramHtml(playReadyLabel(next))}`,
    "",
    next ? "💚 <i>Da ist gerade richtig Lust im Spiel.</i>" : "❤️ <i>Gerade lieber ruhig angehen lassen.</i>"
  ].join("\n");
  await Promise.allSettled(
    telegramSettings.flatMap((setting) => {
      if (!setting.telegramBotTokenEnc) return [];
      const targetedChats = setting.telegramChats.filter((chat) => matchesTelegramTarget(chat));
      const threadSpecificChatIds = new Set(targetedChats.filter((chat) => chat.threadId).map((chat) => chat.chatId));
      return targetedChats
        .filter((chat) => chat.threadId || !threadSpecificChatIds.has(chat.chatId))
        .filter((chat) => {
          const key = `${setting.telegramBotTokenEnc}:${chat.chatId}:${chat.threadId || ""}`;
          if (seenTargets.has(key)) return false;
          seenTargets.add(key);
          return true;
        })
        .map((chat) => sendTelegramMessage(setting.telegramBotTokenEnc!, chat.chatId, chat.threadId, message, { parseMode: "HTML", disableWebPagePreview: true }));
    })
  );
  redirect("/");
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
  const [toyCount, plannedCount, sessionCount, mediaCount, messageCount, sessions, weekActivities, weekEvents, circleUsers, ideas] = await Promise.all([
    prisma.toy.count({ where: scope }),
    prisma.activityPlan.count({ where: { ...scope, category: { not: "IDEA_COLLECTION" }, status: { in: ["REQUESTED", "PLANNED"] } } }),
    prisma.segufixSession.count({ where: { ...scope, startTime: { gte: yearStart } } }),
    prisma.media.count({ where: scope }),
    prisma.message.count({ where: { OR: [{ senderId: user.id }, { recipientId: user.id }] } }),
    prisma.segufixSession.findMany({ where: scope, orderBy: { startTime: "desc" }, take: 4 }),
    prisma.activityPlan.findMany({
      where: { ...scope, status: { in: ["REQUESTED", "PLANNED"] }, plannedAt: { gte: todayStart, lt: weekEnd } },
      include: { tools: true, positions: true },
      orderBy: { plannedAt: "asc" }
    }),
    prisma.event.findMany({
      where: { ...scope, startsAt: { gte: todayStart, lt: weekEnd } },
      orderBy: { startsAt: "asc" }
    }),
    prisma.user.findMany({
      where: user.circleId ? { circleId: user.circleId, active: true } : user.role === "ADMIN" ? { active: true } : { id: user.id },
      include: { settings: true, profile: true },
      orderBy: [{ name: "asc" }, { email: "asc" }]
    }),
    prisma.activityPlan.findMany({
      where: { ...scope, category: "IDEA_COLLECTION", status: { in: ["REQUESTED", "PLANNED"] } },
      orderBy: { updatedAt: "desc" },
      take: 5
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
  const sessionSlugs = new Map(await Promise.all(sessions.map(async (session) => [session.id, await ensureSessionSlug(session)] as const)));
  const openSessions = sessions.filter((session) => !session.endTime);
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
          status: activity.status,
          selfBondageOrder: activity.category === "SELF_BONDAGE_ORDER" || activity.category === "Self-Bondage",
          confirmId: activity.status === "REQUESTED" && activity.ownerId !== user.id ? activity.id : "",
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
          status: "PLANNED",
          selfBondageOrder: false,
          confirmId: "",
          meta: event.location || "Termin"
        }))
    ].sort((a, b) => a.time.localeCompare(b.time));
    return { date, key, entries, isToday: index === 0, planUrl: `/activities/new?date=${inputDateFormatter.format(date)}` };
  });

  return (
    <AppShell>
      <PageHeader
        title="Dashboard"
        action={
          <Link href="/activities/new" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-[#bc0711]">
            <Plus className="h-4 w-4" />
            Spielen
          </Link>
        }
      />
      <PageGuide title="Private Übersicht">
        Das Dashboard ist die Startübersicht für dein Portal. Nutze die Kennzahlen als schnelle Navigation zu Lass uns spielen, Stellungen, Spielsachen, Medien, Nachrichten und Sessions; darunter siehst du die nächsten Spielideen, Termine und die letzten Session-Einträge.
      </PageGuide>

      <div className="space-y-6">
        <Panel>
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Spielampel</h2>
            <p className="mt-1 text-sm text-graphite">Grün heißt volle Lust, Rot heißt gerade nicht.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {circleUsers.map((member) => {
              const ready = Boolean(member.settings?.playReady);
              const isSelf = member.id === user.id;
              const displayName = member.profile?.displayName || member.name || member.username || member.email;
              const stateLabel = ready ? "Voll Lust" : "Gerade nicht";
              const content = (
                <span className={`flex min-h-28 w-full items-center gap-4 rounded-lg border p-4 text-left transition ${
                  ready ? "border-emerald-500 bg-emerald-500/10" : "border-redbrand bg-redbrand/10"
                } ${isSelf ? "hover:scale-[1.01]" : ""}`}>
                  {member.profile?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={member.profile.imageUrl} alt="" className={`h-12 w-12 shrink-0 rounded-full object-cover ring-4 ${ready ? "ring-emerald-500" : "ring-redbrand"}`} />
                  ) : (
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white shadow-soft ${ready ? "bg-emerald-500" : "bg-redbrand"}`}>
                      {displayName.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-base font-semibold text-ink">{displayName}</span>
                    <span className={`mt-1 block text-sm font-semibold ${ready ? "text-emerald-700" : "text-redbrand"}`}>{stateLabel}</span>
                    {isSelf ? <span className="mt-1 block text-xs text-graphite">Antippen zum Umschalten</span> : null}
                  </span>
                </span>
              );
              return isSelf ? (
                <form key={member.id} action={togglePlayReady}>
                  <button type="submit" className="focus-ring block w-full rounded-lg">{content}</button>
                </form>
              ) : (
                <div key={member.id}>{content}</div>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold"><Lightbulb className="h-5 w-5 text-amber-500" /> Ideensammlung</h2>
              <p className="mt-1 text-sm text-graphite">Dinge, die ihr irgendwann ausprobieren wollt.</p>
            </div>
            <Link href="/activities" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
              Öffnen
            </Link>
          </div>
          {ideas.length ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {ideas.map((idea) => (
                <Link key={idea.id} href={`/activities/${idea.slug}`} className="rounded-md border border-line bg-paper p-3 hover:border-amber-500">
                  <strong className="block truncate text-ink">{idea.title}</strong>
                  <span className="mt-1 block text-xs text-graphite">{activityStatusDisplay(idea.status, false, true)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <Link href="/activities/new?template=idea" className="block rounded-md border border-dashed border-line bg-paper p-4 text-sm text-graphite hover:border-amber-500 hover:text-ink">
              Noch keine Ideen festgehalten.
            </Link>
          )}
        </Panel>

        {openSessions.length ? (
          <Panel>
            <h2 className="mb-3 text-lg font-semibold">Laufende Session</h2>
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
                      <button className="focus-ring min-h-9 rounded-md bg-redbrand px-3 py-1.5 text-xs font-semibold text-white hover:bg-redbrandHover">
                        Session beenden
                      </button>
                    </form>
                  ) : null}
                </div>
              ))}
            </div>
          </Panel>
        ) : null}

        <Panel>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Gemeinsame Woche</h2>
              <p className="mt-1 text-sm text-graphite">Die nächsten sieben Tage mit Spielideen und Terminen.</p>
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
                  <Link href={day.planUrl} className="focus-ring rounded-md p-1" title="Diesen Tag planen">
                    <CalendarDays className={`h-5 w-5 ${day.entries.length ? "text-redbrand" : "text-graphite"}`} />
                  </Link>
                </div>
                <div className="mt-4 space-y-2">
                  {day.entries.length ? (
                    day.entries.map((entry) => (
                      <div key={`${entry.type}-${entry.id}`} className="rounded-md border border-line bg-surface p-2 text-sm hover:border-redbrand">
                        <Link href={entry.href} className="block">
                          <div className="flex items-center justify-between gap-2">
                            <strong className="line-clamp-1">{entry.title}</strong>
                            <Badge tone={entry.type === "Plan" ? activityStatusTone(entry.status as never) : "neutral"}>
                              {entry.type === "Plan" ? activityStatusDisplay(entry.status as never, Boolean(entry.selfBondageOrder)) : entry.type}
                            </Badge>
                          </div>
                          <div className="mt-1 text-xs text-graphite">{entry.time} · {entry.meta}</div>
                        </Link>
                        {entry.confirmId ? (
                          <form action={confirmRequestedActivity} className="mt-2">
                            <input type="hidden" name="id" value={entry.confirmId} />
                            <button className="focus-ring min-h-9 rounded-md bg-redbrand px-3 py-1.5 text-xs font-semibold text-white hover:bg-redbrandHover">
                              Bestätigen
                            </button>
                          </form>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <Link href={day.planUrl} className="block rounded-md border border-dashed border-line bg-surface p-3 text-sm text-graphite hover:border-redbrand hover:text-redbrand">
                      Noch nichts geplant.
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Panel>

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

        <div className="grid gap-6 xl:grid-cols-2">
          <Panel>
            <h2 className="mb-4 text-lg font-semibold">Letzte Segufix-Sessions</h2>
            <div className="space-y-3">
              {sessions.map((session) => (
                <Link key={session.id} href={`/sessions/${sessionSlugs.get(session.id)}`} className="block rounded-md border border-line p-3 hover:border-redbrand hover:bg-paper">
                  <div className="flex items-center justify-between gap-3">
                    <strong>{formatDateTime(session.startTime)}</strong>
                    <span className="text-sm text-graphite">{formatMinutes(session.durationMinutes)}</span>
                  </div>
                  {session.notes ? <p className="mt-2 text-sm text-graphite">{session.notes}</p> : null}
                </Link>
              ))}
            </div>
          </Panel>
          <div />
        </div>
      </div>
    </AppShell>
  );
}
