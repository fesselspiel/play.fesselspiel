import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { answerWithPortalAgent } from "@/lib/telegram-agent";
import { handleItemCreationDialogue, handleItemCreationImage } from "@/lib/telegram-item-dialogue";
import { formatDateTime, formatMinutes, minutesBetween } from "@/lib/dates";
import { fileAssetUrl, saveFileBuffer } from "@/lib/files";
import { downloadTelegramFile, largestTelegramPhoto, sendTelegramMessage, telegramHtml, telegramLink, transcribeTelegramVoice } from "@/lib/telegram";
import type { TelegramUpdate } from "@/lib/telegram";
import { uniqueSessionSlug } from "@/lib/session-slug";

const HELP_TEXT = `<b>Befehle</b>
/start - Bot starten
/help - Befehle anzeigen
/id - Chat-ID und Thread-ID anzeigen
/status - kurze Uebersicht
/toys - Spielzeuge anzeigen
/positions - Stellungen anzeigen
/activities - geplante Aktivitaeten anzeigen
/sessions - Session-Auswertung aktuelles Jahr
/session_start Notiz - Segufix-Session starten
/session_stop Notiz - laufende Session beenden

<b>Du kannst auch normal schreiben</b>
Plane morgen um 20 Uhr einen Entspannungsabend mit Leder-Manschetten.
Welche Spielzeuge habe ich?
Starte eine Session mit Notiz ruhig begonnen.`;

function htmlLine(label: string, value: unknown) {
  return `<b>${telegramHtml(label)}:</b> ${telegramHtml(value || "-")}`;
}

function htmlList(title: string, rows: string[]) {
  if (!rows.length) return `<b>${telegramHtml(title)}</b>\nKeine Eintraege gefunden.`;
  return [`<b>${telegramHtml(title)}</b>`, ...rows].join("\n\n");
}

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
    const [toys, positions, activities, sessions] = await Promise.all([
      prisma.toy.count({ where: { ownerId: userId } }),
      prisma.position.count({ where: { ownerId: userId } }),
      prisma.activityPlan.count({ where: { ownerId: userId, status: "PLANNED" } }),
      prisma.segufixSession.count({ where: { ownerId: userId } })
    ]);
    return ["<b>Portalstatus</b>", htmlLine("Spielzeuge", toys), htmlLine("Stellungen", positions), htmlLine("Geplante Aktivitaeten", activities), htmlLine("Sessions", sessions)].join("\n");
  }

  if (parsed.command === "/toys") {
    const toys = await prisma.toy.findMany({ where: { ownerId: userId }, orderBy: { title: "asc" }, take: 12 });
    return htmlList(
      "Spielzeuge",
      toys.map((toy, index) =>
        [`<b>${index + 1}. ${telegramHtml(toy.title)}</b>`, toy.description ? telegramHtml(toy.description) : "", telegramLink(`${env.appUrl}/toys/${toy.slug}`, "oeffnen")]
          .filter(Boolean)
          .join("\n")
      )
    );
  }

  if (parsed.command === "/positions") {
    const positions = await prisma.position.findMany({ where: { ownerId: userId }, orderBy: { name: "asc" }, take: 12 });
    return htmlList(
      "Stellungen",
      positions.map((position, index) =>
        [`<b>${index + 1}. ${telegramHtml(position.name)}</b>`, position.description ? telegramHtml(position.description) : "", telegramLink(`${env.appUrl}/positions/${position.slug}`, "oeffnen")]
          .filter(Boolean)
          .join("\n")
      )
    );
  }

  if (parsed.command === "/activities") {
    const activities = await prisma.activityPlan.findMany({
      where: { ownerId: userId, status: "PLANNED" },
      include: { tools: true, positions: true },
      orderBy: { plannedAt: "asc" },
      take: 8
    });
    return htmlList(
      "Geplante Aktivitaeten",
      activities.map((activity, index) =>
        [
          `<b>${index + 1}. ${telegramHtml(activity.title)}</b>`,
          htmlLine("Termin", formatDateTime(activity.plannedAt)),
          htmlLine("Bausteine", `${activity.tools.length} Spielzeuge, ${activity.positions.length} Stellungen`),
          telegramLink(`${env.appUrl}/activities/${activity.slug}`, "oeffnen")
        ].join("\n")
      )
    );
  }

  if (parsed.command === "/sessions") {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const sessions = await prisma.segufixSession.findMany({ where: { ownerId: userId, startTime: { gte: yearStart } } });
    const total = sessions.reduce((sum, session) => sum + (session.durationMinutes || 0), 0);
    const open = sessions.filter((session) => !session.endTime).length;
    return [`<b>Sessions ${now.getFullYear()}</b>`, htmlLine("Anzahl", sessions.length), htmlLine("Gesamtdauer", formatMinutes(total)), htmlLine("Offen", open)].join("\n");
  }

  if (parsed.command === "/session_start") {
    const open = await prisma.segufixSession.findFirst({ where: { ownerId: userId, endTime: null }, orderBy: { startTime: "desc" } });
    if (open) return `Es laeuft bereits eine Session seit ${formatDateTime(open.startTime)}. Beende sie mit /session_stop.`;
    const startTime = new Date();
    const session = await prisma.segufixSession.create({
      data: {
        ownerId: userId,
        slug: await uniqueSessionSlug(startTime),
        startTime,
        notes: parsed.args || "Per Telegram gestartet"
      }
    });
    return [`Session gestartet: ${formatDateTime(session.startTime)}`, telegramLink(`${env.appUrl}/sessions/${session.slug}`, "Session oeffnen")].join("\n");
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
  username?: string
) {
  const normalized = String(username || "").trim().replace(/^@+/, "").toLowerCase();
  if (!chat || !normalized) return chat?.settings.userId || "";
  const mapping = chat.settings.telegramUserMappings.find((entry) => entry.telegramUsername === normalized && entry.appUser.active);
  return mapping?.appUserId || chat.settings.userId;
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
  const actorUserId = mappedTelegramUserId(chat, message.from?.username);

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

    const itemDialogueAnswer = await handleItemCreationImage(actorUserId, imageUrl);
    const answer: string =
      itemDialogueAnswer ??
      (await prisma.media
        .create({
          data: {
            ownerId: actorUserId,
            title: caption || `Telegram Bild ${formatDateTime(new Date())}`,
            kind: "IMAGE",
            url: imageUrl,
            visibility: "PRIVATE"
          }
        })
        .then((media) => `Bild in Medien gespeichert: ${media.title}`));

    await sendTelegramMessage(chat.settings.telegramBotTokenEnc, chatId, threadId, answer, { parseMode: "HTML", disableWebPagePreview: true });
    await prisma.message.create({ data: { senderId: actorUserId, body: `Telegram-Agent: ${answer}` } });
    await prisma.telegramChat.update({ where: { id: chat.id }, data: { lastMessageAt: new Date() } });
    return NextResponse.json({ ok: true });
  }

  let body = message.text || message.caption || "";
  if (!body && message.voice?.file_id) {
    body = await transcribeTelegramVoice(chat.settings.telegramBotTokenEnc, chat.settings.openAiApiKeyEnc, message.voice.file_id);
  }
  if (body) {
    await prisma.message.create({ data: { senderId: actorUserId, body: `Telegram: ${body}` } });
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
  }
  await prisma.telegramChat.update({ where: { id: chat.id }, data: { lastMessageAt: new Date() } });
  return NextResponse.json({ ok: true });
}
