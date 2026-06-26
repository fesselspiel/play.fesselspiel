import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, MessageCircle, Newspaper, Plus, Play, ShieldCheck, Sparkles, Square, Star } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { LikeControl } from "@/components/like-control";
import { Badge, Button, PageGuide, Panel, PageHeader } from "@/components/ui";
import { accessibleOwnerIds, ownerScope } from "@/lib/access";
import { confirmRequestedActivity } from "@/lib/activity-actions";
import { updateSelfBondageOrderStatus, selfBondageCategory } from "@/lib/activity-orders";
import { activityStatusDisplay, activityStatusTone } from "@/lib/activity-status";
import { logAction, userDisplayName } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { hasFeature, requireFeature } from "@/lib/features";
import { feedDetailsText, renderFeedTemplate } from "@/lib/feed";
import { homeSectionOrder } from "@/lib/home-layout";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDateTime, formatMinutes } from "@/lib/dates";
import { quotaSummaryText, trackerQuotaStatusForUser } from "@/lib/tracker-quotas";
import { startTrackerEntry, stopAllRunningTrackerEntriesForUser, stopTrackerEntry } from "@/lib/tracker-core";
import { currentTenant } from "@/lib/tenancy";

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

function playReadyRemainingText(expiresAt: Date, now: Date) {
  const remainingMs = expiresAt.getTime() - now.getTime();
  if (remainingMs <= 0) return "läuft jetzt ab";
  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `noch ${hours} Std. ${minutes} Min.`;
  if (hours) return `noch ${hours} Std.`;
  return `noch ${minutes} Min.`;
}

async function expirePlayReadyStatuses(viewer: Awaited<ReturnType<typeof currentUser>>, now: Date) {
  if (!viewer) return;
  const ownerFilter = viewer.tenantId
    ? viewer.circleId
      ? { tenantId: viewer.tenantId, circleId: viewer.circleId, active: true, user: { active: true } }
      : viewer.role === "ADMIN" || viewer.role === "SUPER_ADMIN"
        ? { tenantId: viewer.tenantId, active: true, user: { active: true } }
        : { tenantId: viewer.tenantId, userId: viewer.id, active: true, user: { active: true } }
    : { userId: viewer.id, active: true, user: { active: true } };
  const memberships = await prisma.tenantMembership.findMany({
    where: ownerFilter,
    include: { tenant: true, user: { include: { profile: true, settings: true } } }
  });
  const expiredMap = new Map<string, (typeof memberships)[number]["user"]>();
  memberships
    .filter((membership) => membership.tenant.playReadyExpiryEnabled !== false)
    .map((membership) => membership.user)
    .filter((member) => {
      if (!member.settings?.playReady) return false;
      if (!member.settings.playReadyExpiresAt) return true;
      return member.settings.playReadyExpiresAt <= now;
    })
    .forEach((member) => expiredMap.set(member.id, member));
  const expired = Array.from(expiredMap.values());
  for (const member of expired) {
    await prisma.userSettings.update({
      where: { userId: member.id },
      data: { playReady: false, playReadyUpdatedAt: now, playReadyExpiresAt: null }
    });
    await logAction({
      actorId: member.id,
      action: "play_ready_expired",
      entityType: "userSettings",
      entityId: member.id,
      title: `Spielampel abgelaufen: ${userDisplayName(member)} ist wieder gerade nicht`,
      details: { expiredAt: now.toISOString(), reason: member.settings?.playReadyExpiresAt ? "time_reached" : "missing_expiry_time" },
      href: "/"
    });
  }
}

async function togglePlayReady() {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("playReady");
  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id }, select: { playReady: true, playReadyExpiryMinutes: true } });
  const tenant = await currentTenant();
  const previous = Boolean(settings?.playReady);
  const next = !previous;
  const expiryMinutes = settings?.playReadyExpiryMinutes || 360;
  const expiresAt = next && tenant?.playReadyExpiryEnabled !== false ? new Date(Date.now() + expiryMinutes * 60_000) : null;
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: {
      playReady: next,
      playReadyUpdatedAt: new Date(),
      playReadyExpiresAt: expiresAt,
      playReadyExpiryMinutes: expiryMinutes
    },
    create: {
      userId: user.id,
      playReady: true,
      playReadyUpdatedAt: new Date(),
      playReadyExpiresAt: expiresAt,
      playReadyExpiryMinutes: expiryMinutes
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
    details: { previous: playReadyLabel(previous), next: playReadyLabel(next), expiryMinutes, expiresAt: expiresAt?.toISOString() || null },
    href: "/"
  });
  redirect("/");
}

