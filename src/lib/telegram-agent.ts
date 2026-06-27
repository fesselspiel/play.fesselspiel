import OpenAI from "openai";
import { agentCapabilityPrompt, agentTools, directAgentToolNames } from "@/lib/capabilities";
import { env } from "@/lib/env";
import { getOrCreateCatalogCategory } from "@/lib/catalog-categories";
import { decryptSecret } from "@/lib/crypto";
import { formatDateTime, formatMinutes } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { uniqueSlug, uniqueSlugForUpdate } from "@/lib/slug";
import { telegramHtml, telegramLink } from "@/lib/telegram";
import { queueImageReplacement } from "@/lib/telegram-item-dialogue";
import { startTrackerEntry, stopTrackerEntry } from "@/lib/tracker-core";
import { quotaSummaryText, trackerQuotaStatusForUser } from "@/lib/tracker-quotas";

type PortalAgentInput = {
  userId: string;
  text: string;
  chatId: string;
  threadId: string | null;
  openAiKeyEnc?: string | null;
};

type ToolCallResult = {
  ok: boolean;
  message: string;
  data?: unknown;
};

type DialogueMessage = { role: "user" | "assistant"; content: string };

const AGENT_MODEL = process.env.OPENAI_AGENT_MODEL || "gpt-4o-mini";

async function tenantIdForUser(userId: string) {
  const membership = await prisma.tenantMembership.findFirst({ where: { userId, active: true }, orderBy: { createdAt: "asc" }, select: { tenantId: true } });
  if (membership?.tenantId) return membership.tenantId;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tenantId: true } });
  return user?.tenantId || undefined;
}

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = agentTools;

function clean(value?: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseJsonArguments(raw: string | null | undefined) {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function contains(value: string) {
  return { contains: value, mode: "insensitive" as const };
}

async function matchingToys(userId: string, titles: unknown) {
  const tenantId = await tenantIdForUser(userId);
  const values = Array.isArray(titles) ? titles.map(clean).filter(Boolean) : [];
  if (!values.length) return [];
  return prisma.toy.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      ownerId: userId,
      OR: values.flatMap((title) => [{ title: contains(title) }, { slug: contains(title) }])
    },
    take: 20
  });
}

async function matchingPositions(userId: string, names: unknown) {
  const tenantId = await tenantIdForUser(userId);
  const values = Array.isArray(names) ? names.map(clean).filter(Boolean) : [];
  if (!values.length) return [];
  return prisma.position.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      ownerId: userId,
      OR: values.flatMap((name) => [{ name: contains(name) }, { slug: contains(name) }])
    },
    take: 20
  });
}

function link(path: string) {
  return `${env.appUrl}${path}`;
}

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

function trackerQuotaHtml(status: TrackerQuotaStatus, period = "all") {
  const rows = [
    period === "all" || period === "daily" ? quotaProgressLine("Heute", status.daily, "minutes") : "",
    period === "all" || period === "weekly" ? quotaProgressLine(status.weeklyMode === "rolling" ? "Letzte 7 Tage" : "Diese Woche", status.weekly, "minutes") : "",
    period === "all" || period === "monthly" ? quotaProgressLine("Dieser Monat Zeit", status.monthlyMinutes, "minutes") : "",
    period === "all" || period === "monthly" ? quotaProgressLine("Dieser Monat Tage", status.monthlyDays, "days") : ""
  ].filter(Boolean);
  return [
    `<b>${telegramHtml(status.tracker.title)}</b>`,
    rows.length ? rows.join("\n\n") : "Kein Kontingent konfiguriert.",
    telegramLink(link(`/sessions?tracker=${status.tracker.key}`), "Tracker öffnen")
  ].join("\n");
}

