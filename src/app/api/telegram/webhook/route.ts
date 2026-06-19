import { NextResponse } from "next/server";
import { defaultAlbumTitle, ensureDefaultAlbum } from "@/lib/albums";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { answerWithPortalAgent } from "@/lib/telegram-agent";
import { handleItemCreationDialogue, handleItemCreationImage } from "@/lib/telegram-item-dialogue";
import { formatDateTime, formatMinutes, minutesBetween } from "@/lib/dates";
import { logAction } from "@/lib/audit";
import { fileAssetUrl, saveFileBuffer } from "@/lib/files";
import { downloadTelegramFile, largestTelegramPhoto, sendTelegramMessage, telegramHtml, telegramLink, transcribeTelegramVoice } from "@/lib/telegram";
import type { TelegramUpdate } from "@/lib/telegram";
import { uniqueSessionSlug } from "@/lib/session-slug";
import { uniqueSlug } from "@/lib/slug";

type TelegramMessageFrom = NonNullable<TelegramUpdate["message"]>["from"];

const HELP_TEXT = `<b>Befehle</b>
/start - Bot starten
/help - Befehle anzeigen
/id - Chat-ID und Thread-ID anzeigen
/status - kurze Übersicht
/toys - Spielzeuge anzeigen
/positions - Stellungen anzeigen
/activities - geplante Aktivitäten anzeigen
/activity_request Titel - Spielplan anfragen
/activity_confirm_1 - angefragten Spielplan aus der Liste bestätigen
/sessions - Session-Auswertung aktuelles Jahr
/session_start Notiz - Segufix-Session starten
/session_stop Notiz - laufende Session beenden
/kg - KG-Auswertung aktuelles Jahr
/kg_start Notiz - KG-Tracker starten
/kg_stop Notiz - KG-Tracker beenden

<b>Du kannst auch normal schreiben</b>
Plane morgen um 20 Uhr einen Entspannungsabend mit Leder-Manschetten.
Welche Spielzeuge habe ich?
Starte eine Session mit Notiz ruhig begonnen.`;

function htmlLine(label: string, value: unknown) {
  return `<b>${telegramHtml(label)}:</b> ${telegramHtml(value || "-")}`;
}

function htmlList(title: string, rows: string[]) {
  if (!rows.length) return `<b>${telegramHtml(title)}</b>\nKeine Einträge gefunden.`;
  return [`<b>${telegramHtml(title)}</b>`, ...rows].join("\n\n");
}