async function likePlayReady(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("playReady");
  const targetUserId = String(formData.get("targetUserId") || "");
  if (!targetUserId || targetUserId === user.id) redirect("/");
  const target = await prisma.user.findFirst({
    where: {
      id: targetUserId,
      active: true,
      ...(user.tenantId ? { memberships: { some: { tenantId: user.tenantId, active: true } } } : {})
    },
    include: { profile: true }
  });
  if (!target) redirect("/");
  const existing = await prisma.playReadyLike.findFirst({
    where: { tenantId: user.tenantId || null, actorId: user.id, targetUserId: target.id }
  });
  const targetName = userDisplayName(target);
  if (existing) {
    await prisma.playReadyLike.delete({ where: { id: existing.id } });
    await logAction({
      actorId: user.id,
      action: "play_ready_unliked",
      entityType: "user",
      entityId: target.id,
      title: `Spielampel-Like entfernt: ${targetName}`,
      href: "/",
      details: { targetUserId: target.id, targetName }
    });
  } else {
    await prisma.playReadyLike.create({ data: { tenantId: user.tenantId || undefined, actorId: user.id, targetUserId: target.id } });
    await logAction({
      actorId: user.id,
      action: "play_ready_liked",
      entityType: "user",
      entityId: target.id,
      title: `Spielampel geliked: ${targetName}`,
      href: "/",
      details: { targetUserId: target.id, targetName }
    });
  }
  redirect("/");
}

async function stopDashboardTracker(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const key = String(formData.get("trackerKey") || "");
  await requireFeature(`tracker.${key}`);
  const returnTo = String(formData.get("returnTo") || "");
  const entry = await stopTrackerEntry({ key, user });
  if (!entry) redirect("/");
  await requireFeature("trackers");
  await logAction({
    actorId: user.id,
    action: `tracker_${key}_stopped`,
    entityType: "trackerEntry",
    entityId: entry.id,
    title: `${entry.title || key} beendet`,
    href: `/trackers/${key}/${entry.slug || entry.id}`
  });
  redirect(returnTo || `/trackers/${key}/${entry.slug || entry.id}`);
}

async function stopAllDashboardTrackers(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("trackers");
  const returnTo = String(formData.get("returnTo") || "/");

  const { openEntries, stopped } = await stopAllRunningTrackerEntriesForUser({ user, notes: "Massenstopp per Dashboard" });
  if (!stopped.length) redirect(returnTo);
  for (const stoppedEntry of stopped) {
    const source = openEntries.find((entry) => entry.id === stoppedEntry.id);
    const key = source?.trackerType.key;
    if (!key) continue;
    const title = stoppedEntry.title || key || "Tracker";
    await logAction({
      actorId: user.id,
      action: `tracker_${key}_stopped`,
      entityType: "trackerEntry",
      entityId: stoppedEntry.id,
      title: `${title} beendet`,
      href: `/trackers/${key}/${stoppedEntry.slug || stoppedEntry.id}`
    });
  }

  redirect(returnTo);
}

