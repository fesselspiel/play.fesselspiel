import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, Lightbulb, MessageCircle, Newspaper, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, PageGuide, Panel, PageHeader } from "@/components/ui";
import { accessibleOwnerIds, ownerScope } from "@/lib/access";
import { confirmRequestedActivity } from "@/lib/activity-actions";
import { updateSelfBondageOrderStatus, selfBondageCategory } from "@/lib/activity-orders";
import { activityStatusDisplay, activityStatusTone } from "@/lib/activity-status";
import { logAction } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { hasFeature } from "@/lib/features";
import { fileAssetUrl } from "@/lib/files";
import { feedDetailsText, renderFeedTemplate } from "@/lib/feed";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatMinutes } from "@/lib/dates";
import { quotaSummaryText, trackerQuotaStatusForUser } from "@/lib/tracker-quotas";
import { stopTrackerEntry } from "@/lib/tracker-core";

const dayFormatter = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });
const timeFormatter = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
const feedDateFormatter = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
const keyFormatter = new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeZone: "Europe/Berlin" });
const inputDateFormatter = new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Berlin" });

export const dynamic = "force-dynamic";

function dayKey(value: Date) {
  return keyFormatter.format(value);
}

function playReadyLabel(value: boolean) {
  return value ? "voll Lust" : "gerade nicht";
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
  redirect("/");
}

async function stopDashboardTracker(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const key = String(formData.get("trackerKey") || "");
  const entry = await stopTrackerEntry({ key, user });
  if (!entry) redirect("/");
  await logAction({
    actorId: user.id,
    action: `tracker_${key}_stopped`,
    entityType: "trackerEntry",
    entityId: entry.id,
    title: `${entry.title || key} beendet`,
    href: `/trackers/${key}/${entry.slug || entry.id}`
  });
  redirect(`/trackers/${key}/${entry.slug || entry.id}`);
}