function formatTrackerQuotasHtml(quotas: TrackerQuotaStatus[], period = "all") {
  const filtered = quotas.filter((entry) => entry.hasQuota);
  if (!filtered.length) return "<b>Tracker-Kontingente</b>\nKeine Kontingente konfiguriert.";
  return [`<b>Tracker-Kontingente</b>`, ...filtered.map((entry) => trackerQuotaHtml(entry, period))].join("\n\n");
}

function formatFavoritesHtml(data: Record<string, unknown>) {
  const targetName = String(data.targetName || "Benutzer");
  const toys = Array.isArray(data.toys) ? (data.toys as Record<string, unknown>[]) : [];
  const positions = Array.isArray(data.positions) ? (data.positions as Record<string, unknown>[]) : [];
  const sections = [`<b>Favoriten von ${telegramHtml(targetName)}</b>`];
  if (toys.length) {
    sections.push(htmlList("Spielzeuge", toys.map((toy, index) => `<b>${index + 1}. ${telegramHtml(toy.title || "Ohne Titel")}</b>\n${telegramLink(String(toy.url || ""), "öffnen")}`)));
  }
  if (positions.length) {
    sections.push(htmlList("Szenen", positions.map((position, index) => `<b>${index + 1}. ${telegramHtml(position.name || "Ohne Name")}</b>\n${telegramLink(String(position.url || ""), "öffnen")}`)));
  }
  if (!toys.length && !positions.length) sections.push("Keine Favoriten gefunden.");
  return sections.join("\n\n");
}

function formatToolResultHtml(result: ToolCallResult) {
  if (!result.ok) return telegramHtml(result.message);
  const data = result.data as Record<string, unknown> | undefined;
  if (!data) return telegramHtml(result.message);

  if ("toys" in data && "positions" in data && "plannedActivities" in data && "sessionsThisYear" in data) {
    return [
      "<b>Portalstatus</b>",
      htmlLine("Spielzeuge", data.toys),
      htmlLine("Szenen", data.positions),
      htmlLine("Geplante Aktivitäten", data.plannedActivities),
      htmlLine("Sessions dieses Jahr", data.sessionsThisYear),
      htmlLine("Gesamtdauer", data.totalSessionDuration),
      htmlLine("Offene Session", data.openSession || "nein")
    ].join("\n");
  }

  if ("quotas" in data && Array.isArray(data.quotas)) {
    return formatTrackerQuotasHtml(data.quotas as TrackerQuotaStatus[], String(data.period || "all"));
  }

  if ("favorites" in data) {
    return formatFavoritesHtml(data);
  }

  const sections: string[] = [];
  const toys = Array.isArray(data.toys) ? (data.toys as Record<string, unknown>[]) : [];
  const positions = Array.isArray(data.positions) ? (data.positions as Record<string, unknown>[]) : [];
  const activities = Array.isArray(data.activities) ? (data.activities as Record<string, unknown>[]) : [];
  const sessions = Array.isArray(data.sessions) ? (data.sessions as Record<string, unknown>[]) : [];

  if (toys.length) {
    sections.push(
      htmlList(
        "Spielzeuge",
        toys.map((toy, index) => {
          const title = String(toy.title || "Ohne Titel");
          const description = toy.description ? `\n${telegramHtml(toy.description)}` : "";
          return `<b>${index + 1}. ${telegramHtml(title)}</b>${description}\n${telegramLink(String(toy.url || ""), "öffnen")}`;
        })
      )
    );
  }
  if (positions.length) {
    sections.push(
      htmlList(
        "Szenen",
        positions.map((position, index) => {
          const name = String(position.name || "Ohne Name");
          const description = position.description ? `\n${telegramHtml(position.description)}` : "";
          return `<b>${index + 1}. ${telegramHtml(name)}</b>${description}\n${telegramLink(String(position.url || ""), "öffnen")}`;
        })
      )
    );
  }
  if (activities.length) {
    sections.push(
      htmlList(
        "Aktivitäten",
        activities.map((activity, index) => {
          const tools = Array.isArray(activity.toys) ? activity.toys.join(", ") : "";
          const linkedPositions = Array.isArray(activity.positions) ? activity.positions.join(", ") : "";
          return [
            `<b>${index + 1}. ${telegramHtml(activity.title || "Ohne Titel")}</b>`,
            htmlLine("Status", activity.status),
            htmlLine("Termin", activity.plannedAt),
            tools ? htmlLine("Spielzeuge", tools) : "",
            linkedPositions ? htmlLine("Szenen", linkedPositions) : "",
            telegramLink(String(activity.url || ""), "öffnen")
          ]
            .filter(Boolean)
            .join("\n");
        })
      )
    );
  }
  if (sessions.length) {
    sections.push(
      htmlList(
        "Sessions",
        sessions.map((session, index) =>
          [
            `<b>${index + 1}. ${telegramHtml(session.start || "Ohne Startzeit")}</b>`,
            htmlLine("Ende", session.end),
            htmlLine("Dauer", session.duration),
            session.notes ? htmlLine("Notiz", session.notes) : ""
          ]
            .filter(Boolean)
            .join("\n")
        )
      )
    );
  }

  return sections.length ? sections.join("\n\n") : telegramHtml(result.message);
}