const activityStatusLabel = { REQUESTED: "angefragt", PLANNED: "geplant", DONE: "durchgeführt", DISCARDED: "verworfen" } as const;

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

  if (parsed.command === "/start" || parsed.command === "/help") return HELP_TEXT;
  if (parsed.command === "/id") return ["<b>Telegram-Verbindung</b>", htmlLine("Chat-ID", chatId), htmlLine("Thread-ID", threadId || "-"), htmlLine("Status", "aktiv")].join("\n");

  if (parsed.command === "/status") {
    const [toys, positions, activities, sessions, kgSessions] = await Promise.all([
      prisma.toy.count({ where: { ownerId: userId } }),
      prisma.position.count({ where: { ownerId: userId } }),
      prisma.activityPlan.count({ where: { ownerId: userId, status: { in: ["REQUESTED", "PLANNED"] } } }),
      prisma.segufixSession.count({ where: { ownerId: userId } }),
      prisma.kgSession.count({ where: { ownerId: userId } })
    ]);
    return ["<b>Portalstatus</b>", htmlLine("Spielzeuge", toys), htmlLine("Stellungen", positions), htmlLine("Geplante Aktivitäten", activities), htmlLine("Segufix-Sessions", sessions), htmlLine("KG-Einträge", kgSessions)].join("\n");
  }

  if (parsed.command.startsWith("/media_album_")) {
    const match = parsed.command.match(/^\/media_album_(\d+)_(.+)$/);
    if (!match) return "Ungültiger Album-Befehl.";
    const albumIndex = Number(match[1]);
    const mediaId = match[2];
    const [media, albums] = await Promise.all([
      prisma.media.findFirst({ where: { id: mediaId, ownerId: userId } }),
      prisma.album.findMany({ where: { ownerId: userId }, orderBy: { title: "asc" } })
    ]);
    const album = albums[albumIndex - 1];
    if (!media || !album) return "Medium oder Album wurde nicht gefunden.";
    await prisma.media.update({ where: { id: media.id }, data: { albumId: album.id } });
    await logAction({
      actorId: userId,
      action: "media_album_changed_telegram",
      entityType: "media",
      entityId: media.id,
      title: `Bild per Telegram in Album verschoben: ${album.title}`,
      href: "/media"
    });
    return [`<b>Bild einsortiert</b>`, htmlLine("Bild", media.title), htmlLine("Album", album.title), telegramLink(`${env.appUrl}/media?view=${media.id}`, "in Medien öffnen")].join("\n");
  }

  if (parsed.command === "/toys") {
    const toys = await prisma.toy.findMany({ where: { ownerId: userId }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }], take: 12 });
    return htmlList(
      "Spielzeuge",
      toys.map((toy, index) =>
        [`<b>${index + 1}. ${telegramHtml(toy.title)}</b>`, toy.description ? telegramHtml(toy.description) : "", telegramLink(`${env.appUrl}/toys/${toy.slug}`, "öffnen")]
          .filter(Boolean)
          .join("\n")
      )
    );
  }

  if (parsed.command === "/positions") {
    const positions = await prisma.position.findMany({ where: { ownerId: userId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], take: 12 });
    return htmlList(
      "Stellungen",
      positions.map((position, index) =>
        [`<b>${index + 1}. ${telegramHtml(position.name)}</b>`, position.description ? telegramHtml(position.description) : "", telegramLink(`${env.appUrl}/positions/${position.slug}`, "öffnen")]
          .filter(Boolean)
          .join("\n")
      )
    );
  }

  if (parsed.command === "/activities") {
    const activities = await prisma.activityPlan.findMany({
      where: { ownerId: userId, status: { in: ["REQUESTED", "PLANNED"] } },
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
          htmlLine("Bausteine", `${activity.tools.length} Spielzeuge, ${activity.positions.length} Stellungen`),
          telegramLink(`${env.appUrl}/activities/${activity.slug}`, "öffnen"),
          activity.status === "REQUESTED" ? `/activity_confirm_${requested.findIndex((entry) => entry.id === activity.id) + 1}` : ""
        ].join("\n")
      )
    );
  }

  if (parsed.command === "/activity_request") {
    const title = parsed.args || "Spielanfrage";
    const activity = await prisma.activityPlan.create({
      data: {
        ownerId: userId,
        title,
        slug: await uniqueSlug("activityPlan", title),
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
      where: { ownerId: userId, status: "REQUESTED" },
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

  if (parsed.command === "/sessions") {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const sessions = await prisma.segufixSession.findMany({ where: { ownerId: userId, startTime: { gte: yearStart } } });
    const total = sessions.reduce((sum, session) => sum + (session.durationMinutes || 0), 0);
    const open = sessions.filter((session) => !session.endTime).length;
    return [`<b>Sessions ${now.getFullYear()}</b>`, htmlLine("Anzahl", sessions.length), htmlLine("Gesamtdauer", formatMinutes(total)), htmlLine("Offen", open)].join("\n");
  }

  if (parsed.command === "/kg") {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const sessions = await prisma.kgSession.findMany({ where: { ownerId: userId, startTime: { gte: yearStart } } });
    const total = sessions.reduce((sum, session) => sum + (session.durationMinutes || 0), 0);
    const open = sessions.filter((session) => !session.endTime).length;
    return [`<b>KG Time Tracker ${now.getFullYear()}</b>`, htmlLine("Einträge", sessions.length), htmlLine("Gesamtzeit", formatMinutes(total)), htmlLine("Offen", open), telegramLink(`${env.appUrl}/sessions?tracker=kg`, "KG Tracker öffnen")].join("\n");
  }

  if (parsed.command === "/session_start") {
    const open = await prisma.segufixSession.findFirst({ where: { ownerId: userId, endTime: null }, orderBy: { startTime: "desc" } });
    if (open) return `Es läuft bereits eine Session seit ${formatDateTime(open.startTime)}. Beende sie mit /session_stop.`;
    const startTime = new Date();
    const session = await prisma.segufixSession.create({
      data: {
        ownerId: userId,
        slug: await uniqueSessionSlug(startTime),
        startTime,
        notes: parsed.args || "Per Telegram gestartet"
      }
    });
    return [`Session gestartet: ${formatDateTime(session.startTime)}`, telegramLink(`${env.appUrl}/sessions/${session.slug}`, "Session öffnen")].join("\n");
  }

  if (parsed.command === "/session_stop") {
    const session = await prisma.segufixSession.findFirst({ where: { ownerId: userId, endTime: null }, orderBy: { startTime: "desc" } });
    if (!session) return "Keine laufende Session gefunden.";
    const endTime = new Date();
    const durationMinutes = minutesBetween(session.startTime, endTime);
    await prisma.segufixSession.update({
      where: { id: session.id },
      data: {
        endTime,
        durationMinutes,
        notes: [session.notes, parsed.args].filter(Boolean).join("\n")
      }
    });
    return `Session beendet: ${formatMinutes(durationMinutes)}`;
  }

  if (parsed.command === "/kg_start") {
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
        notes: parsed.args || "Per Telegram gestartet"
      }
    });
    await logAction({
      actorId: userId,
      action: "kg_started_telegram",
      entityType: "kgSession",
      entityId: session.id,
      title: "KG-Tracker per Telegram gestartet",
      href: "/sessions?tracker=kg"
    });
    return [`<b>KG-Tracker gestartet</b>`, htmlLine("Start", formatDateTime(session.startTime)), telegramLink(`${env.appUrl}/sessions?tracker=kg`, "KG Tracker öffnen")].join("\n");
  }

  if (parsed.command === "/kg_stop") {
    const session = await prisma.kgSession.findFirst({ where: { ownerId: userId, endTime: null }, orderBy: { startTime: "desc" } });
    if (!session) return "Kein laufender KG-Tracker gefunden.";
    const endTime = new Date();
    const durationMinutes = minutesBetween(session.startTime, endTime);
    const updated = await prisma.kgSession.update({
      where: { id: session.id },
      data: {
        endTime,
        durationMinutes,
        notes: [session.notes, parsed.args].filter(Boolean).join("\n")
      }
    });
    await logAction({
      actorId: userId,
      action: "kg_stopped_telegram",
      entityType: "kgSession",
      entityId: updated.id,
      title: "KG-Tracker per Telegram beendet",
      href: "/sessions?tracker=kg"
    });
    return [`<b>KG-Tracker beendet</b>`, htmlLine("Dauer", formatMinutes(durationMinutes)), telegramLink(`${env.appUrl}/sessions?tracker=kg`, "KG Tracker öffnen")].join("\n");
  }

  return `Unbekannter Befehl: ${parsed.command}\n\n${HELP_TEXT}`;
}

