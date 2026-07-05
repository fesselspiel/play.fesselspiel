import { NextResponse } from "next/server";
import { ensureDefaultAlbum } from "@/lib/albums";
import { buildTelegramHelpText } from "@/lib/capabilities";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { answerWithPortalAgent } from "@/lib/telegram-agent";
import { handleImageReplacementDialogue, handleItemCreationDialogue, handleItemCreationImage, startAlbumCreationDialogue, startToyCreationDialogue } from "@/lib/telegram-item-dialogue";
import { formatDateTime, formatMinutes } from "@/lib/dates";
import { logAction } from "@/lib/audit";
import { createSessionHistoryForCompletedOrder, isSelfBondageOrder, selfBondageCategory } from "@/lib/activity-orders";
import { fileAssetUrl, saveFileBuffer } from "@/lib/files";
import { featureEnabled } from "@/lib/features";
import { createInvite, inviteUsage } from "@/lib/invites";
import { downloadTelegramFile, largestTelegramPhoto, sendTelegramMessage, telegramHtml, telegramLink, transcribeTelegramVoice } from "@/lib/telegram";
import type { TelegramChatMemberUpdate, TelegramMessage, TelegramUpdate, TelegramUser } from "@/lib/telegram";
import { uniqueSlug } from "@/lib/slug";
import { rememberKnownTelegramUser } from "@/lib/telegram-known-users";
import { ensureUserSettings } from "@/lib/tenant-telegram";
import { startTrackerEntry, stopTrackerEntry } from "@/lib/tracker-core";
import { trackerQuotaStatusForUser } from "@/lib/tracker-quotas";

type TelegramMessageFrom = TelegramMessage["from"];

async function tenantIdForUser(userId: string) {
  const membership = await prisma.tenantMembership.findFirst({
    where: { userId, active: true },
    orderBy: { createdAt: "asc" },
    select: { tenantId: true }
  });
  if (membership?.tenantId) return membership.tenantId;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tenantId: true } });
  return user?.tenantId || undefined;
}

const HELP_TEXT = buildTelegramHelpText();

function htmlLine(label: string, value: unknown) {
  return `<b>${telegramHtml(label)}:</b> ${telegramHtml(value || "-")}`;
}

function htmlList(title: string, rows: string[]) {
  if (!rows.length) return `<b>${telegramHtml(title)}</b>\nKeine Einträge gefunden.`;
  return [`<b>${telegramHtml(title)}</b>`, ...rows].join("\n\n");
}

type TrackerQuotaStatus = Awaited<ReturnType<typeof trackerQuotaStatusForUser>>[number];

function quotaProgressLine(label: string, progress: { required: number; done: number; remaining: number; complete: boolean }, unit: "minutes" | "days") {
  if (!progress.required) return "";
  const done = unit === "minutes" ? formatMinutes(progress.done) : `${progress.done} Tage`;
  const required = unit === "minutes" ? formatMinutes(progress.required) : `${progress.required} Tage`;
  const remaining = unit === "minutes" ? formatMinutes(progress.remaining) : `${progress.remaining} Tage`;
  return [
    `<b>${telegramHtml(label)}</b>`,
    htmlLine("Erledigt", `${done} von ${required}`),
    htmlLine(progress.complete ? "Offen" : "Noch zu tun", progress.complete ? "erfüllt" : remaining)
  ].join("\n");
}

function trackerQuotaHtml(status: TrackerQuotaStatus, compact = false) {
  const rows = [
    quotaProgressLine("Heute", status.daily, "minutes"),
    quotaProgressLine(status.weeklyMode === "rolling" ? "Letzte 7 Tage" : "Diese Woche", status.weekly, "minutes"),
    quotaProgressLine("Dieser Monat Zeit", status.monthlyMinutes, "minutes"),
    quotaProgressLine("Dieser Monat Tage", status.monthlyDays, "days")
  ].filter(Boolean);
  if (!rows.length) return "";
  return compact
    ? [`<b>${telegramHtml(status.tracker.title)}</b>`, ...rows].join("\n")
    : [`<b>${telegramHtml(status.tracker.title)}</b>`, rows.join("\n\n"), telegramLink(`${env.appUrl}/sessions?tracker=${status.tracker.key}`, "Tracker öffnen")].join("\n");
}

async function trackerQuotaMessage(userId: string, trackerKey?: string | null) {
  const tenantId = await tenantIdForUser(userId);
  const quotas = (await trackerQuotaStatusForUser({ id: userId, tenantId }))
    .filter((entry) => entry.hasQuota)
    .filter((entry) => !trackerKey || entry.tracker.key === trackerKey);
  if (!quotas.length) return "<b>Tracker-Kontingente</b>\nKeine Kontingente konfiguriert.";
  return [`<b>Tracker-Kontingente</b>`, ...quotas.map((entry) => trackerQuotaHtml(entry))].join("\n\n");
}

function userDisplayName(user: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null }) {
  return user.profile?.displayName || user.name || user.username || user.email || "Benutzer";
}

async function favoriteTargetUser(userId: string, targetName: string, tenantId?: string | null) {
  const current = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
  const query = targetName.trim();
  if (!query || !current) return current;
  const normalized = query.toLowerCase();
  const candidates = await prisma.user.findMany({
    where: {
      active: true,
      ...(tenantId ? { OR: [{ tenantId }, { memberships: { some: { tenantId, active: true } } }] } : {}),
      OR: [
        { username: { contains: normalized, mode: "insensitive" } },
        { name: { contains: query, mode: "insensitive" } },
        { email: { contains: normalized, mode: "insensitive" } },
        { profile: { displayName: { contains: query, mode: "insensitive" } } }
      ]
    },
    include: { profile: true },
    take: 5
  });
  return candidates.find((entry) => userDisplayName(entry).toLowerCase() === normalized || entry.username?.toLowerCase() === normalized) || candidates[0] || current;
}