async function getPortalStatus(userId: string): Promise<ToolCallResult> {
  const tenantId = await tenantIdForUser(userId);
  const tenantScope = tenantId ? { tenantId } : {};
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const [toys, positions, plannedActivities, sessions, openSession] = await Promise.all([
    prisma.toy.count({ where: { ...tenantScope, ownerId: userId } }),
    prisma.position.count({ where: { ...tenantScope, ownerId: userId } }),
    prisma.activityPlan.count({ where: { ...tenantScope, ownerId: userId, category: { notIn: ["IDEA_COLLECTION", "SELF_BONDAGE_ORDER"] }, status: { in: ["REQUESTED", "PLANNED"] } } }),
    prisma.trackerEntry.findMany({ where: { ...tenantScope, ownerId: userId, trackerType: { key: "segufix" }, startTime: { gte: yearStart } } }),
    prisma.trackerEntry.findFirst({ where: { ...tenantScope, ownerId: userId, trackerType: { key: "segufix" }, endTime: null, allDay: false }, orderBy: { startTime: "desc" } })
  ]);
  const total = sessions.reduce((sum, session) => sum + (session.durationMinutes || 0), 0);
  return {
    ok: true,
    message: "Portalstatus geladen.",
    data: {
      toys,
      positions,
      plannedActivities,
      sessionsThisYear: sessions.length,
      totalSessionDuration: formatMinutes(total),
      openSession: openSession ? formatDateTime(openSession.startTime) : null
    }
  };
}