async function findActiveTelegramChat(chatId: string, threadId: string | null) {
  const include = { settings: { include: { user: true, telegramUserMappings: { include: { appUser: true } } } } } as const;
  return prisma.telegramChat.findFirst({
    where: { chatId, threadId, status: "ACTIVE" },
    include
  });
}

function mappedTelegramUserId(
  chat: Awaited<ReturnType<typeof findActiveTelegramChat>>,
  from?: TelegramMessageFrom
) {
  const normalized = String(from?.username || "").trim().replace(/^@+/, "").toLowerCase();
  const telegramUserId = from?.id ? String(from.id) : "";
  if (!chat || (!normalized && !telegramUserId)) return chat?.settings.userId || "";
  const mapping = chat.settings.telegramUserMappings.find((entry) =>
    entry.appUser.active && ((telegramUserId && entry.telegramUserId === telegramUserId) || (normalized && entry.telegramUsername === normalized))
  );
  return mapping?.appUserId || chat.settings.userId;
}

async function rememberTelegramKnownUser(chat: Awaited<ReturnType<typeof findActiveTelegramChat>>, from?: TelegramMessageFrom) {
  if (!chat || !from?.id) return;
  await prisma.telegramKnownUser.upsert({
    where: { settingsId_telegramUserId: { settingsId: chat.settingsId, telegramUserId: String(from.id) } },
    update: {
      telegramUsername: from.username ? from.username.toLowerCase() : null,
      firstName: from.first_name || null,
      lastName: from.last_name || null,
      lastMessageAt: new Date()
    },
    create: {
      settingsId: chat.settingsId,
      telegramUserId: String(from.id),
      telegramUsername: from.username ? from.username.toLowerCase() : null,
      firstName: from.first_name || null,
      lastName: from.last_name || null,
      lastMessageAt: new Date()
    }
  });
}