async function startDashboardTracker(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const key = String(formData.get("trackerKey") || "");
  const notes = String(formData.get("notes") || "").trim() || "Per Dashboard gestartet";
  const returnTo = String(formData.get("returnTo") || "/");
  await requireFeature("trackers");
  await requireFeature(`tracker.${key}`);
  const entry = await startTrackerEntry({ key, user, notes });
  if (!entry) redirect("/");
  await logAction({
    actorId: user.id,
    action: `tracker_${key}_started`,
    entityType: "trackerEntry",
    entityId: entry.id,
    title: `${entry.title || key} gestartet`,
    href: `/trackers/${key}/${entry.slug || entry.id}`
  });
  redirect(returnTo);
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

async function likeFeedEntry(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const auditLogId = String(formData.get("auditLogId") || "");
  if (!auditLogId) redirect("/");
  const accessIds = await accessibleOwnerIds(user);
  const auditLog = await prisma.auditLog.findFirst({
    where: {
      id: auditLogId,
      OR: [{ actorId: { in: accessIds } }, { actorId: null }]
    },
    select: { id: true, title: true, href: true }
  });
  if (!auditLog) redirect("/");
  const existing = await prisma.feedLike.findUnique({ where: { auditLogId_userId: { auditLogId: auditLog.id, userId: user.id } } });
  if (existing) {
    await prisma.feedLike.delete({ where: { id: existing.id } });
    await logAction({
      actorId: user.id,
      action: "feed_unliked",
      entityType: "auditLog",
      entityId: auditLog.id,
      title: `Feed-Like entfernt: ${auditLog.title}`,
      href: auditLog.href || "/",
      details: { auditLogId: auditLog.id }
    });
  } else {
    await prisma.feedLike.create({ data: { auditLogId: auditLog.id, userId: user.id } });
    await logAction({
      actorId: user.id,
      action: "feed_liked",
      entityType: "auditLog",
      entityId: auditLog.id,
      title: `Feed geliked: ${auditLog.title}`,
      href: auditLog.href || "/",
      details: { auditLogId: auditLog.id }
    });
  }
  redirect("/");
}

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(todayStart);
  weekEnd.setDate(todayStart.getDate() + 7);
  const scope = await ownerScope(user);
  const auditAccessIds = await accessibleOwnerIds(user);
  const [playReadyEnabled, activitiesEnabled, selfBondageEnabled, ordersEnabled, trackersEnabled, auditLogEnabled, toysEnabled, positionsEnabled] = await Promise.all([
    hasFeature("playReady"),
    hasFeature("activities"),
    hasFeature("selfBondage"),
    hasFeature("orders"),
    hasFeature("trackers"),
    hasFeature("auditLog"),
    hasFeature("toys"),
    hasFeature("positions")
  ]);
  if (playReadyEnabled) await expirePlayReadyStatuses(user, now);
  const [trackerEntries, runningTrackerEntries, weekActivities, weekEvents, circleUsers, selfBondagePositions, favoriteToys, favoritePositions, openOrders, requestedPlans, feedRules] = await Promise.all([
    trackersEnabled ? prisma.trackerEntry.findMany({ where: scope, include: { trackerType: true }, orderBy: { startTime: "desc" }, take: 8 }) : Promise.resolve([]),
    trackersEnabled
      ? prisma.trackerEntry.findMany({
          where: { ...scope, endTime: null, allDay: false },
          include: { trackerType: { select: { key: true, title: true } } },
          orderBy: { startTime: "desc" }
        })
      : Promise.resolve([]),
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
    playReadyEnabled
      ? prisma.tenantMembership.findMany({
          where: user.tenantId
            ? user.circleId
              ? { tenantId: user.tenantId, circleId: user.circleId, active: true, user: { active: true } }
              : user.role === "ADMIN" || user.role === "SUPER_ADMIN"
                ? { tenantId: user.tenantId, active: true, user: { active: true } }
                : { tenantId: user.tenantId, userId: user.id, active: true, user: { active: true } }
            : { userId: user.id, active: true, user: { active: true } },
          include: {
            user: {
              include: {
                settings: true,
                profile: true,
                playReadyLikesReceived: {
                  where: { tenantId: user.tenantId || null },
                  include: { actor: { include: { profile: true } } },
                  orderBy: { createdAt: "desc" }
                }
              }
            }
          },
          orderBy: { createdAt: "asc" }
        })
      : Promise.resolve([]),
    selfBondageEnabled
      ? prisma.position.findMany({
          where: { ...scope, selfBondageCapable: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          take: 6
        })
      : Promise.resolve([]),
    toysEnabled
      ? prisma.toyFavorite.findMany({ where: { userId: user.id, toy: scope }, include: { toy: true }, orderBy: { createdAt: "desc" }, take: 4 })
      : Promise.resolve([]),
    positionsEnabled
      ? prisma.positionFavorite.findMany({ where: { userId: user.id, position: scope }, include: { position: true }, orderBy: { createdAt: "desc" }, take: 4 })
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
          },
          feedLikes: { include: { user: { include: { profile: true } } }, orderBy: { createdAt: "asc" } }
        },
        orderBy: { createdAt: "desc" },
        take: 8
      })
    : [];
  const quotaTodos = (await trackerQuotaStatusForUser(user)).filter((status) => status.hasQuota);
  const runningTrackerByKey = new Map(runningTrackerEntries.map((entry) => [entry.trackerType.key, entry]));
  const trackerTodoReturnTo = "/#trackerTodos";
  const homeTenant = user.tenantId ? await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { homeLayout: true } }) : null;
  const sectionStyle = (key: Parameters<typeof homeSectionOrder>[1]) => ({ order: homeSectionOrder(homeTenant?.homeLayout, key) });

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
  const openTrackerEntries = [...runningTrackerEntries];
  const runningTrackerEntriesByOwner = new Map(openTrackerEntries.filter((entry) => entry.ownerId === user.id).map((entry) => [entry.trackerType.key, entry]));
  const runningTrackerCount = runningTrackerEntriesByOwner.size;
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

      <div className="flex flex-col gap-6">
        {playReadyEnabled ? (
          <Panel style={sectionStyle("playReady")}>
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
                const likes = member.playReadyLikesReceived || [];
                const likedBySelf = likes.some((like) => like.actorId === user.id);
                const likePeople = likes.map((like) => ({ id: like.actorId, name: userDisplayName(like.actor) }));
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
                      {ready ? (
                        <span className="mt-1 block text-xs font-semibold text-graphite">
                          {member.settings?.playReadyExpiresAt
                            ? playReadyRemainingText(member.settings.playReadyExpiresAt, now)
                            : "ohne Ablaufzeit"}
                        </span>
                      ) : null}
                      {isSelf ? <span className="mt-1 block text-xs text-graphite">Antippen zum Umschalten</span> : null}
                    </span>
                  </span>
                );
                return isSelf ? (
                  <form key={member.id} action={togglePlayReady}>
                    <button type="submit" className="focus-ring block w-full rounded-lg">{content}</button>
                  </form>
                ) : (
                  <div key={member.id} className="space-y-2">
                    {content}
                    <LikeControl action={likePlayReady} hiddenName="targetUserId" hiddenValue={member.id} liked={likedBySelf} likes={likePeople} />
                  </div>
                );
              })}
            </div>
          </Panel>
        ) : null}

        {favoriteToys.length || favoritePositions.length ? (
          <Panel style={sectionStyle("favorites")}>
            <div className="mb-4 flex items-center gap-2">
              <Star className="h-5 w-5 text-redbrand" />
              <h2 className="text-lg font-semibold text-ink">Favoriten</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {favoriteToys.map(({ toy }) => (
                <Link key={`toy-${toy.id}`} href={`/toys/${toy.slug}`} className="rounded-md border border-line bg-paper p-3 text-sm hover:border-redbrand">
                  <span className="block font-semibold text-ink">{toy.title}</span>
                  <span className="mt-1 block text-xs text-graphite">Spielzeug</span>
                </Link>
              ))}
              {favoritePositions.map(({ position }) => (
                <Link key={`position-${position.id}`} href={`/positions/${position.slug}`} className="rounded-md border border-line bg-paper p-3 text-sm hover:border-redbrand">
                  <span className="block font-semibold text-ink">{position.name}</span>
                  <span className="mt-1 block text-xs text-graphite">Szene</span>
                </Link>
              ))}
            </div>
          </Panel>
        ) : null}

        {quotaTodos.length ? (
          <Panel id="trackerTodos" style={sectionStyle("trackerTodos")}>
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
                const running = runningTrackerByKey.get(todo.tracker.key);
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
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href={`/sessions?tracker=${todo.tracker.key}`} className="inline-flex min-h-8 items-center rounded-md border border-line bg-surface px-3 py-2 text-xs font-semibold hover:bg-paper">
                        Tracker öffnen
                      </Link>
                      {running ? (
                        running.ownerId === user.id ? (
                          <form action={stopDashboardTracker}>
                            <input type="hidden" name="trackerKey" value={todo.tracker.key} />
                            <input type="hidden" name="returnTo" value={trackerTodoReturnTo} />
                            <Button variant="danger" type="submit"><Square className="h-4 w-4" /> Stop</Button>
                          </form>
                        ) : (
                          <span className="inline-flex min-h-8 items-center rounded-md border border-line bg-surface px-3 py-2 text-xs text-graphite">läuft gerade</span>
                        )
                      ) : (
                        <form action={startDashboardTracker}>
                          <input type="hidden" name="trackerKey" value={todo.tracker.key} />
                          <input type="hidden" name="returnTo" value={trackerTodoReturnTo} />
                          <input type="hidden" name="notes" value={`Tracker ${todo.tracker.title} gestartet`} />
                          <Button type="submit"><Play className="h-4 w-4" /> Start</Button>
                        </form>
                      )}
                    </div>
                  </article>
                );
              })}
              </div>
            </Panel>
        ) : null}

        {feedEntries.length ? (
          <Panel style={sectionStyle("feed")}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Newspaper className="h-5 w-5 text-redbrand" />
                  Feed
                </h2>
                <p className="mt-1 text-sm text-graphite">Ausgewählte Aktionen aus dem Protokoll.</p>
              </div>
              {isAdmin ? (
                <Link href="/messages#feed-rules" className="inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper">
                  Feed steuern
                </Link>
              ) : null}
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {feedEntries.map((entry) => {
                const rule = feedRuleByAction.get(entry.action);
                const title = rule ? renderFeedTemplate(rule.titleTemplate, entry, entry.actor) : entry.title;
                const body = rule ? renderFeedTemplate(rule.bodyTemplate, entry, entry.actor) : feedDetailsText(entry.details);
                const actorName = entry.actor?.profile?.displayName || entry.actor?.name || entry.actor?.username || entry.actor?.email || "System";
                const likedByCurrentUser = entry.feedLikes.some((like) => like.userId === user.id);
                const feedLikePeople = entry.feedLikes.map((like) => ({ id: like.userId, name: like.user ? userDisplayName(like.user) : "Jemand" }));
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
                    <div className="mt-2">
                      <LikeControl action={likeFeedEntry} hiddenName="auditLogId" hiddenValue={entry.id} liked={likedByCurrentUser} likes={feedLikePeople} />
                    </div>
                    {entry.feedComments.length ? (
                      <div className="mt-3 space-y-1 border-t border-line pt-2">
                        {entry.feedComments.map((comment) => (
                          <p key={comment.id} className="text-xs leading-5 text-graphite">
                            <span className="font-semibold text-ink">{comment.author?.profile?.displayName || comment.author?.name || comment.author?.username || "Kommentar"}:</span> {comment.body}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    <details className="group/comment mt-2">
                      <summary className="focus-ring inline-flex min-h-7 cursor-pointer list-none items-center gap-1 rounded-sm px-1 py-0.5 text-xs font-semibold text-graphite hover:text-redbrand [&::-webkit-details-marker]:hidden">
                        <MessageCircle className="h-3.5 w-3.5" />
                        Kommentieren
                      </summary>
                      <form action={commentFeedEntry} className="mt-2 flex gap-2">
                        <input type="hidden" name="auditLogId" value={entry.id} />
                        <input name="body" className="min-h-9 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-xs text-ink placeholder:text-graphite/60" placeholder="Kommentar schreiben" />
                        <button type="submit" className="focus-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-redbrand text-white hover:bg-redbrandHover" aria-label="Kommentar senden">
                          <MessageCircle className="h-4 w-4" />
                        </button>
                      </form>
                    </details>
                  </article>
                );
              })}
            </div>
          </Panel>
        ) : null}

        {ordersEnabled && openOrders.length ? (
          <Panel className="border-sky-600 bg-sky-600/10" style={sectionStyle("orders")}>
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
        <div className={`grid gap-4 ${ordersEnabled ? "xl:grid-cols-3" : "xl:grid-cols-2"}`} style={sectionStyle("quickActions")}>
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
        </div>
        ) : null}

        {activitiesEnabled && requestedPlans.length ? (
          <Panel className="border-redbrand bg-redbrand/10" style={sectionStyle("requestedPlans")}>
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

        {trackersEnabled && openTrackerEntries.length ? (
          <Panel id="runningTrackers" style={sectionStyle("runningTrackers")}>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Laufende Tracker</h2>
                <p className="mt-1 text-sm text-graphite">
                  {runningTrackerCount ? `Du hast ${runningTrackerCount} laufende Tracker von dir.` : "Du hast keine eigenen laufenden Tracker."}
                  {` Gesamt aktiv: ${openTrackerEntries.length}.`}
                </p>
              </div>
              {runningTrackerCount ? (
                <form action={stopAllDashboardTrackers} className="shrink-0">
                  <input type="hidden" name="returnTo" value="/#runningTrackers" />
                  <Button variant="danger" type="submit"><Square className="h-4 w-4" /> Alle stoppen</Button>
                </form>
              ) : null}
            </div>
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
                      <input type="hidden" name="returnTo" value="/#runningTrackers" />
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
        <Panel style={sectionStyle("week")}>
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
        <div className="grid gap-6 xl:grid-cols-2" style={sectionStyle("recentTrackers")}>
          <Panel>
            <h2 className="mb-4 text-lg font-semibold">Letzte Tracker-Einträge</h2>
            <div className="space-y-3">
              {trackerEntries.map((entry) => (
                <Link key={entry.id} href={`/trackers/${entry.trackerType.key}/${entry.slug || entry.id}`} className="block rounded-md border border-line p-3 hover:border-redbrand hover:bg-paper">
                  <div className="flex items-center justify-between gap-3">
                    <strong>{entry.title || entry.trackerType.title}</strong>
                    <span className="text-sm text-graphite">{entry.allDay ? "ganzer Tag" : formatMinutes(entry.durationMinutes)}</span>
                  </div>
                  <p className="mt-1 text-xs text-graphite">{entry.allDay ? formatDate(entry.startTime) : formatDateTime(entry.startTime)}</p>
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
