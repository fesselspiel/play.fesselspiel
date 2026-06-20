import OpenAI from "openai";
import { env } from "@/lib/env";
import { decryptSecret } from "@/lib/crypto";
import { formatDateTime, formatMinutes, minutesBetween } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { uniqueSlug } from "@/lib/slug";
import { uniqueSessionSlug } from "@/lib/session-slug";
import { telegramHtml, telegramLink } from "@/lib/telegram";

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

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_portal_status",
      description: "Zeigt eine kompakte Übersicht über das Portal des aktiven Benutzers.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    }
  },
  {
    type: "function",
    function: {
      name: "search_portal",
      description: "Sucht Spielzeuge, Szenen, Aktivitäten und Sessions im Portal.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Suchtext. Leer lassen für aktuelle Listen." },
          area: { type: "string", enum: ["all", "toys", "positions", "activities", "sessions"] }
        },
        required: ["query", "area"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_toy",
      description: "Legt ein Spielzeug im Spielzeugkatalog an.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          imageUrl: { type: "string" },
          slug: { type: "string" }
        },
        required: ["title", "description", "imageUrl"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_position",
      description: "Legt eine Szene/Position an und kann vorhandene Spielzeuge per Titel verknüpfen.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          imageUrl: { type: "string" },
          toyTitles: { type: "array", items: { type: "string" } }
        },
        required: ["name", "description", "imageUrl"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_activity",
      description: "Plant eine Aktivität mit optionalem Datum, Notiz, Spielzeugen und Szenen.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          category: { type: "string" },
          note: { type: "string" },
          plannedAt: { type: "string", description: "ISO-8601 Datum/Zeit oder leer, z.B. 2026-06-18T20:00:00+02:00" },
          status: { type: "string", enum: ["REQUESTED", "PLANNED"] },
          toyTitles: { type: "array", items: { type: "string" } },
          positionNames: { type: "array", items: { type: "string" } }
        },
        required: ["title"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "set_activity_status",
      description: "Setzt eine vorhandene Aktivität auf angefragt, geplant, durchgeführt oder verworfen. Zum Bestätigen einer Anfrage auf PLANNED setzen.",
      parameters: {
        type: "object",
        properties: {
          titleOrSlug: { type: "string" },
          status: { type: "string", enum: ["REQUESTED", "PLANNED", "DONE", "DISCARDED"] }
        },
        required: ["titleOrSlug", "status"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "start_session",
      description: "Startet eine Segufix-Session, wenn keine andere Session offen ist.",
      parameters: {
        type: "object",
        properties: {
          note: { type: "string" },
          moodBefore: { type: "string", enum: ["NEEDS_WORK", "OKAY", "NEUTRAL", "PLEASANT", "VERY_PLEASANT"] }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "stop_session",
      description: "Beendet die aktuell laufende Segufix-Session.",
      parameters: {
        type: "object",
        properties: {
          note: { type: "string" },
          moodAfter: { type: "string", enum: ["WORSE", "UNCHANGED", "SLIGHTLY_BETTER", "MUCH_BETTER", "RELAXED"] }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "start_kg_tracker",
      description: "Startet den KG Time Tracker. Wenn bereits einer offen ist, wird er beendet und ein neuer gestartet.",
      parameters: {
        type: "object",
        properties: {
          note: { type: "string" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "stop_kg_tracker",
      description: "Beendet den aktuell laufenden KG Time Tracker.",
      parameters: {
        type: "object",
        properties: {
          note: { type: "string" }
        },
        additionalProperties: false
      }
    }
  }
];

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
  const values = Array.isArray(titles) ? titles.map(clean).filter(Boolean) : [];
  if (!values.length) return [];
  return prisma.toy.findMany({
    where: {
      ownerId: userId,
      OR: values.flatMap((title) => [{ title: contains(title) }, { slug: contains(title) }])
    },
    take: 20
  });
}

async function matchingPositions(userId: string, names: unknown) {
  const values = Array.isArray(names) ? names.map(clean).filter(Boolean) : [];
  if (!values.length) return [];
  return prisma.position.findMany({
    where: {
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
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const [toys, positions, plannedActivities, sessions, openSession] = await Promise.all([
    prisma.toy.count({ where: { ownerId: userId } }),
    prisma.position.count({ where: { ownerId: userId } }),
    prisma.activityPlan.count({ where: { ownerId: userId, category: { not: "IDEA_COLLECTION" }, status: { in: ["REQUESTED", "PLANNED"] } } }),
    prisma.segufixSession.findMany({ where: { ownerId: userId, startTime: { gte: yearStart } } }),
    prisma.segufixSession.findFirst({ where: { ownerId: userId, endTime: null }, orderBy: { startTime: "desc" } })
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

async function searchPortal(userId: string, args: Record<string, unknown>): Promise<ToolCallResult> {
  const query = clean(args.query);
  const area = clean(args.area) || "all";
  const whereText = query ? [{ title: contains(query) }, { slug: contains(query) }, { description: contains(query) }] : undefined;
  const whereName = query ? [{ name: contains(query) }, { slug: contains(query) }, { description: contains(query) }] : undefined;
  const result: Record<string, unknown> = {};

  if (area === "all" || area === "toys") {
    const toys = await prisma.toy.findMany({
      where: { ownerId: userId, ...(whereText ? { OR: whereText } : {}) },
      orderBy: { updatedAt: "desc" },
      take: 8
    });
    result.toys = toys.map((toy) => ({ title: toy.title, url: link(`/toys/${toy.slug}`), description: toy.description }));
  }
  if (area === "all" || area === "positions") {
    const positions = await prisma.position.findMany({
      where: { ownerId: userId, ...(whereName ? { OR: whereName } : {}) },
      orderBy: { updatedAt: "desc" },
      take: 8
    });
    result.positions = positions.map((position) => ({ name: position.name, url: link(`/positions/${position.slug}`), description: position.description }));
  }
  if (area === "all" || area === "activities") {
    const activities = await prisma.activityPlan.findMany({
      where: { ownerId: userId, ...(whereText ? { OR: whereText } : {}) },
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
    const sessions = await prisma.segufixSession.findMany({
      where: { ownerId: userId, ...(query ? { notes: contains(query) } : {}) },
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
  const title = clean(args.title);
  if (!title) return { ok: false, message: "Titel fehlt." };
  if (!clean(args.description)) return { ok: false, message: "Beschreibung fehlt. Frage danach, bevor du das Spielzeug anlegst." };
  if (args.imageUrl === undefined) return { ok: false, message: "Bild-URL fehlt. Frage danach, bevor du das Spielzeug anlegst." };
  const slug = await uniqueSlug("toy", clean(args.slug) || title);
  const toy = await prisma.toy.create({
    data: {
      ownerId: userId,
      title,
      slug,
      description: clean(args.description),
      imageUrl: clean(args.imageUrl)
    }
  });
  return { ok: true, message: `Spielzeug angelegt: ${toy.title}`, data: { title: toy.title, url: link(`/toys/${toy.slug}`) } };
}

async function createPosition(userId: string, args: Record<string, unknown>): Promise<ToolCallResult> {
  const name = clean(args.name);
  if (!name) return { ok: false, message: "Name fehlt." };
  if (!clean(args.description)) return { ok: false, message: "Beschreibung fehlt. Frage danach, bevor du die Szene anlegst." };
  if (args.imageUrl === undefined) return { ok: false, message: "Bild-URL fehlt. Frage danach, bevor du die Szene anlegst." };
  const slug = await uniqueSlug("position", name);
  const toys = await matchingToys(userId, args.toyTitles);
  const position = await prisma.position.create({
    data: {
      ownerId: userId,
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
  const title = clean(args.title);
  if (!title) return { ok: false, message: "Aktivität fehlt." };
  const plannedAtRaw = clean(args.plannedAt);
  const plannedAt = plannedAtRaw ? new Date(plannedAtRaw) : null;
  if (plannedAtRaw && Number.isNaN(plannedAt?.getTime())) return { ok: false, message: "Datum/Uhrzeit konnte nicht gelesen werden." };
  const [toys, positions] = await Promise.all([matchingToys(userId, args.toyTitles), matchingPositions(userId, args.positionNames)]);
  const slug = await uniqueSlug("activityPlan", title);
  const activity = await prisma.activityPlan.create({
    data: {
      ownerId: userId,
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
  const titleOrSlug = clean(args.titleOrSlug);
  const status = clean(args.status) as "REQUESTED" | "PLANNED" | "DONE" | "DISCARDED";
  if (!titleOrSlug || !["REQUESTED", "PLANNED", "DONE", "DISCARDED"].includes(status)) return { ok: false, message: "Aktivität oder Status fehlt." };
  const activity = await prisma.activityPlan.findFirst({
    where: { ownerId: userId, OR: [{ slug: titleOrSlug }, { title: contains(titleOrSlug) }] },
    orderBy: { updatedAt: "desc" }
  });
  if (!activity) return { ok: false, message: "Aktivität nicht gefunden." };
  const updated = await prisma.activityPlan.update({ where: { id: activity.id }, data: { status } });
  return { ok: true, message: `Aktivität aktualisiert: ${updated.title}`, data: { status: updated.status, url: link(`/activities/${updated.slug}`) } };
}

async function startSession(userId: string, args: Record<string, unknown>): Promise<ToolCallResult> {
  const open = await prisma.segufixSession.findFirst({ where: { ownerId: userId, endTime: null }, orderBy: { startTime: "desc" } });
  if (open) return { ok: false, message: `Es läuft bereits eine Session seit ${formatDateTime(open.startTime)}.` };
  const moodBefore = clean(args.moodBefore) || undefined;
  const startTime = new Date();
  const session = await prisma.segufixSession.create({
    data: {
      ownerId: userId,
      slug: await uniqueSessionSlug(startTime),
      startTime,
      notes: clean(args.note) || "Per Telegram-Agent gestartet",
      moodBefore: moodBefore as never,
      moodBeforeText: ""
    }
  });
  return { ok: true, message: `Session gestartet: ${formatDateTime(session.startTime)}`, data: { url: link(`/sessions/${session.slug}`) } };
}

async function stopSession(userId: string, args: Record<string, unknown>): Promise<ToolCallResult> {
  const session = await prisma.segufixSession.findFirst({ where: { ownerId: userId, endTime: null }, orderBy: { startTime: "desc" } });
  if (!session) return { ok: false, message: "Keine laufende Session gefunden." };
  const endTime = new Date();
  const durationMinutes = minutesBetween(session.startTime, endTime);
  const moodAfter = clean(args.moodAfter) || undefined;
  const updated = await prisma.segufixSession.update({
    where: { id: session.id },
    data: {
      endTime,
      durationMinutes,
      notes: [session.notes, clean(args.note)].filter(Boolean).join("\n"),
      moodAfter: moodAfter as never,
      moodAfterText: ""
    }
  });
  return { ok: true, message: `Session beendet: ${formatMinutes(updated.durationMinutes)}` };
}

async function startKgTracker(userId: string, args: Record<string, unknown>): Promise<ToolCallResult> {
  const open = await prisma.kgSession.findFirst({ where: { ownerId: userId, endTime: null }, orderBy: { startTime: "desc" } });
  const startTime = new Date();
  if (open) {
    await prisma.kgSession.update({
      where: { id: open.id },
      data: {
        endTime: startTime,
        durationMinutes: minutesBetween(open.startTime, startTime),
        notes: [open.notes, "Automatisch beendet, weil ein neuer KG-Tracker gestartet wurde."].filter(Boolean).join("\n")
      }
    });
  }
  const session = await prisma.kgSession.create({
    data: {
      ownerId: userId,
      startTime,
      notes: clean(args.note) || "Per Telegram-Agent gestartet"
    }
  });
  return { ok: true, message: `KG-Tracker gestartet: ${formatDateTime(session.startTime)}`, data: { url: link("/sessions?tracker=kg") } };
}

async function stopKgTracker(userId: string, args: Record<string, unknown>): Promise<ToolCallResult> {
  const session = await prisma.kgSession.findFirst({ where: { ownerId: userId, endTime: null }, orderBy: { startTime: "desc" } });
  if (!session) return { ok: false, message: "Kein laufender KG-Tracker gefunden." };
  const endTime = new Date();
  const durationMinutes = minutesBetween(session.startTime, endTime);
  const updated = await prisma.kgSession.update({
    where: { id: session.id },
    data: {
      endTime,
      durationMinutes,
      notes: [session.notes, clean(args.note)].filter(Boolean).join("\n")
    }
  });
  return { ok: true, message: `KG-Tracker beendet: ${formatMinutes(updated.durationMinutes)}`, data: { url: link("/sessions?tracker=kg") } };
}

async function runTool(userId: string, name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
  if (name === "get_portal_status") return getPortalStatus(userId);
  if (name === "search_portal") return searchPortal(userId, args);
  if (name === "create_toy") return createToy(userId, args);
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
    if (directResults.length === 1 && ["get_portal_status", "search_portal"].includes(directResults[0].name)) {
      return formatToolResultHtml(directResults[0].result);
    }
  }

  return "Ich habe mehrere Portalaktionen geprüft, aber keine klare Abschlussantwort erzeugt. Bitte formuliere den Auftrag etwas konkreter.";
}