export async function POST(request: Request) {
  const update = (await request.json()) as TelegramUpdate;
  const message = update.message;
  if (!message) return NextResponse.json({ ok: true });
  const chatId = String(message.chat.id);
  const threadId = message.message_thread_id ? String(message.message_thread_id) : null;
  const chat = await findActiveTelegramChat(chatId, threadId);
  if (!chat?.settings.telegramBotTokenEnc) {
    return NextResponse.json({ ok: true, ignored: true });
  }
  await rememberTelegramKnownUser(chat, message.from);
  const actorUserId = mappedTelegramUserId(chat, message.from);

  const photo = largestTelegramPhoto(message);
  const imageDocument = message.document?.mime_type?.startsWith("image/") ? message.document : null;
  const imageFileId = photo?.file_id || imageDocument?.file_id;
  if (imageFileId) {
    const downloaded = await downloadTelegramFile(
      chat.settings.telegramBotTokenEnc,
      imageFileId,
      imageDocument?.file_name || `telegram-bild-${message.message_id}.jpg`,
      imageDocument?.mime_type || "image/jpeg"
    );
    const asset = await saveFileBuffer({
      ownerId: actorUserId,
      bytes: downloaded.bytes,
      originalName: downloaded.originalName,
      mimeType: downloaded.mimeType
    });
    if (!asset) return NextResponse.json({ ok: true });
    const imageUrl = fileAssetUrl(asset.id);
    const caption = message.caption?.trim();
    await prisma.message.create({ data: { senderId: actorUserId, body: `Telegram: [Bild]${caption ? ` ${caption}` : ""}`, mediaUrl: imageUrl } });
    await logAction({
      actorId: actorUserId,
      action: "telegram_image_received",
      entityType: "telegram",
      title: "Telegram-Bild empfangen",
      details: { caption: caption || null, chatTitle: chat.title || null },
      href: imageUrl
    });

    const itemDialogueAnswer = await handleItemCreationImage(actorUserId, imageUrl);
    const answer: string =
      itemDialogueAnswer ??
      (await prisma.media
        .create({
          data: {
            ownerId: actorUserId,
            albumId: (await ensureDefaultAlbum(actorUserId)).id,
            title: caption || `Telegram Bild ${formatDateTime(new Date())}`,
            kind: "IMAGE",
            url: imageUrl,
            visibility: "PRIVATE"
          }
        })
        .then(async (media) => {
          const albums = await prisma.album.findMany({ where: { ownerId: actorUserId }, orderBy: { title: "asc" } });
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
            "<b>Bild in Medien gespeichert</b>",
            telegramHtml(media.title),
            htmlLine("Album", albums.find((album) => album.id === media.albumId)?.title || defaultAlbumTitle),
            "",
            "<b>In anderes Album verschieben</b>",
            ...albumLines,
            "",
            "Wenn du nichts anklickst, bleibt das Bild im Standardalbum."
          ].join("\n");
        }));

    await sendTelegramMessage(chat.settings.telegramBotTokenEnc, chatId, threadId, answer, { parseMode: "HTML", disableWebPagePreview: true });
    await prisma.message.create({ data: { senderId: actorUserId, body: `Telegram-Agent: ${answer}` } });
    await logAction({
      actorId: actorUserId,
      action: "telegram_answer_sent",
      entityType: "telegram",
      title: "Telegram-Antwort gesendet",
      details: { answer: answer.slice(0, 500) }
    });
    await prisma.telegramChat.update({ where: { id: chat.id }, data: { lastMessageAt: new Date() } });
    return NextResponse.json({ ok: true });
  }

  let body = message.text || message.caption || "";
  if (!body && message.voice?.file_id) {
    body = await transcribeTelegramVoice(chat.settings.telegramBotTokenEnc, chat.settings.openAiApiKeyEnc, message.voice.file_id);
  }
  if (body) {
    await prisma.message.create({ data: { senderId: actorUserId, body: `Telegram: ${body}` } });
    await logAction({
      actorId: actorUserId,
      action: "telegram_message_received",
      entityType: "telegram",
      title: "Telegram-Nachricht empfangen",
      details: { text: body.slice(0, 500), chatTitle: chat.title || null }
    });
    const itemDialogueAnswer = commandOf(body) ? null : await handleItemCreationDialogue(actorUserId, body);
    const answer = commandOf(body)
      ? await handleCommand(actorUserId, body, chatId, threadId)
      : itemDialogueAnswer ||
        (await answerWithPortalAgent({
          userId: actorUserId,
          text: body,
          chatId,
          threadId,
          openAiKeyEnc: chat.settings.openAiApiKeyEnc
        }));
    await sendTelegramMessage(chat.settings.telegramBotTokenEnc, chatId, threadId, answer, { parseMode: "HTML", disableWebPagePreview: true });
    await prisma.message.create({ data: { senderId: actorUserId, body: `Telegram-Agent: ${answer}` } });
    await logAction({
      actorId: actorUserId,
      action: "telegram_answer_sent",
      entityType: "telegram",
      title: "Telegram-Antwort gesendet",
      details: { answer: answer.slice(0, 500) }
    });
  }
  await prisma.telegramChat.update({ where: { id: chat.id }, data: { lastMessageAt: new Date() } });
  return NextResponse.json({ ok: true });
}