async function getTrackerQuotas(userId: string, args: Record<string, unknown>): Promise<ToolCallResult> {
  const tenantId = await tenantIdForUser(userId);
  const query = clean(args.trackerKeyOrTitle).toLowerCase();
  const period = clean(args.period) || "all";
  const quotas = (await trackerQuotaStatusForUser({ id: userId, tenantId }))
    .filter((entry) => entry.hasQuota)
    .filter((entry) => !query || entry.tracker.key.toLowerCase().includes(query) || entry.tracker.title.toLowerCase().includes(query));
  return {
    ok: true,
    message: quotas.length ? "Tracker-Kontingente geladen." : "Für diesen Tracker ist kein Kontingent konfiguriert.",
    data: { quotas, period }
  };
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

async function getFavorites(userId: string, args: Record<string, unknown>): Promise<ToolCallResult> {
  const tenantId = await tenantIdForUser(userId);
  const area = clean(args.area) || "all";
  const target = await favoriteTargetUser(userId, clean(args.targetName), tenantId);
  if (!target) return { ok: false, message: "Benutzer nicht gefunden." };
  const tenantScope = tenantId ? { tenantId } : {};
  const [toys, positions] = await Promise.all([
    area === "all" || area === "toys"
      ? prisma.toyFavorite.findMany({
          where: { userId: target.id, toy: tenantScope },
          include: { toy: true },
          orderBy: { createdAt: "desc" },
          take: 12
        })
      : Promise.resolve([]),
    area === "all" || area === "positions"
      ? prisma.positionFavorite.findMany({
          where: { userId: target.id, position: tenantScope },
          include: { position: true },
          orderBy: { createdAt: "desc" },
          take: 12
        })
      : Promise.resolve([])
  ]);
  return {
    ok: true,
    message: "Favoriten geladen.",
    data: {
      favorites: true,
      targetName: userDisplayName(target),
      toys: toys.map((entry) => ({ title: entry.toy.title, url: link(`/toys/${entry.toy.slug}`) })),
      positions: positions.map((entry) => ({ name: entry.position.name, url: link(`/positions/${entry.position.slug}`) }))
    }
  };
}

async function searchPortal(userId: string, args: Record<string, unknown>): Promise<ToolCallResult> {
  const tenantId = await tenantIdForUser(userId);
  const tenantScope = tenantId ? { tenantId } : {};
  const query = clean(args.query);
  const area = clean(args.area) || "all";
  const whereText = query ? [{ title: contains(query) }, { slug: contains(query) }, { description: contains(query) }] : undefined;
  const whereName = query ? [{ name: contains(query) }, { slug: contains(query) }, { description: contains(query) }] : undefined;
  const result: Record<string, unknown> = {};

  if (area === "all" || area === "toys") {
    const toys = await prisma.toy.findMany({
      where: { ...tenantScope, ownerId: userId, ...(whereText ? { OR: whereText } : {}) },
      include: { category: true },
      orderBy: { updatedAt: "desc" },
      take: 8
    });
    result.toys = toys.map((toy) => ({ title: toy.title, url: link(`/toys/${toy.slug}`), category: toy.category?.name || "Allgemein", description: toy.description }));
  }
  if (area === "all" || area === "positions") {
    const positions = await prisma.position.findMany({
      where: { ...tenantScope, ownerId: userId, ...(whereName ? { OR: whereName } : {}) },
      include: { category: true },
      orderBy: { updatedAt: "desc" },
      take: 8
    });
    result.positions = positions.map((position) => ({ name: position.name, url: link(`/positions/${position.slug}`), category: position.category?.name || "Allgemein", description: position.description }));
  }
  if (area === "all" || area === "activities") {
    const activities = await prisma.activityPlan.findMany({
      where: { ...tenantScope, ownerId: userId, ...(whereText ? { OR: whereText } : {}) },
      include: { tools: true, positions: true },
      orderBy: { updatedAt: "desc" },
      take: 8
    });
    result.activities = activities.map((activity) => ({
      title: activity.title,
      status: activity.status,
      plannedAt: formatDateTime(activity.plannedAt),
      url: link(`/activities/${activity.slug}`),
      toys: activity.tools.map((toy) => toy.title),
      positions: activity.positions.map((position) => position.name)
    }));
  }
  if (area === "all" || area === "sessions") {
    const sessions = await prisma.trackerEntry.findMany({
      where: { ...tenantScope, ownerId: userId, trackerType: { key: "segufix" }, ...(query ? { notes: contains(query) } : {}) },
      orderBy: { startTime: "desc" },
      take: 8
    });
    result.sessions = sessions.map((session) => ({
      start: formatDateTime(session.startTime),
      end: formatDateTime(session.endTime),
      duration: formatMinutes(session.durationMinutes),
      notes: session.notes
    }));
  }
  return { ok: true, message: "Suche abgeschlossen.", data: result };
}

async function createToy(userId: string, args: Record<string, unknown>): Promise<ToolCallResult> {
  const tenantId = await tenantIdForUser(userId);
  const title = clean(args.title);
  if (!title) return { ok: false, message: "Titel fehlt." };
  if (!clean(args.description)) return { ok: false, message: "Beschreibung fehlt. Frage danach, bevor du das Spielzeug anlegst." };
  if (args.imageUrl === undefined) return { ok: false, message: "Bild-URL fehlt. Frage danach, bevor du das Spielzeug anlegst." };
  const slug = await uniqueSlug("toy", clean(args.slug) || title, tenantId);
  const category = await getOrCreateCatalogCategory("toy", tenantId, clean(args.category));
  const toy = await prisma.toy.create({
    data: {
      ownerId: userId,
      tenantId,
      categoryId: category.id,
      title,
      slug,
      description: clean(args.description),
      imageUrl: clean(args.imageUrl)
    }
  });
  return { ok: true, message: `Spielzeug angelegt: ${toy.title}`, data: { title: toy.title, url: link(`/toys/${toy.slug}`) } };
}

async function updateToy(userId: string, args: Record<string, unknown>): Promise<ToolCallResult> {
  const tenantId = await tenantIdForUser(userId);
  const titleOrSlug = clean(args.titleOrSlug);
  if (!titleOrSlug) return { ok: false, message: "Welches Spielzeug soll geändert werden?" };
  const toy = await prisma.toy.findFirst({
    where: {
      ...(tenantId ? { tenantId } : {}),
      ownerId: userId,
      OR: [{ slug: titleOrSlug }, { title: contains(titleOrSlug) }]
    },
    orderBy: { updatedAt: "desc" }
  });
  if (!toy) return { ok: false, message: "Spielzeug nicht gefunden." };
  const nextTitle = clean(args.title);
  const nextDescription = clean(args.description);
  const nextImageUrl = clean(args.imageUrl);
  const wantsImageReplacement = /bild|foto|image/i.test(`${clean(args.intent)} ${clean(args.change)} ${clean(args.description)}`) || (args.imageUrl === undefined && !nextTitle && !nextDescription);
  if (!nextTitle && !nextDescription && args.imageUrl === undefined) {
    if (wantsImageReplacement) {
      return {
        ok: true,
        message: await queueImageReplacement(userId, "toy", toy.id, toy.title, toy.slug),
        data: { pendingAction: "update_image", entityType: "toy", title: toy.title, url: link(`/toys/${toy.slug}`) }
      };
    }
    return { ok: false, message: "Es fehlt die Änderung. Gib Titel, Beschreibung oder Bild an." };
  }
  const updated = await prisma.toy.update({
    where: { id: toy.id },
    data: {
      ...(nextTitle ? { title: nextTitle, slug: await uniqueSlugForUpdate("toy", nextTitle, toy.id, tenantId) } : {}),
      ...(nextDescription ? { description: nextDescription } : {}),
      ...(args.imageUrl !== undefined ? { imageUrl: nextImageUrl } : {})
    }
  });
  return { ok: true, message: `Spielzeug geändert: ${updated.title}`, data: { title: updated.title, url: link(`/toys/${updated.slug}`), imageUrl: updated.imageUrl } };
}

async function createPosition(userId: string, args: Record<string, unknown>): Promise<ToolCallResult> {
  const tenantId = await tenantIdForUser(userId);
  const name = clean(args.name);
  if (!name) return { ok: false, message: "Name fehlt." };
  if (!clean(args.description)) return { ok: false, message: "Beschreibung fehlt. Frage danach, bevor du die Szene anlegst." };
  if (args.imageUrl === undefined) return { ok: false, message: "Bild-URL fehlt. Frage danach, bevor du die Szene anlegst." };
  const slug = await uniqueSlug("position", name, tenantId);
  const toys = await matchingToys(userId, args.toyTitles);
  const category = await getOrCreateCatalogCategory("position", tenantId, clean(args.category));
  const position = await prisma.position.create({
    data: {
      ownerId: userId,
      tenantId,
      categoryId: category.id,
      name,
      slug,
      description: clean(args.description),
      imageUrl: clean(args.imageUrl),
      tools: { connect: toys.map((toy) => ({ id: toy.id })) }
    },
    include: { tools: true }
  });
  return {
    ok: true,
    message: `Szene angelegt: ${position.name}`,
    data: { name: position.name, url: link(`/positions/${position.slug}`), toys: position.tools.map((toy) => toy.title) }
  };
}

async function createActivity(userId: string, args: Record<string, unknown>): Promise<ToolCallResult> {
  const tenantId = await tenantIdForUser(userId);
  const title = clean(args.title);
  if (!title) return { ok: false, message: "Aktivität fehlt." };
  const plannedAtRaw = clean(args.plannedAt);
  const plannedAt = plannedAtRaw ? new Date(plannedAtRaw) : null;
  if (plannedAtRaw && Number.isNaN(plannedAt?.getTime())) return { ok: false, message: "Datum/Uhrzeit konnte nicht gelesen werden." };
  const [toys, positions] = await Promise.all([matchingToys(userId, args.toyTitles), matchingPositions(userId, args.positionNames)]);
  const slug = await uniqueSlug("activityPlan", title, tenantId);
  const activity = await prisma.activityPlan.create({
    data: {
      ownerId: userId,
      tenantId,
      title,
      slug,
      category: clean(args.category),
      note: clean(args.note),
      plannedAt,
      status: clean(args.status) === "REQUESTED" ? "REQUESTED" : "PLANNED",
      tools: { connect: toys.map((toy) => ({ id: toy.id })) },
      positions: { connect: positions.map((position) => ({ id: position.id })) }
    },
    include: { tools: true, positions: true }
  });
  return {
    ok: true,
    message: `Aktivität geplant: ${activity.title}`,
    data: {
      title: activity.title,
      plannedAt: formatDateTime(activity.plannedAt),
      url: link(`/activities/${activity.slug}`),
      toys: activity.tools.map((toy) => toy.title),
      positions: activity.positions.map((position) => position.name)
    }
  };
}

async function setActivityStatus(userId: string, args: Record<string, unknown>): Promise<ToolCallResult> {
  const tenantId = await tenantIdForUser(userId);
  const titleOrSlug = clean(args.titleOrSlug);
  const status = clean(args.status) as "REQUESTED" | "PLANNED" | "DONE" | "DISCARDED";
  if (!titleOrSlug || !["REQUESTED", "PLANNED", "DONE", "DISCARDED"].includes(status)) return { ok: false, message: "Aktivität oder Status fehlt." };
  const activity = await prisma.activityPlan.findFirst({
    where: { ...(tenantId ? { tenantId } : {}), ownerId: userId, OR: [{ slug: titleOrSlug }, { title: contains(titleOrSlug) }] },
    orderBy: { updatedAt: "desc" }
  });
  if (!activity) return { ok: false, message: "Aktivität nicht gefunden." };
  const updated = await prisma.activityPlan.update({ where: { id: activity.id }, data: { status } });
  return { ok: true, message: `Aktivität aktualisiert: ${updated.title}`, data: { status: updated.status, url: link(`/activities/${updated.slug}`) } };
}

async function startSession(userId: string, args: Record<string, unknown>): Promise<ToolCallResult> {
  const tenantId = await tenantIdForUser(userId);
  const open = await prisma.trackerEntry.findFirst({ where: { ...(tenantId ? { tenantId } : {}), ownerId: userId, trackerType: { key: "segufix" }, endTime: null, allDay: false }, orderBy: { startTime: "desc" } });
  if (open) return { ok: false, message: `Es läuft bereits eine Session seit ${formatDateTime(open.startTime)}.` };
  const moodBefore = clean(args.moodBefore) || undefined;
  const session = await startTrackerEntry({
    key: "segufix",
    user: { id: userId, tenantId },
    notes: clean(args.note) || "Per Telegram-Agent gestartet",
    fieldValues: { moodBefore }
  });
  if (!session) return { ok: false, message: "Segufix-Tracker ist nicht aktiv." };
  return { ok: true, message: `Session gestartet: ${formatDateTime(session.startTime)}`, data: { url: link(`/trackers/segufix/${session.slug || session.id}`) } };
}

async function stopSession(userId: string, args: Record<string, unknown>): Promise<ToolCallResult> {
  const tenantId = await tenantIdForUser(userId);
  const moodAfter = clean(args.moodAfter) || undefined;
  const updated = await stopTrackerEntry({
    key: "segufix",
    user: { id: userId, tenantId },
    notes: [clean(args.note), moodAfter ? `Stimmung nachher: ${moodAfter}` : ""].filter(Boolean).join("\n")
  });
  if (!updated) return { ok: false, message: "Keine laufende Session gefunden." };
  return { ok: true, message: `Session beendet: ${formatMinutes(updated.durationMinutes)}` };
}

async function startKgTracker(userId: string, args: Record<string, unknown>): Promise<ToolCallResult> {
  const tenantId = await tenantIdForUser(userId);
  const session = await startTrackerEntry({
    key: "kg",
    user: { id: userId, tenantId },
    notes: clean(args.note) || "Per Telegram-Agent gestartet"
  });
  if (!session) return { ok: false, message: "KG-Tracker ist nicht aktiv." };
  return { ok: true, message: `KG-Tracker gestartet: ${formatDateTime(session.startTime)}`, data: { url: link(`/trackers/kg/${session.slug || session.id}`) } };
}

async function stopKgTracker(userId: string, args: Record<string, unknown>): Promise<ToolCallResult> {
  const tenantId = await tenantIdForUser(userId);
  const updated = await stopTrackerEntry({ key: "kg", user: { id: userId, tenantId }, notes: clean(args.note) });
  if (!updated) return { ok: false, message: "Kein laufender KG-Tracker gefunden." };
  return { ok: true, message: `KG-Tracker beendet: ${formatMinutes(updated.durationMinutes)}`, data: { url: link(`/trackers/kg/${updated.slug || updated.id}`) } };
}

async function runTool(userId: string, name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
  if (name === "get_portal_status") return getPortalStatus(userId);
  if (name === "search_portal") return searchPortal(userId, args);
  if (name === "get_tracker_quotas") return getTrackerQuotas(userId, args);
  if (name === "get_favorites") return getFavorites(userId, args);
  if (name === "create_toy") return createToy(userId, args);
  if (name === "update_toy") return updateToy(userId, args);
  if (name === "create_position") return createPosition(userId, args);
  if (name === "create_activity") return createActivity(userId, args);
  if (name === "set_activity_status") return setActivityStatus(userId, args);
  if (name === "start_session") return startSession(userId, args);
  if (name === "stop_session") return stopSession(userId, args);
  if (name === "start_kg_tracker") return startKgTracker(userId, args);
  if (name === "stop_kg_tracker") return stopKgTracker(userId, args);
  return { ok: false, message: `Unbekanntes Tool: ${name}` };
}

function telegramDialogueRole(body: string) {
  if (body.startsWith("Telegram-Agent:")) return "assistant" as const;
  if (body.startsWith("Telegram:")) return "user" as const;
  return null;
}

function telegramDialogueContent(body: string) {
  return body.replace(/^Telegram-Agent:\s*/, "").replace(/^Telegram:\s*/, "").trim();
}

function isMemoryOnlyRequest(text: string) {
  return /^(merk dir|merke dir|notiere dir|behalte im kopf|speichere als kontext)\b/i.test(text.trim());
}

async function recentTelegramDialogue(userId: string, currentText: string) {
  const messages = await prisma.message.findMany({
    where: {
      senderId: userId,
      OR: [{ body: { startsWith: "Telegram:" } }, { body: { startsWith: "Telegram-Agent:" } }]
    },
    orderBy: { createdAt: "desc" },
    take: 10
  });
  const dialogue = messages
    .reverse()
    .map((message) => {
      const role = telegramDialogueRole(message.body);
      const content = telegramDialogueContent(message.body);
      return role && content ? { role, content } : null;
    })
    .filter((message): message is DialogueMessage => Boolean(message));
  const last = dialogue[dialogue.length - 1];
  if (!last || last.role !== "user" || last.content !== currentText) {
    dialogue.push({ role: "user", content: currentText });
  }
  return dialogue;
}

export async function answerWithPortalAgent(input: PortalAgentInput) {
  if (isMemoryOnlyRequest(input.text)) {
    return "Gemerkter Kontext für diesen Telegram-Verlauf. Ich beziehe mich bei den nächsten Antworten darauf.";
  }

  const apiKey = decryptSecret(input.openAiKeyEnc) || env.openAiApiKey;
  if (!apiKey) {
    return "OpenAI API-Key fehlt. Hinterlege ihn in der App unter Telegram, dann kann ich als Agent antworten.";
  }

  const [status, recentDialogue] = await Promise.all([getPortalStatus(input.userId), recentTelegramDialogue(input.userId, input.text)]);
  const client = new OpenAI({ apiKey });
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "Du bist der Telegram-Agent für das Portal playplaner.com. Antworte auf Deutsch, knapp und konkret. " +
        "Du darfst Fragen zum Portal beantworten und über die bereitgestellten Tools Portal-Aktionen ausführen. " +
        "Fuehre Schreibaktionen nur aus, wenn die Absicht des Nutzers klar ist. Frage bei fehlenden Pflichtangaben nach. " +
        "Wenn der Nutzer nur sagt, dass du dir etwas merken, notieren oder als Kontext behalten sollst, führe keine Portal-Schreibaktion aus. " +
        agentCapabilityPrompt() +
        " Antworte bei Kontingenten mit erledigt und noch offen, nicht mit offenen Sessions. " +
        "Nutze den Dialogverlauf, um kurze Folgeauftraege wie 'das', 'den letzten Plan', 'morgen' oder 'mach daraus' korrekt auf den vorherigen Kontext zu beziehen. " +
        "Erfinde keine vorhandenen Datensätze. Nutze Suchen/Status, wenn du Portalwissen brauchst. " +
        "Wenn du Listen ausgibst, nutze knappes Telegram-HTML mit <b>Überschriften</b>, nummerierten Einträgen und Links. Nutze kein Markdown. " +
        "Halte Inhalte konsens-, sicherheits- und dokumentationsorientiert und vermeide explizite Ausformulierungen. " +
        `Heute ist ${new Intl.DateTimeFormat("de-DE", { dateStyle: "full", timeZone: "Europe/Berlin" }).format(new Date())}. ` +
        `Aktiver Telegram-Kontext: Chat-ID ${input.chatId}, Thread-ID ${input.threadId || "-"}.`
    },
    { role: "system", content: `Aktueller Portalstatus: ${JSON.stringify(status.data)}` },
    ...recentDialogue
  ];

  for (let step = 0; step < 5; step += 1) {
    const completion = await client.chat.completions.create({
      model: AGENT_MODEL,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.2
    });
    const message = completion.choices[0]?.message;
    if (!message) return "Ich konnte gerade keine Antwort erzeugen.";
    messages.push(message);
    const calls = message.tool_calls || [];
    if (!calls.length) return message.content || "Erledigt.";
    const directResults: { name: string; result: ToolCallResult }[] = [];
    for (const call of calls) {
      const result = await runTool(input.userId, call.function.name, parseJsonArguments(call.function.arguments));
      directResults.push({ name: call.function.name, result });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result)
      });
    }
    if (directResults.length === 1 && directAgentToolNames.has(directResults[0].name)) {
      return formatToolResultHtml(directResults[0].result);
    }
  }

  return "Ich habe mehrere Portalaktionen geprüft, aber keine klare Abschlussantwort erzeugt. Bitte formuliere den Auftrag etwas konkreter.";
}