async function favoritesMessage(userId: string, targetName: string) {
  const tenantId = await tenantIdForUser(userId);
  const target = await favoriteTargetUser(userId, targetName, tenantId);
  if (!target) return "Benutzer nicht gefunden.";
  const tenantScope = tenantId ? { tenantId } : {};
  const [toys, positions] = await Promise.all([
    prisma.toyFavorite.findMany({ where: { userId: target.id, toy: tenantScope }, include: { toy: true }, orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.positionFavorite.findMany({ where: { userId: target.id, position: tenantScope }, include: { position: true }, orderBy: { createdAt: "desc" }, take: 12 })
  ]);
  const sections = [`<b>Favoriten von ${telegramHtml(userDisplayName(target))}</b>`];
  if (toys.length) sections.push(htmlList("Spielzeuge", toys.map((entry, index) => `<b>${index + 1}. ${telegramHtml(entry.toy.title)}</b>\n${telegramLink(`${env.appUrl}/toys/${entry.toy.slug}`, "öffnen")}`)));
  if (positions.length) sections.push(htmlList("Szenen", positions.map((entry, index) => `<b>${index + 1}. ${telegramHtml(entry.position.name)}</b>\n${telegramLink(`${env.appUrl}/positions/${entry.position.slug}`, "öffnen")}`)));
  if (!toys.length && !positions.length) sections.push("Keine Favoriten gefunden.");
  return sections.join("\n\n");
}

const activityStatusLabel = { REQUESTED: "angefragt", PLANNED: "geplant", DONE: "durchgeführt", DISCARDED: "verworfen" } as const;
const orderStatusLabel = { REQUESTED: "beauftragt", PLANNED: "angenommen", DONE: "umgesetzt", DISCARDED: "verworfen" } as const;

function commandOf(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const [rawCommand, ...rest] = trimmed.split(/\s+/);
  const command = rawCommand.split("@")[0].toLowerCase();
  return { command, args: rest.join(" ").trim() };
}

async function handleCommand(userId: string, text: string, chatId: string, threadId: string | null) {
  const parsed = commandOf(text);
  if (!parsed) return `Verstanden: ${text}`;
  const tenantId = await tenantIdForUser(userId);
  const tenantScope = tenantId ? { tenantId } : {};
  const appUser = await prisma.user.findUnique({
    where: { id: userId },
    include: { settings: true, profile: true, tenant: { include: { features: true } } }
  });
  const visibleOwnerIds = appUser?.tenantId && (appUser.role === "ADMIN" || appUser.role === "SUPER_ADMIN")
    ? (await prisma.tenantMembership.findMany({ where: { tenantId: appUser.tenantId, active: true, user: { active: true } }, select: { userId: true } })).map((entry) => entry.userId)
    : appUser?.tenantId && appUser.circleId
      ? (await prisma.tenantMembership.findMany({ where: { tenantId: appUser.tenantId, circleId: appUser.circleId, active: true, user: { active: true } }, select: { userId: true } })).map((entry) => entry.userId)
      : [userId];
  const visibleOwnerScope = { ...tenantScope, ownerId: { in: visibleOwnerIds.length ? visibleOwnerIds : [userId] } };

  if (parsed.command === "/start" || parsed.command === "/help") return HELP_TEXT;
  if (parsed.command === "/id") return ["<b>Telegram-Verbindung</b>", htmlLine("Chat-ID", chatId), htmlLine("Thread-ID", threadId || "-"), htmlLine("Status", "aktiv")].join("\n");

  if (parsed.command === "/status") {
    const [toys, positions, activities, sessions, kgSessions] = await Promise.all([
      prisma.toy.count({ where: { ...tenantScope, ownerId: userId } }),
      prisma.position.count({ where: { ...tenantScope, ownerId: userId } }),
      prisma.activityPlan.count({ where: { ...tenantScope, ownerId: userId, category: { not: "IDEA_COLLECTION" }, status: { in: ["REQUESTED", "PLANNED"] } } }),
      prisma.trackerEntry.count({ where: { ...tenantScope, ownerId: userId, trackerType: { key: "segufix" } } }),
      prisma.trackerEntry.count({ where: { ...tenantScope, ownerId: userId, trackerType: { key: "kg" } } })
    ]);
    return ["<b>Portalstatus</b>", htmlLine("Spielzeuge", toys), htmlLine("Szenen", positions), htmlLine("Geplante Aktivitäten", activities), htmlLine("Segufix-Sessions", sessions), htmlLine("KG-Einträge", kgSessions)].join("\n");
  }

  if (parsed.command === "/invites") {
    if (!featureEnabled(appUser?.tenant?.features, "invites")) return "Einladungen sind auf dieser Seite nicht aktiv.";
    if (!appUser) return "Benutzer nicht gefunden.";
    const usage = await inviteUsage(appUser);
    return [
      "<b>Einladungen</b>",
      usage.quota === null ? "Kontingent: unbegrenzt" : htmlLine("Übrig", `${usage.remaining} von ${usage.quota}`),
      htmlLine("Offen oder benutzt", usage.used),
      telegramLink(`${env.appUrl}/settings/invites`, "Einladungen öffnen")
    ].join("\n");
  }

  if (parsed.command === "/invite") {
    if (!featureEnabled(appUser?.tenant?.features, "invites")) return "Einladungen sind auf dieser Seite nicht aktiv.";
    if (!appUser?.tenantId) return "Keine Seite zugeordnet.";
    const result = await createInvite({
      tenantId: appUser.tenantId,
      invitedBy: appUser,
      name: parsed.args || null
    });
    if (!result.ok) return "Dein Einladungskontingent ist aufgebraucht.";
    return [
      "<b>Einladung erstellt</b>",
      result.invite.name ? htmlLine("Name", result.invite.name) : "",
      telegramLink(result.url, "Einladung annehmen"),
      telegramLink(`${env.appUrl}/settings/invites`, "Einladungen verwalten")
    ].filter(Boolean).join("\n");
  }

  if (parsed.command === "/kontingent" || parsed.command === "/quotas" || parsed.command === "/quota") {
    const arg = parsed.args.toLowerCase();
    const trackerKey = arg.includes("kg") ? "kg" : arg.includes("segufix") ? "segufix" : null;
    return trackerQuotaMessage(userId, trackerKey);
  }

  if (parsed.command === "/favoriten" || parsed.command === "/favorites") {
    return favoritesMessage(userId, parsed.args);
  }

  if (parsed.command.startsWith("/media_album_")) {
    const match = parsed.command.match(/^\/media_album_(\d+)_(.+)$/);
    if (!match) return "Ungültiger Album-Befehl.";
    const albumIndex = Number(match[1]);
    const mediaId = match[2];
    const [media, albums] = await Promise.all([
      prisma.media.findFirst({ where: { id: mediaId, ...tenantScope, ownerId: userId } }),
      prisma.album.findMany({ where: { ...tenantScope, ownerId: userId }, orderBy: { title: "asc" } })
    ]);
    const album = albums[albumIndex - 1];
    if (!media || !album) return "Bild oder Album wurde nicht gefunden.";
    await prisma.media.update({ where: { id: media.id }, data: { albumId: album.id } });
    await logAction({
      actorId: userId,
      action: "media_album_changed_telegram",
      entityType: "media",
      entityId: media.id,
      title: `Bild per Telegram in Album verschoben: ${album.title}`,
      href: "/media"
    });
    return [`<b>Bild einsortiert</b>`, htmlLine("Bild", media.title), htmlLine("Album", album.title), telegramLink(`${env.appUrl}/media?view=${media.id}`, "Bilder öffnen")].join("\n");
  }

  if (parsed.command === "/toys") {
    const toys = await prisma.toy.findMany({ where: { ...tenantScope, ownerId: userId }, include: { category: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }], take: 12 });
    return htmlList(
      "Spielzeuge",
      toys.map((toy, index) =>
        [`<b>${index + 1}. ${telegramHtml(toy.title)}</b>`, `Kategorie: ${telegramHtml(toy.category?.name || "Allgemein")}`, toy.description ? telegramHtml(toy.description) : "", telegramLink(`${env.appUrl}/toys/${toy.slug}`, "öffnen")]
          .filter(Boolean)
          .join("\n")
      )
    );
  }

  if (parsed.command === "/toy_new" || parsed.command === "/toy") {
    return startToyCreationDialogue(userId, parsed.args);
  }

  if (parsed.command === "/positions") {
    const positions = await prisma.position.findMany({ where: { ...tenantScope, ownerId: userId }, include: { category: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], take: 12 });
    return htmlList(
      "Szenen",
      positions.map((position, index) =>
        [`<b>${index + 1}. ${telegramHtml(position.name)}</b>`, `Kategorie: ${telegramHtml(position.category?.name || "Allgemein")}`, position.description ? telegramHtml(position.description) : "", telegramLink(`${env.appUrl}/positions/${position.slug}`, "öffnen")]
          .filter(Boolean)
          .join("\n")
      )
    );
  }

  if (parsed.command === "/activities") {
    const activities = await prisma.activityPlan.findMany({
      where: { ...visibleOwnerScope, category: { notIn: ["IDEA_COLLECTION", selfBondageCategory] }, status: { in: ["REQUESTED", "PLANNED"] } },
      include: { tools: true, positions: true },
      orderBy: [{ status: "asc" }, { plannedAt: "asc" }],
      take: 8
    });
    const requested = activities.filter((activity) => activity.status === "REQUESTED");
    return htmlList(
      "Spielpläne",
      activities.map((activity, index) =>
        [
          `<b>${index + 1}. ${telegramHtml(activity.title)}</b>`,
          htmlLine("Status", activityStatusLabel[activity.status]),
          htmlLine("Termin", formatDateTime(activity.plannedAt)),
          htmlLine("Bausteine", `${activity.tools.length} Spielzeuge, ${activity.positions.length} Szenen`),
          telegramLink(`${env.appUrl}/activities/${activity.slug}`, "öffnen"),
          activity.status === "REQUESTED" ? `/activity_confirm_${requested.findIndex((entry) => entry.id === activity.id) + 1}` : ""
        ].join("\n")
      )
    );
  }

  if (parsed.command === "/orders") {
    const orders = await prisma.activityPlan.findMany({
      where: { ...visibleOwnerScope, category: selfBondageCategory, status: { in: ["REQUESTED", "PLANNED"] } },
      include: { owner: { include: { profile: true } }, positions: true },
      orderBy: [{ status: "asc" }, { plannedAt: "asc" }, { createdAt: "desc" }],
      take: 12
    });
    const actionable = orders.filter((order) => order.ownerId !== userId);
    return htmlList(
      "Self-Bondage-Aufträge",
      orders.map((order, index) => {
        const actionIndex = actionable.findIndex((entry) => entry.id === order.id) + 1;
        const ownerName = order.owner.profile?.displayName || order.owner.name || order.owner.username || order.owner.email;
        return [
          `<b>${index + 1}. ${telegramHtml(order.title)}</b>`,
          htmlLine("Status", orderStatusLabel[order.status]),
          htmlLine("Von", ownerName),
          htmlLine("Termin", order.plannedAt ? formatDateTime(order.plannedAt) : "gilt beim Lesen"),
          order.positions.length ? htmlLine("Szenen", order.positions.map((position) => position.name).join(", ")) : "",
          telegramLink(`${env.appUrl}/activities/${order.slug}`, "öffnen"),
          actionIndex > 0 && order.status === "REQUESTED" ? `/order_accept_${actionIndex}` : "",
          actionIndex > 0 ? `/order_done_${actionIndex}` : ""
        ].filter(Boolean).join("\n");
      })
    );
  }

  if (parsed.command === "/activity_request") {
    const title = parsed.args || "Spielanfrage";
    const activity = await prisma.activityPlan.create({
      data: {
        tenantId,
        ownerId: userId,
        title,
        slug: await uniqueSlug("activityPlan", title, tenantId),
        status: "REQUESTED",
        note: "Per Telegram angefragt"
      }
    });
    await logAction({
      actorId: userId,
      action: "activity_requested_telegram",
      entityType: "activity",
      entityId: activity.id,
      title: `Spielplan per Telegram angefragt: ${activity.title}`,
      href: `/activities/${activity.slug}`
    });
    return [`<b>Spielplan angefragt</b>`, telegramHtml(activity.title), telegramLink(`${env.appUrl}/activities/${activity.slug}`, "öffnen")].join("\n");
  }

  if (parsed.command.startsWith("/activity_confirm_")) {
    const index = Number(parsed.command.replace("/activity_confirm_", ""));
    if (!Number.isInteger(index) || index < 1) return "Ungültige Bestätigungsnummer. Nutze /activities für die aktuelle Liste.";
    const requested = await prisma.activityPlan.findMany({
      where: { ...tenantScope, ownerId: userId, status: "REQUESTED" },
      orderBy: [{ plannedAt: "asc" }, { createdAt: "asc" }],
      take: 20
    });
    const activity = requested[index - 1];
    if (!activity) return "Diese Anfrage wurde nicht gefunden. Nutze /activities für die aktuelle Liste.";
    const updated = await prisma.activityPlan.update({ where: { id: activity.id }, data: { status: "PLANNED" } });
    await logAction({
      actorId: userId,
      action: "activity_confirmed_telegram",
      entityType: "activity",
      entityId: updated.id,
      title: `Spielplan per Telegram bestätigt: ${updated.title}`,
      href: `/activities/${updated.slug}`
    });
    return [`<b>Spielplan bestätigt</b>`, telegramHtml(updated.title), telegramLink(`${env.appUrl}/activities/${updated.slug}`, "öffnen")].join("\n");
  }

  if (parsed.command.startsWith("/order_accept_") || parsed.command.startsWith("/order_done_")) {
    const done = parsed.command.startsWith("/order_done_");
    const index = Number(parsed.command.replace(done ? "/order_done_" : "/order_accept_", ""));
    if (!Number.isInteger(index) || index < 1) return "Ungültige Auftragsnummer. Nutze /orders für die aktuelle Liste.";
    const orders = await prisma.activityPlan.findMany({
      where: { ...visibleOwnerScope, category: selfBondageCategory, status: { in: ["REQUESTED", "PLANNED"] }, ownerId: { not: userId } },
      orderBy: [{ status: "asc" }, { plannedAt: "asc" }, { createdAt: "desc" }],
      take: 20
    });
    const order = orders[index - 1];
    if (!order || !isSelfBondageOrder(order)) return "Dieser Auftrag wurde nicht gefunden. Nutze /orders für die aktuelle Liste.";
    const nextStatus = done ? "DONE" : "PLANNED";
    const updated = await prisma.activityPlan.update({ where: { id: order.id }, data: { status: nextStatus } });
    const session = done ? await createSessionHistoryForCompletedOrder(updated, userId) : null;
    await logAction({
      actorId: userId,
      action: done ? "self_bondage_order_completed" : "self_bondage_order_accepted",
      entityType: "activity",
      entityId: updated.id,
      title: `${done ? "Auftrag umgesetzt" : "Auftrag angenommen"}: ${updated.title}`,
      href: `/orders#order-${updated.id}`,
      details: { status: done ? "umgesetzt" : "angenommen", sessionUrl: session?.slug ? `/sessions/${session.slug}` : null, excludeActorFromTargets: true }
    });
    return [`<b>${done ? "Auftrag umgesetzt" : "Auftrag angenommen"}</b>`, telegramHtml(updated.title), telegramLink(`${env.appUrl}/orders#order-${updated.id}`, "Aufträge öffnen")].join("\n");
  }

  if (parsed.command === "/sessions") {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const [sessions, quotaMessage] = await Promise.all([
      prisma.trackerEntry.findMany({ where: { ...tenantScope, ownerId: userId, trackerType: { key: "segufix" }, startTime: { gte: yearStart } } }),
      trackerQuotaMessage(userId, "segufix")
    ]);
    const total = sessions.reduce((sum, session) => sum + (session.durationMinutes || 0), 0);
    const open = sessions.filter((session) => !session.endTime && !session.allDay).length;
    return [`<b>Segufix ${now.getFullYear()}</b>`, htmlLine("Anzahl", sessions.length), htmlLine("Gesamtdauer", formatMinutes(total)), htmlLine("Offen", open), quotaMessage, telegramLink(`${env.appUrl}/sessions?tracker=segufix`, "Tracker öffnen")].join("\n\n");
  }

  if (parsed.command === "/kg") {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const [sessions, quotaMessage] = await Promise.all([
      prisma.trackerEntry.findMany({ where: { ...tenantScope, ownerId: userId, trackerType: { key: "kg" }, startTime: { gte: yearStart } } }),
      trackerQuotaMessage(userId, "kg")
    ]);
    const total = sessions.reduce((sum, session) => sum + (session.durationMinutes || 0), 0);
    const open = sessions.filter((session) => !session.endTime && !session.allDay).length;
    return [`<b>KG Time Tracker ${now.getFullYear()}</b>`, htmlLine("Einträge", sessions.length), htmlLine("Gesamtzeit", formatMinutes(total)), htmlLine("Offen", open), quotaMessage, telegramLink(`${env.appUrl}/sessions?tracker=kg`, "Tracker öffnen")].join("\n\n");
  }

  if (parsed.command === "/album_new" || parsed.command === "/album") {
    return startAlbumCreationDialogue(userId, parsed.args);
  }

  if (parsed.command === "/session_start") {
    const open = await prisma.trackerEntry.findFirst({ where: { ...tenantScope, ownerId: userId, trackerType: { key: "segufix" }, endTime: null, allDay: false }, orderBy: { startTime: "desc" } });
    if (open) return `Es läuft bereits eine Session seit ${formatDateTime(open.startTime)}. Beende sie mit /session_stop.`;
    const session = await startTrackerEntry({
      key: "segufix",
      user: { id: userId, tenantId },
      notes: parsed.args || "Per Telegram gestartet"
    });
    if (!session) return "Segufix-Tracker ist nicht aktiv.";
    await logAction({
      actorId: userId,
      action: "tracker_segufix_started_telegram",
      entityType: "trackerEntry",
      entityId: session.id,
      title: "Segufix per Telegram gestartet",
      href: `/trackers/segufix/${session.slug || session.id}`
    });
    return [`Session gestartet: ${formatDateTime(session.startTime)}`, telegramLink(`${env.appUrl}/trackers/segufix/${session.slug || session.id}`, "Session öffnen")].join("\n");
  }

  if (parsed.command === "/session_stop") {
    const updated = await stopTrackerEntry({ key: "segufix", user: { id: userId, tenantId }, notes: parsed.args });
    if (!updated) return "Keine laufende Session gefunden.";
    await logAction({
      actorId: userId,
      action: "tracker_segufix_stopped_telegram",
      entityType: "trackerEntry",
      entityId: updated.id,
      title: "Segufix per Telegram beendet",
      href: `/trackers/segufix/${updated.slug || updated.id}`
    });
    return `Session beendet: ${formatMinutes(updated.durationMinutes)}`;
  }

  if (parsed.command === "/kg_start") {
    const session = await startTrackerEntry({
      key: "kg",
      user: { id: userId, tenantId },
      notes: parsed.args || "Per Telegram gestartet"
    });
    if (!session) return "KG-Tracker ist nicht aktiv.";
    await logAction({
      actorId: userId,
      action: "tracker_kg_started_telegram",
      entityType: "trackerEntry",
      entityId: session.id,
      title: "KG per Telegram gestartet",
      href: `/trackers/kg/${session.slug || session.id}`
    });
    return [`<b>KG-Tracker gestartet</b>`, htmlLine("Start", formatDateTime(session.startTime)), telegramLink(`${env.appUrl}/trackers/kg/${session.slug || session.id}`, "KG Tracker öffnen")].join("\n");
  }

  if (parsed.command === "/kg_stop") {
    const updated = await stopTrackerEntry({ key: "kg", user: { id: userId, tenantId }, notes: parsed.args });
    if (!updated) return "Kein laufender KG-Tracker gefunden.";
    await logAction({
      actorId: userId,
      action: "tracker_kg_stopped_telegram",
      entityType: "trackerEntry",
      entityId: updated.id,
      title: "KG per Telegram beendet",
      href: `/trackers/kg/${updated.slug || updated.id}`
    });
    return [`<b>KG-Tracker beendet</b>`, htmlLine("Dauer", formatMinutes(updated.durationMinutes)), telegramLink(`${env.appUrl}/trackers/kg/${updated.slug || updated.id}`, "KG Tracker öffnen")].join("\n");
  }

  return `Unbekannter Befehl: ${parsed.command}\n\n${HELP_TEXT}`;
}

async function findActiveTelegramChat(chatId: string, threadId: string | null, hints: { userSettingsId?: string | null; tenantTelegramSettingsId?: string | null } = {}) {
  const include = {
    settings: { include: { user: true, telegramUserMappings: { include: { appUser: true } } } },
    telegramSettings: { include: { telegramUserMappings: { include: { appUser: true } } } }
  } as const;
  return prisma.telegramChat.findFirst({
    where: {
      chatId,
      threadId,
      status: "ACTIVE",
      ...(hints.tenantTelegramSettingsId ? { telegramSettingsId: hints.tenantTelegramSettingsId } : {}),
      ...(hints.userSettingsId ? { settingsId: hints.userSettingsId, telegramSettingsId: null } : {})
    },
    include
  });
}

async function resolveDirectTelegramChat(message: TelegramMessage, hints: { userSettingsId?: string | null; tenantTelegramSettingsId?: string | null } = {}) {
  if (message.chat.type !== "private" || !message.from?.id || !hints.tenantTelegramSettingsId) return null;
  const telegramUserId = String(message.from.id);
  const telegramUsername = String(message.from.username || "").trim().replace(/^@+/, "").toLowerCase();
  const telegramSettings = await prisma.tenantTelegramSettings.findUnique({
    where: { id: hints.tenantTelegramSettingsId },
    include: {
      telegramUserMappings: { include: { appUser: true } },
      tenant: { include: { memberships: { where: { active: true, user: { active: true } }, include: { user: true }, orderBy: [{ role: "asc" }, { createdAt: "asc" }] } } }
    }
  });
  if (!telegramSettings?.telegramBotTokenEnc) return null;
  const mappedByBot = telegramSettings.telegramUserMappings.find((entry) =>
    entry.appUser.active && ((entry.telegramUserId && entry.telegramUserId === telegramUserId) || (telegramUsername && entry.telegramUsername === telegramUsername))
  );
  const mapped = mappedByBot || null;
  const ownerId = mapped?.appUserId || telegramSettings.ownerId || telegramSettings.tenant.memberships.find((entry) => entry.role === "SUPER_ADMIN" || entry.role === "ADMIN")?.userId || telegramSettings.tenant.memberships[0]?.userId;
  if (!ownerId) return null;
  const userSettings = await ensureUserSettings(ownerId);
  const name = [message.from.first_name, message.from.last_name].filter(Boolean).join(" ") || (telegramUsername ? `@${telegramUsername}` : `Telegram ${telegramUserId}`);
  const targetUserId = mapped?.appUserId || (telegramSettings.scope === "USER" ? telegramSettings.ownerId : null);
  const status = targetUserId ? "ACTIVE" : "PENDING";
  const existing = await prisma.telegramChat.findFirst({
    where: { telegramSettingsId: telegramSettings.id, chatId: String(message.chat.id), threadId: null },
    include: {
      settings: { include: { user: true, telegramUserMappings: { include: { appUser: true } } } },
      telegramSettings: { include: { telegramUserMappings: { include: { appUser: true } } } }
    }
  });
  const chat = existing
    ? await prisma.telegramChat.update({
        where: { id: existing.id },
        data: {
          settingsId: userSettings.id,
          chatType: "private",
          title: "Direktchat",
          chatTitle: name,
          threadTitle: null,
          targetUserId,
          status,
          lastMessageText: message.text || message.caption || null,
          lastMessageFrom: name,
          lastMessageAt: new Date()
        },
        include: {
          settings: { include: { user: true, telegramUserMappings: { include: { appUser: true } } } },
          telegramSettings: { include: { telegramUserMappings: { include: { appUser: true } } } }
        }
      })
    : await prisma.telegramChat.create({
        data: {
          settingsId: userSettings.id,
          telegramSettingsId: telegramSettings.id,
          targetUserId,
          chatId: String(message.chat.id),
          threadId: null,
          chatType: "private",
          title: "Direktchat",
          chatTitle: name,
          threadTitle: null,
          status,
          lastMessageText: message.text || message.caption || null,
          lastMessageFrom: name,
          lastMessageAt: new Date()
        },
        include: {
          settings: { include: { user: true, telegramUserMappings: { include: { appUser: true } } } },
          telegramSettings: { include: { telegramUserMappings: { include: { appUser: true } } } }
        }
      });
  await rememberTelegramKnownUserForSettings(userSettings.id, message.from, {
    telegramSettingsId: telegramSettings.id,
    source: "DIRECT_CHAT",
    chatId: String(message.chat.id),
    chatTitle: name
  });
  await prisma.auditLog.create({
    data: {
      actorId: targetUserId || null,
      action: targetUserId ? "telegram_direct_chat_enabled" : "telegram_direct_chat_detected",
      entityType: "telegramChat",
      entityId: chat.id,
      title: targetUserId ? `Telegram-Direktchat aktiviert: ${name}` : `Telegram-Direktchat erkannt: ${name}`,
      href: "/settings/telegram",
      details: {
        chatId: String(message.chat.id),
        chatType: "private",
        targetUserId,
        botId: telegramSettings.id,
        botName: telegramSettings.name,
        ...telegramUserDetails(message.from)
      }
    }
  });
  return chat.status === "ACTIVE" ? chat : null;
}

async function findKnownTelegramChatInGroup(chatId: string, hints: { userSettingsId?: string | null; tenantTelegramSettingsId?: string | null } = {}) {
  return prisma.telegramChat.findFirst({
    where: {
      chatId,
      status: { in: ["ACTIVE", "PENDING"] },
      ...(hints.tenantTelegramSettingsId ? { telegramSettingsId: hints.tenantTelegramSettingsId } : {}),
      ...(hints.userSettingsId ? { settingsId: hints.userSettingsId, telegramSettingsId: null } : {})
    },
    include: { settings: true, telegramSettings: true },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
  });
}

function chatBotTokenEnc(chat: Awaited<ReturnType<typeof findActiveTelegramChat>>) {
  return chat?.telegramSettings?.telegramBotTokenEnc || chat?.settings.telegramBotTokenEnc || "";
}

function chatOpenAiKeyEnc(chat: Awaited<ReturnType<typeof findActiveTelegramChat>>) {
  return chat?.telegramSettings?.openAiApiKeyEnc || chat?.settings.openAiApiKeyEnc || "";
}

function chatTelegramMappings(chat: Awaited<ReturnType<typeof findActiveTelegramChat>>) {
  return chat?.telegramSettings?.telegramUserMappings || chat?.settings.telegramUserMappings || [];
}

function mappedTelegramUserId(
  chat: Awaited<ReturnType<typeof findActiveTelegramChat>>,
  from?: TelegramMessageFrom
) {
  const normalized = String(from?.username || "").trim().replace(/^@+/, "").toLowerCase();
  const telegramUserId = from?.id ? String(from.id) : "";
  if (!chat || (!normalized && !telegramUserId)) return chat?.targetUserId || chat?.settings.userId || "";
  const mapping = chatTelegramMappings(chat).find((entry) =>
    entry.appUser.active && ((telegramUserId && entry.telegramUserId === telegramUserId) || (normalized && entry.telegramUsername === normalized))
  );
  return mapping?.appUserId || chat.targetUserId || chat.settings.userId;
}

function telegramUserDetails(from?: TelegramMessageFrom | TelegramUser) {
  return {
    telegramUserId: from?.id ? String(from.id) : null,
    telegramUsername: from?.username ? from.username.toLowerCase() : null,
    telegramFirstName: from?.first_name || null,
    telegramLastName: from?.last_name || null
  };
}

async function rememberTelegramKnownUser(chat: Awaited<ReturnType<typeof findActiveTelegramChat>>, from?: TelegramMessageFrom) {
  if (!chat || !from?.id) return;
  await rememberKnownTelegramUser({
    settingsId: chat.settingsId,
    telegramSettingsId: chat.telegramSettingsId,
    telegramUserId: String(from.id),
    telegramUsername: from.username || null,
    firstName: from.first_name || null,
    lastName: from.last_name || null,
    membershipStatus: "ACTIVE",
    source: "MESSAGE",
    lastChatId: chat.chatId,
    lastChatTitle: chat.chatTitle || chat.title || null
  });
}

async function rememberTelegramKnownUserForSettings(
  settingsId: string,
  from?: TelegramMessageFrom | TelegramUser,
  options: { source?: string; membershipStatus?: string; chatId?: string | null; chatTitle?: string | null; telegramSettingsId?: string | null } = {}
) {
  if (!from?.id) return;
  const membershipStatus = options.membershipStatus || "ACTIVE";
  const source = options.source || "MESSAGE";
  await rememberKnownTelegramUser({
    settingsId,
    telegramSettingsId: options.telegramSettingsId || null,
    telegramUserId: String(from.id),
    telegramUsername: from.username || null,
    firstName: from.first_name || null,
    lastName: from.last_name || null,
    membershipStatus,
    source,
    lastChatId: options.chatId || null,
    lastChatTitle: options.chatTitle || null
  });
}

function membershipStatusFromTelegram(status?: string) {
  if (status === "left") return "LEFT";
  if (status === "kicked") return "KICKED";
  return "ACTIVE";
}

async function handleChatMemberUpdate(memberUpdate: TelegramChatMemberUpdate, updateType: "chat_member" | "my_chat_member", hints: { userSettingsId?: string | null; tenantTelegramSettingsId?: string | null } = {}) {
  const chatId = String(memberUpdate.chat.id);
  const knownGroupChat = await findKnownTelegramChatInGroup(chatId, hints);
  if (!knownGroupChat) return NextResponse.json({ ok: true, ignored: true });
  const member = memberUpdate.new_chat_member?.user;
  if (!member?.id || member.is_bot) return NextResponse.json({ ok: true });
  const membershipStatus = membershipStatusFromTelegram(memberUpdate.new_chat_member?.status);
  const source = updateType === "chat_member" ? "MEMBER_UPDATE" : "BOT_MEMBER_UPDATE";
  await rememberTelegramKnownUserForSettings(knownGroupChat.settingsId, member, {
    source,
    membershipStatus,
    chatId,
    chatTitle: memberUpdate.chat.title || memberUpdate.chat.username || null,
    telegramSettingsId: knownGroupChat.telegramSettingsId
  });
  const action = membershipStatus === "ACTIVE" ? "telegram_member_detected" : "telegram_member_left";
  await prisma.auditLog.create({
    data: {
      actorId: null,
      action,
      entityType: "telegram",
      title: membershipStatus === "ACTIVE" ? "Telegram-Mitglied erkannt" : "Telegram-Mitglied nicht mehr aktiv",
      details: {
        updateType,
        oldStatus: memberUpdate.old_chat_member?.status || null,
        newStatus: memberUpdate.new_chat_member?.status || null,
        membershipStatus,
        chatId,
        chatTitle: memberUpdate.chat.title || memberUpdate.chat.username || null,
        ...telegramUserDetails(member)
      }
    }
  });
  return NextResponse.json({ ok: true });
}

async function rememberTelegramServiceMembers(message: TelegramMessage, hints: { userSettingsId?: string | null; tenantTelegramSettingsId?: string | null } = {}) {
  const chatId = String(message.chat.id);
  const knownGroupChat = await findKnownTelegramChatInGroup(chatId, hints);
  if (!knownGroupChat) return false;
  const chatTitle = message.chat.title || message.chat.username || null;
  const addedMembers = message.new_chat_members?.filter((member) => member.id && !member.is_bot) || [];
  const leftMember = message.left_chat_member && message.left_chat_member.id && !message.left_chat_member.is_bot ? message.left_chat_member : null;
  for (const member of addedMembers) {
    await rememberTelegramKnownUserForSettings(knownGroupChat.settingsId, member, {
      source: "MEMBER_SERVICE_MESSAGE",
      membershipStatus: "ACTIVE",
      chatId,
      chatTitle,
      telegramSettingsId: knownGroupChat.telegramSettingsId
    });
    await prisma.auditLog.create({
      data: {
        actorId: null,
        action: "telegram_member_detected",
        entityType: "telegram",
        title: "Telegram-Mitglied erkannt",
        details: {
          updateType: "new_chat_members",
          membershipStatus: "ACTIVE",
          chatId,
          chatTitle,
          addedBy: telegramUserDetails(message.from),
          ...telegramUserDetails(member)
        }
      }
    });
  }
  if (leftMember) {
    await rememberTelegramKnownUserForSettings(knownGroupChat.settingsId, leftMember, {
      source: "MEMBER_SERVICE_MESSAGE",
      membershipStatus: "LEFT",
      chatId,
      chatTitle,
      telegramSettingsId: knownGroupChat.telegramSettingsId
    });
    await prisma.auditLog.create({
      data: {
        actorId: null,
        action: "telegram_member_left",
        entityType: "telegram",
        title: "Telegram-Mitglied nicht mehr aktiv",
        details: {
          updateType: "left_chat_member",
          membershipStatus: "LEFT",
          chatId,
          chatTitle,
          removedBy: telegramUserDetails(message.from),
          ...telegramUserDetails(leftMember)
        }
      }
    });
  }
  return addedMembers.length > 0 || Boolean(leftMember);
}

export async function POST(request: Request) {
  const webhookUrl = new URL(request.url);
  const hints = {
    userSettingsId: webhookUrl.searchParams.get("userSettingsId"),
    tenantTelegramSettingsId: webhookUrl.searchParams.get("tenantTelegramSettingsId")
  };
  const update = (await request.json()) as TelegramUpdate;
  if (update.chat_member) return handleChatMemberUpdate(update.chat_member, "chat_member", hints);
  if (update.my_chat_member) return handleChatMemberUpdate(update.my_chat_member, "my_chat_member", hints);
  const message = update.message || update.channel_post;
  if (!message) return NextResponse.json({ ok: true });
  if (message.new_chat_members?.length || message.left_chat_member) {
    const handled = await rememberTelegramServiceMembers(message, hints);
    if (handled) return NextResponse.json({ ok: true });
  }
  const chatId = String(message.chat.id);
  const threadId = message.message_thread_id ? String(message.message_thread_id) : null;
  const chat = await findActiveTelegramChat(chatId, threadId, hints) || await resolveDirectTelegramChat(message, hints);
  const tokenEnc = chatBotTokenEnc(chat);
  if (!chat || !tokenEnc) {
    if (message.chat.type === "private" && hints.tenantTelegramSettingsId) {
      const telegramSettings = await prisma.tenantTelegramSettings.findUnique({
        where: { id: hints.tenantTelegramSettingsId },
        select: { telegramBotTokenEnc: true }
      });
      if (telegramSettings?.telegramBotTokenEnc) {
        await sendTelegramMessage(
          telegramSettings.telegramBotTokenEnc,
          chatId,
          null,
          "<b>Direktchat erkannt</b>\nBitte ordne diesen Telegram-Benutzer in der App unter Telegram einem Benutzer zu. Danach kann ich hier direkt antworten.",
          { parseMode: "HTML", disableWebPagePreview: true }
        );
      }
    }
    const knownGroupChat = await findKnownTelegramChatInGroup(chatId, hints);
    if (knownGroupChat) {
      await rememberTelegramKnownUserForSettings(knownGroupChat.settingsId, message.from, { telegramSettingsId: knownGroupChat.telegramSettingsId });
      await prisma.auditLog.create({
        data: {
          actorId: null,
          action: "telegram_message_ignored",
          entityType: "telegram",
          title: "Telegram-Nachricht ignoriert",
          details: {
            reason: "thread_not_active",
            chatId,
            threadId,
            chatTitle: message.chat.title || message.chat.username || null,
            text: (message.text || message.caption || "").slice(0, 300),
            ...telegramUserDetails(message.from)
          }
        }
      });
    }
    return NextResponse.json({ ok: true, ignored: true });
  }
  await rememberTelegramKnownUser(chat, message.from);
  const actorUserId = mappedTelegramUserId(chat, message.from);

  const photo = largestTelegramPhoto(message);
  const imageDocument = message.document?.mime_type?.startsWith("image/") ? message.document : null;
  const imageFileId = photo?.file_id || imageDocument?.file_id;
  if (imageFileId) {
    const downloaded = await downloadTelegramFile(
      tokenEnc,
      imageFileId,
      imageDocument?.file_name || `telegram-bild-${message.message_id}.jpg`,
      imageDocument?.mime_type || "image/jpeg"
    );
    const asset = await saveFileBuffer({
      ownerId: actorUserId,
      bytes: downloaded.bytes,
      originalName: downloaded.originalName,
      mimeType: downloaded.mimeType,
      tenantId: await tenantIdForUser(actorUserId)
    });
    if (!asset) return NextResponse.json({ ok: true });
    const imageUrl = fileAssetUrl(asset.id);
    const caption = message.caption?.trim();
    const transparencyHint = photo && asset.mimeType === "image/jpeg"
      ? "\n\n<b>Hinweis:</b> Telegram hat dieses Bild als Foto in JPEG umgewandelt. Für PNG mit Transparenz bitte in Telegram als Datei/Dokument senden."
      : "";
    await prisma.message.create({ data: { senderId: actorUserId, body: `Telegram: [Bild]${caption ? ` ${caption}` : ""}`, mediaUrl: imageUrl } });
    await logAction({
      actorId: actorUserId,
      action: "telegram_image_received",
      entityType: "telegram",
      title: "Telegram-Bild empfangen",
      details: {
        caption: caption || null,
        chatTitle: chat.chatTitle || chat.title || null,
        threadTitle: chat.threadTitle || null,
        chatId,
        threadId,
        ...telegramUserDetails(message.from)
      },
      href: imageUrl
    });

    const itemDialogueAnswer = await handleItemCreationImage(actorUserId, imageUrl, caption);
    const actorTenantId = await tenantIdForUser(actorUserId);
    const answer: string =
      itemDialogueAnswer ??
      (await prisma.media
        .create({
          data: {
            tenantId: actorTenantId,
            ownerId: actorUserId,
            albumId: (await ensureDefaultAlbum(actorUserId, actorTenantId)).id,
            title: caption || `Telegram Bild ${formatDateTime(new Date())}`,
            kind: "IMAGE",
            url: imageUrl,
            visibility: null
          }
        })
        .then(async (media) => {
          const defaultAlbum = await ensureDefaultAlbum(actorUserId, actorTenantId);
          const albums = await prisma.album.findMany({ where: { ...(actorTenantId ? { tenantId: actorTenantId } : {}), ownerId: actorUserId }, orderBy: { title: "asc" } });
          await logAction({
            actorId: actorUserId,
            action: "media_created_telegram",
            entityType: "media",
            entityId: media.id,
            title: `Bild aus Telegram gespeichert: ${media.title}`,
            href: "/media"
          });
          const albumLines = albums.map((album, index) => `/media_album_${index + 1}_${media.id} - ${telegramHtml(album.title)}`);
          return [
            "<b>Bild gespeichert</b>",
            telegramHtml(media.title),
            htmlLine("Album", albums.find((album) => album.id === media.albumId)?.title || defaultAlbum.title),
            "",
            "<b>In anderes Album verschieben</b>",
            ...albumLines,
            "",
            `Wenn du nichts anklickst, bleibt das Bild in ${telegramHtml(defaultAlbum.title)}.`,
            transparencyHint
          ].join("\n");
        }));

    const finalAnswer = `${answer}${itemDialogueAnswer ? transparencyHint : ""}`;
    await sendTelegramMessage(tokenEnc, chatId, threadId, finalAnswer, { parseMode: "HTML", disableWebPagePreview: true });
    await prisma.message.create({ data: { senderId: actorUserId, body: `Telegram-Agent: ${finalAnswer}` } });
    await logAction({
      actorId: actorUserId,
      action: "telegram_answer_sent",
      entityType: "telegram",
      title: "Telegram-Antwort gesendet",
      details: {
        answer: finalAnswer.slice(0, 1000),
        chatId,
        threadId,
        chatTitle: chat.chatTitle || chat.title || null,
        threadTitle: chat.threadTitle || null,
        outputChatId: chat.id
      }
    });
    await prisma.telegramChat.update({ where: { id: chat.id }, data: { lastMessageAt: new Date() } });
    return NextResponse.json({ ok: true });
  }

  let body = message.text || message.caption || "";
  if (!body && message.voice?.file_id) {
    body = await transcribeTelegramVoice(tokenEnc, chatOpenAiKeyEnc(chat), message.voice.file_id);
  }
  if (body) {
    await prisma.message.create({ data: { senderId: actorUserId, body: `Telegram: ${body}` } });
    await logAction({
      actorId: actorUserId,
      action: "telegram_message_received",
      entityType: "telegram",
      title: "Telegram-Nachricht empfangen",
      details: {
        text: body.slice(0, 500),
        chatTitle: chat.chatTitle || chat.title || null,
        threadTitle: chat.threadTitle || null,
        chatId,
        threadId,
        ...telegramUserDetails(message.from)
      }
    });
    const imageReplacementAnswer = commandOf(body) ? null : await handleImageReplacementDialogue(actorUserId, body);
    const itemDialogueAnswer = commandOf(body) || imageReplacementAnswer ? null : await handleItemCreationDialogue(actorUserId, body);
    const answer = commandOf(body)
      ? await handleCommand(actorUserId, body, chatId, threadId)
      : imageReplacementAnswer ||
        itemDialogueAnswer ||
        (await answerWithPortalAgent({
          userId: actorUserId,
          text: body,
          chatId,
          threadId,
          openAiKeyEnc: chatOpenAiKeyEnc(chat)
        }));
    await sendTelegramMessage(tokenEnc, chatId, threadId, answer, { parseMode: "HTML", disableWebPagePreview: true });
    await prisma.message.create({ data: { senderId: actorUserId, body: `Telegram-Agent: ${answer}` } });
    await logAction({
      actorId: actorUserId,
      action: "telegram_answer_sent",
      entityType: "telegram",
      title: "Telegram-Antwort gesendet",
      details: {
        answer: answer.slice(0, 1000),
        chatId,
        threadId,
        chatTitle: chat.chatTitle || chat.title || null,
        threadTitle: chat.threadTitle || null,
        outputChatId: chat.id
      }
    });
  }
  await prisma.telegramChat.update({ where: { id: chat.id }, data: { lastMessageAt: new Date() } });
  return NextResponse.json({ ok: true });
}