async function commentFeedEntry(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const auditLogId = String(formData.get("auditLogId") || "");
  const body = String(formData.get("body") || "").trim();
  if (!auditLogId || !body) redirect("/");
  const accessIds = await accessibleOwnerIds(user);
  const auditLog = await prisma.auditLog.findFirst({
    where: {
      id: auditLogId,
      OR: [{ actorId: { in: accessIds } }, { actorId: null }]
    },
    select: { id: true, title: true, href: true }
  });
  if (!auditLog) redirect("/");
  const comment = await prisma.feedComment.create({
    data: {
      auditLogId: auditLog.id,
      authorId: user.id,
      body
    }
  });
  await logAction({
    actorId: user.id,
    action: "feed_comment_created",
    entityType: "auditLog",
    entityId: auditLog.id,
    title: `Feed kommentiert: ${auditLog.title}`,
    href: auditLog.href || "/",
    details: { commentId: comment.id, comment: body.slice(0, 500) }
  });
  redirect("/");
}

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(todayStart);
  weekEnd.setDate(todayStart.getDate() + 7);
  const scope = await ownerScope(user);
  const auditAccessIds = await accessibleOwnerIds(user);
  const [activitiesEnabled, selfBondageEnabled, ordersEnabled, trackersEnabled, auditLogEnabled] = await Promise.all([
    hasFeature("activities"),
    hasFeature("selfBondage"),
    hasFeature("orders"),
    hasFeature("trackers"),
    hasFeature("auditLog")
  ]);
  const [trackerEntries, weekActivities, weekEvents, circleUsers, selfBondagePositions, ideas, openOrders, requestedPlans, feedRules] = await Promise.all([
    trackersEnabled ? prisma.trackerEntry.findMany({ where: scope, include: { trackerType: true }, orderBy: { startTime: "desc" }, take: 8 }) : Promise.resolve([]),
    activitiesEnabled
      ? prisma.activityPlan.findMany({
          where: { ...scope, status: "PLANNED", plannedAt: { gte: todayStart, lt: weekEnd } },
          include: { tools: true, positions: true },
          orderBy: { plannedAt: "asc" }
        })
      : Promise.resolve([]),
    prisma.event.findMany({
      where: { ...scope, startsAt: { gte: todayStart, lt: weekEnd } },
      orderBy: { startsAt: "asc" }
    }),
    prisma.tenantMembership.findMany({
      where: user.tenantId
        ? user.circleId
          ? { tenantId: user.tenantId, circleId: user.circleId, active: true, user: { active: true } }
          : user.role === "ADMIN" || user.role === "SUPER_ADMIN"
            ? { tenantId: user.tenantId, active: true, user: { active: true } }
            : { tenantId: user.tenantId, userId: user.id, active: true, user: { active: true } }
        : { userId: user.id, active: true, user: { active: true } },
      include: { user: { include: { settings: true, profile: true } } },
      orderBy: { createdAt: "asc" }
    }),
    selfBondageEnabled
      ? prisma.position.findMany({
          where: { ...scope, selfBondageCapable: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          take: 6
        })
      : Promise.resolve([]),
    activitiesEnabled
      ? prisma.activityPlan.findMany({
          where: { ...scope, category: "IDEA_COLLECTION", status: { in: ["REQUESTED", "PLANNED"] } },
          include: { images: { include: { file: true }, orderBy: { createdAt: "desc" }, take: 1 } },
          orderBy: { updatedAt: "desc" },
          take: 6
        })
      : Promise.resolve([]),
    ordersEnabled
      ? prisma.activityPlan.findMany({
          where: { ...scope, category: selfBondageCategory, status: { in: ["REQUESTED", "PLANNED"] } },
          include: { owner: { include: { profile: true } }, positions: true },
          orderBy: [{ plannedAt: "asc" }, { createdAt: "desc" }],
          take: 4
        })
      : Promise.resolve([]),
    activitiesEnabled
      ? prisma.activityPlan.findMany({
          where: {
            ...scope,
            status: "REQUESTED",
            OR: [
              { category: null },
              { category: { notIn: ["IDEA_COLLECTION", selfBondageCategory, "Self-Bondage"] } }
            ]
          },
          include: { owner: { include: { profile: true } }, tools: true, positions: true },
          orderBy: [{ plannedAt: "asc" }, { createdAt: "desc" }],
          take: 4
        })
      : Promise.resolve([]),
    auditLogEnabled && user.tenantId
      ? prisma.feedRule.findMany({ where: { tenantId: user.tenantId, active: true }, orderBy: { updatedAt: "desc" } })
      : Promise.resolve([])
  ]);
  const feedRuleByAction = new Map(feedRules.map((rule) => [rule.action, rule]));
  const feedEntries = feedRules.length
    ? await prisma.auditLog.findMany({
        where: {
          action: { in: feedRules.map((rule) => rule.action) },
          OR: [{ actorId: { in: auditAccessIds } }, { actorId: null }]
        },
        include: {
          actor: { include: { profile: true } },
          feedComments: {
            include: { author: { include: { profile: true } } },
            orderBy: { createdAt: "asc" },
            take: 3
          }
        },
        orderBy: { createdAt: "desc" },
        take: 8
      })
    : [];
  const quotaTodos = (await trackerQuotaStatusForUser(user)).filter((status) => status.hasQuota);

  const orderStatusActors = new Map(
    (openOrders.length
      ? await prisma.auditLog.findMany({
          where: {
            entityType: "activity",
            entityId: { in: openOrders.map((order) => order.id) },
            action: { in: ["self_bondage_order_accepted", "self_bondage_order_completed", "self_bondage_order_discarded"] }
          },
          include: { actor: { include: { profile: true } } },
          orderBy: { createdAt: "desc" }
        })
      : []
    ).map((entry) => [
      `${entry.entityId}:${entry.action}`,
      entry.actor?.profile?.displayName || entry.actor?.name || entry.actor?.username || entry.actor?.email || "Unbekannt"
    ])
  );
  const openTrackerEntries = trackerEntries.filter((entry) => !entry.endTime);
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
          meta: `${activity.tools.length} Spielsachen · ${activity.positions.length} Szenen`
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
        title="Start"
        action={activitiesEnabled ? (
          <Link href="/activities/new" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-[#bc0711]">
            <Plus className="h-4 w-4" />
            Spielen
          </Link>
        ) : null}
      />
      <PageGuide title="Private Übersicht">
        Start ist die Übersicht für dein Portal. Oben siehst du die Spielampel, direkt darunter die wichtigsten Spiel-Aktionen, danach Kalender und letzte Session-Einträge.
      </PageGuide>

      <div className="space-y-6">
        <Panel>
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Spielampel</h2>
            <p className="mt-1 text-sm text-graphite">Grün heißt volle Lust, Rot heißt gerade nicht.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {circleUsers.map((membership) => {
              const member = membership.user;
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

        {quotaTodos.length ? (
          <Panel>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-ink">Tracker-Todos</h2>
                <p className="mt-1 text-sm text-graphite">Kontingente, die du durch Tracker-Zeit abarbeitest.</p>
              </div>
              <Link href="/sessions" className="inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
                Tracker öffnen
              </Link>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {quotaTodos.map((todo) => {
                const main = todo.daily.required ? todo.daily : todo.weekly.required ? todo.weekly : todo.monthlyMinutes.required ? todo.monthlyMinutes : todo.monthlyDays;
                return (
                  <article key={todo.tracker.id} className="rounded-lg border border-line bg-paper p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-ink">{todo.tracker.title}</h3>
                        <p className="mt-1 text-xs text-graphite">{quotaSummaryText(todo)}</p>
                      </div>
                      <span className="h-4 w-4 shrink-0 rounded-full border border-line" style={{ backgroundColor: todo.tracker.color }} />
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface">
                      <div className="h-full rounded-full" style={{ width: `${main.percent}%`, backgroundColor: todo.tracker.color }} />
                    </div>
                    <div className="mt-2 text-xs font-semibold text-graphite">
                      {todo.complete ? "erfüllt" : `noch ${main.remaining} ${todo.monthlyDays.required && main === todo.monthlyDays ? "Tage" : "Min."}`}
                    </div>
                  </article>
                );
              })}
            </div>
          </Panel>
        ) : null}

        {feedEntries.length ? (
          <Panel>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Newspaper className="h-5 w-5 text-redbrand" />
                  Feed
                </h2>
                <p className="mt-1 text-sm text-graphite">Ausgewählte Aktionen aus dem Protokoll.</p>
              </div>
              <Link href="/messages#feed-rules" className="inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
                Feed steuern
              </Link>
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {feedEntries.map((entry) => {
                const rule = feedRuleByAction.get(entry.action);
                const title = rule ? renderFeedTemplate(rule.titleTemplate, entry, entry.actor) : entry.title;
                const body = rule ? renderFeedTemplate(rule.bodyTemplate, entry, entry.actor) : feedDetailsText(entry.details);
                const actorName = entry.actor?.profile?.displayName || entry.actor?.name || entry.actor?.username || entry.actor?.email || "System";
                return (
                  <article key={entry.id} className="rounded-md border border-line bg-paper p-3">
                    <div className="mb-2 flex items-center gap-2">
                      {entry.actor?.profile?.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={entry.actor.profile.imageUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold text-graphite">{actorName.slice(0, 1).toUpperCase()}</span>
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-ink">{actorName}</div>
                        <div className="text-[11px] text-graphite">{feedDateFormatter.format(entry.createdAt)}</div>
                      </div>
                    </div>
                    {entry.href ? (
                      <Link href={entry.href} className="block text-sm font-semibold text-ink hover:text-redbrand">{title}</Link>
                    ) : (
                      <h3 className="text-sm font-semibold text-ink">{title}</h3>
                    )}
                    {body ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-graphite">{body}</p> : null}
                    {entry.feedComments.length ? (
                      <div className="mt-3 space-y-1 border-t border-line pt-2">
                        {entry.feedComments.map((comment) => (
                          <p key={comment.id} className="text-xs leading-5 text-graphite">
                            <span className="font-semibold text-ink">{comment.author?.profile?.displayName || comment.author?.name || comment.author?.username || "Kommentar"}:</span> {comment.body}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    <form action={commentFeedEntry} className="mt-3 flex gap-2">
                      <input type="hidden" name="auditLogId" value={entry.id} />
                      <input name="body" className="min-h-9 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-xs text-ink placeholder:text-graphite/60" placeholder="Kommentieren" />
                      <button type="submit" className="focus-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-redbrand text-white hover:bg-redbrandHover" aria-label="Kommentar senden">
                        <MessageCircle className="h-4 w-4" />
                      </button>
                    </form>
                  </article>
                );
              })}
            </div>
          </Panel>
        ) : null}

        {ordersEnabled && openOrders.length ? (
          <Panel className="border-sky-600 bg-sky-600/10">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-semibold text-ink">
                  <ShieldCheck className="h-5 w-5 text-sky-700" />
                  {openOrders.some((order) => order.status === "REQUESTED") && openOrders.some((order) => order.status === "PLANNED")
                    ? "Aktive Aufträge"
                    : openOrders.some((order) => order.status === "PLANNED")
                      ? "Angenommene Aufträge"
                      : "Offene Aufträge"}
                </h2>
                <p className="mt-1 text-sm text-graphite">Beauftragte Aufträge warten auf Annahme, angenommene Aufträge auf Umsetzung.</p>
              </div>
              <Link href="/orders" className="inline-flex min-h-10 items-center rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
                Alle Aufträge öffnen
              </Link>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {openOrders.map((order) => {
                const ownerName = order.owner.profile?.displayName || order.owner.name || order.owner.username || order.owner.email;
                const canAccept = order.status === "REQUESTED" && order.ownerId !== user.id;
                const acceptedBy = order.status === "PLANNED" ? orderStatusActors.get(`${order.id}:self_bondage_order_accepted`) : "";
                return (
                  <article key={order.id} className="rounded-lg border border-line bg-surface p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge tone={activityStatusTone(order.status as never)}>{activityStatusDisplay(order.status as never, true)}</Badge>
                      <span className="text-xs text-graphite">
                        {order.status === "PLANNED" && acceptedBy ? `angenommen von ${acceptedBy}` : `erteilt von ${ownerName}`}
                      </span>
                    </div>
                    <Link href={`/activities/${order.slug}`} className="block text-base font-semibold text-ink hover:text-redbrand">{order.title}</Link>
                    <p className="mt-1 text-xs text-graphite">{order.plannedAt ? formatDateTime(order.plannedAt) : "gilt beim Lesen"}</p>
                    {order.positions.length ? <p className="mt-2 text-xs text-graphite">{order.positions.map((position) => position.name).join(", ")}</p> : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {canAccept ? (
                        <form action={updateSelfBondageOrderStatus}>
                          <input type="hidden" name="id" value={order.id} />
                          <input type="hidden" name="status" value="PLANNED" />
                          <button className="focus-ring min-h-9 rounded-md bg-redbrand px-3 py-1.5 text-xs font-semibold text-white hover:bg-redbrandHover">
                            Annehmen
                          </button>
                        </form>
                      ) : null}
                      <Link href={`/orders#order-${order.id}`} className="inline-flex min-h-9 items-center rounded-md border border-line bg-paper px-3 py-1.5 text-xs font-semibold hover:bg-surface">
                        Bearbeiten
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </Panel>
        ) : null}

        {activitiesEnabled ? (
        <div className={`grid gap-4 ${ordersEnabled ? "xl:grid-cols-3" : "xl:grid-cols-2"}`}>
          <Panel className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-redbrand text-white">
              <Sparkles className="h-6 w-6" />
            </div>
            <h2 className="text-2xl font-semibold text-ink">Spieltermin planen</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-graphite">
              Lege einen konkreten Termin an, wähle Spielsachen und Szenen aus und entscheide, ob es direkt geplant oder erst angefragt ist.
            </p>
            <Link href="/activities/new" className="focus-ring mt-5 inline-flex min-h-14 items-center justify-center gap-3 rounded-md bg-redbrand px-7 py-3 text-base font-semibold text-white shadow-soft hover:bg-redbrandHover">
              <Plus className="h-5 w-5" />
              Neuen Spieltermin anlegen
            </Link>
          </Panel>
          {ordersEnabled ? (
            <Panel className="bg-paper text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sky-600 text-white">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h2 className="text-2xl font-semibold text-ink">Self-Bondage-Auftrag</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-graphite">
                Erteile einen Auftrag mit einer Self-Bondage-fähigen Szene oder einer freien Anweisung.
              </p>
              {selfBondagePositions.length ? (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {selfBondagePositions.map((position) => (
                    <span key={position.id} className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-graphite">{position.name}</span>
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-md bg-surface p-3 text-sm text-graphite">Markiere bei Szenen das Feld „Self-Bondage-fähig“, damit sie hier auftauchen.</p>
              )}
              <Link href="/orders" className="focus-ring mt-5 inline-flex min-h-14 items-center justify-center gap-3 rounded-md border border-sky-600 bg-sky-600 px-7 py-3 text-base font-semibold text-white shadow-soft hover:bg-sky-700">
                <ShieldCheck className="h-5 w-5" />
                Aufträge öffnen
              </Link>
            </Panel>
          ) : null}
          <Panel className="bg-paper text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-white">
              <Lightbulb className="h-6 w-6" />
            </div>
            <h2 className="text-2xl font-semibold text-ink">Ideensammlung</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-graphite">
              Sammle Dinge, die ihr irgendwann ausprobieren wollt. Bilder und Bausteine bleiben direkt an der Idee hängen.
            </p>
            <Link href="/activities/new?template=idea" className="focus-ring mt-5 inline-flex min-h-14 items-center justify-center gap-3 rounded-md border border-amber-500 bg-amber-500 px-7 py-3 text-base font-semibold text-white shadow-soft hover:bg-amber-600">
              <Lightbulb className="h-5 w-5" />
              Idee festhalten
            </Link>
          </Panel>
        </div>
        ) : null}

        {activitiesEnabled && requestedPlans.length ? (
          <Panel className="border-redbrand bg-redbrand/10">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-ink">Offene Spielplan-Anfragen</h2>
                <p className="mt-1 text-sm text-graphite">Diese Spielpläne sind angefragt und werden erst nach Bestätigung als geplant geführt.</p>
              </div>
              <Link href="/activities" className="inline-flex min-h-10 items-center rounded-md border border-redbrand bg-surface px-4 py-2 text-sm font-semibold text-redbrand hover:bg-paper">
                Spielpläne öffnen
              </Link>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {requestedPlans.map((activity) => {
                const ownerName = activity.owner.profile?.displayName || activity.owner.name || activity.owner.username || activity.owner.email;
                const canConfirm = activity.ownerId !== user.id;
                return (
                  <article key={activity.id} className="rounded-lg border border-line bg-surface p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge tone="green">angefragt</Badge>
                      <span className="text-xs text-graphite">von {ownerName}</span>
                    </div>
                    <Link href={`/activities/${activity.slug}`} className="block text-base font-semibold text-ink hover:text-redbrand">{activity.title}</Link>
                    <p className="mt-1 text-xs text-graphite">{activity.plannedAt ? formatDateTime(activity.plannedAt) : "noch ohne Termin"}</p>
                    <p className="mt-2 text-xs text-graphite">{activity.tools.length} Spielsachen · {activity.positions.length} Szenen</p>
                    {canConfirm ? (
                      <form action={confirmRequestedActivity} className="mt-3">
                        <input type="hidden" name="id" value={activity.id} />
                        <button className="focus-ring min-h-9 rounded-md bg-redbrand px-3 py-1.5 text-xs font-semibold text-white hover:bg-redbrandHover">
                          Anfrage bestätigen
                        </button>
                      </form>
                    ) : (
                      <p className="mt-3 rounded-md bg-paper p-2 text-xs text-graphite">Wartet auf Bestätigung durch eine andere Person im Kreis.</p>
                    )}
                  </article>
                );
              })}
            </div>
          </Panel>
        ) : null}

        {activitiesEnabled ? (
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
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {ideas.map((idea) => (
                <Link key={idea.id} href={`/activities/${idea.slug}`} className="overflow-hidden rounded-lg border border-line bg-paper hover:border-amber-500">
                  {idea.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fileAssetUrl(idea.images[0].fileId)} alt="" className="aspect-[5/3] w-full object-cover" />
                  ) : (
                    <span className="flex aspect-[5/3] w-full items-center justify-center bg-amber-500/10 text-amber-600">
                      <Lightbulb className="h-8 w-8" />
                    </span>
                  )}
                  <span className="block p-3">
                    <strong className="block truncate text-ink">{idea.title}</strong>
                    <span className="mt-1 block text-xs text-graphite">{activityStatusDisplay(idea.status, false, true)}</span>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <Link href="/activities/new?template=idea" className="block rounded-md border border-dashed border-line bg-paper p-4 text-sm text-graphite hover:border-amber-500 hover:text-ink">
              Noch keine Ideen festgehalten.
            </Link>
          )}
        </Panel>
        ) : null}

        {trackersEnabled && openTrackerEntries.length ? (
          <Panel>
            <h2 className="mb-3 text-lg font-semibold">Laufende Tracker</h2>
            <div className="space-y-2">
              {openTrackerEntries.map((entry) => (
                <div key={entry.id} className="rounded-md border border-line bg-paper p-3 text-sm">
                  <Link href={`/trackers/${entry.trackerType.key}/${entry.slug || entry.id}`} className="block hover:text-redbrand">
                    <strong>{entry.title || entry.trackerType.title}</strong>
                    <span className="ml-2 text-graphite">seit {formatDateTime(entry.startTime)}</span>
                  </Link>
                  {entry.ownerId === user.id ? (
                    <form action={stopDashboardTracker} className="mt-3">
                      <input type="hidden" name="trackerKey" value={entry.trackerType.key} />
                      <button className="focus-ring min-h-9 rounded-md bg-redbrand px-3 py-1.5 text-xs font-semibold text-white hover:bg-redbrandHover">
                        Tracker beenden
                      </button>
                    </form>
                  ) : null}
                </div>
              ))}
            </div>
          </Panel>
        ) : null}

        {activitiesEnabled ? (
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
        ) : null}

        {trackersEnabled ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel>
            <h2 className="mb-4 text-lg font-semibold">Letzte Tracker-Einträge</h2>
            <div className="space-y-3">
              {trackerEntries.map((entry) => (
                <Link key={entry.id} href={`/trackers/${entry.trackerType.key}/${entry.slug || entry.id}`} className="block rounded-md border border-line p-3 hover:border-redbrand hover:bg-paper">
                  <div className="flex items-center justify-between gap-3">
                    <strong>{entry.title || entry.trackerType.title}</strong>
                    <span className="text-sm text-graphite">{formatMinutes(entry.durationMinutes)}</span>
                  </div>
                  <p className="mt-1 text-xs text-graphite">{formatDateTime(entry.startTime)}</p>
                  {entry.notes ? <p className="mt-2 text-sm text-graphite">{entry.notes}</p> : null}
                </Link>
              ))}
            </div>
          </Panel>
          <div />
        </div>
        ) : null}
      </div>
    </AppShell>
  );
}
