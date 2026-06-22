import OpenAI from "openai";
import { decryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";

type TelegramFile = { ok: boolean; result?: { file_path?: string } };

type TelegramPhotoSize = {
  file_id: string;
  file_unique_id?: string;
  width: number;
  height: number;
  file_size?: number;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_message?: TelegramMessage;
};

export type TelegramMessage = {
    message_id: number;
    date?: number;
    message_thread_id?: number;
    text?: string;
    caption?: string;
    photo?: TelegramPhotoSize[];
    document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
    voice?: { file_id: string; mime_type?: string };
    forum_topic_created?: { name?: string };
    reply_to_message?: { forum_topic_created?: { name?: string } };
    chat: { id: number; title?: string; username?: string; type?: string };
    from?: { id?: number; first_name?: string; last_name?: string; username?: string };
};

export type TelegramChatCandidate = {
  updateId: number;
  messageId: number;
  chatId: string;
  threadId: string | null;
  title: string;
  chatTitle: string;
  threadTitle: string | null;
  chatType: string;
  from: string;
  fromId: string | null;
  fromUsername: string | null;
  fromFirstName: string | null;
  fromLastName: string | null;
  text: string;
  createdAt: string;
};

function telegramUrl(token: string, method: string) {
  return `https://api.telegram.org/bot${token}/${method}`;
}

export async function getTelegramUpdates(tokenEnc: string) {
  const token = decryptSecret(tokenEnc);
  const response = await fetch(telegramUrl(token, "getUpdates"));
  if (!response.ok) {
    const details = await response.text();
    throw new Error(details || "Telegram Updates konnten nicht geladen werden");
  }
  return (await response.json()) as { ok: boolean; result: TelegramUpdate[] };
}

export async function getTelegramWebhookInfo(tokenEnc: string) {
  const token = decryptSecret(tokenEnc);
  const response = await fetch(telegramUrl(token, "getWebhookInfo"));
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function setTelegramWebhook(tokenEnc: string, url: string) {
  const token = decryptSecret(tokenEnc);
  const response = await fetch(telegramUrl(token, "setWebhook"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, allowed_updates: ["message", "edited_message", "channel_post"] })
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function deleteTelegramWebhook(tokenEnc: string) {
  const token = decryptSecret(tokenEnc);
  const response = await fetch(telegramUrl(token, "deleteWebhook"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ drop_pending_updates: false })
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export function toChatCandidate(update: TelegramUpdate): TelegramChatCandidate | null {
  const message = update.message || update.channel_post || update.edited_message;
  if (!message) return null;
  const chatTitle = message.chat.title || message.chat.username || String(message.chat.id);
  const threadTitle = message.forum_topic_created?.name || message.reply_to_message?.forum_topic_created?.name || null;
  return {
    updateId: update.update_id,
    messageId: message.message_id,
    chatId: String(message.chat.id),
    threadId: message.message_thread_id ? String(message.message_thread_id) : null,
    title: threadTitle || chatTitle,
    chatTitle,
    threadTitle,
    chatType: message.chat.type || "unknown",
    from: message.from?.username || message.from?.first_name || "",
    fromId: message.from?.id ? String(message.from.id) : null,
    fromUsername: message.from?.username || null,
    fromFirstName: message.from?.first_name || null,
    fromLastName: message.from?.last_name || null,
    text: message.text || message.caption || (message.voice ? "Sprachnachricht" : message.photo?.length || message.document ? "Datei" : ""),
    createdAt: message.date ? new Date(message.date * 1000).toISOString() : new Date().toISOString()
  };
}

export function telegramHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function telegramLink(url: string, label: string) {
  return `<a href="${telegramHtml(url)}">${telegramHtml(label)}</a>`;
}

function normalizeOutgoingTelegramText(text: string, parseMode?: "HTML") {
  const normalized = text.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
  return parseMode === "HTML" ? normalized.replace(/<br\s*\/?>/gi, "\n") : normalized;
}

export async function sendTelegramMessage(
  tokenEnc: string,
  chatId: string,
  threadId: string | null | undefined,
  text: string,
  options: { parseMode?: "HTML"; disableWebPagePreview?: boolean } = {}
) {
  const token = decryptSecret(tokenEnc);
  const body: Record<string, unknown> = { chat_id: chatId, text: normalizeOutgoingTelegramText(text, options.parseMode) };
  if (threadId) body.message_thread_id = Number(threadId);
  if (options.parseMode) body.parse_mode = options.parseMode;
  if (options.disableWebPagePreview !== undefined) body.disable_web_page_preview = options.disableWebPagePreview;
  const response = await fetch(telegramUrl(token, "sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok && options.parseMode) {
    const fallbackBody = { ...body };
    delete fallbackBody.parse_mode;
    const fallback = await fetch(telegramUrl(token, "sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fallbackBody)
    });
    if (!fallback.ok) throw new Error("Telegram Nachricht konnte nicht gesendet werden");
    return fallback.json();
  }
  if (!response.ok) throw new Error("Telegram Nachricht konnte nicht gesendet werden");
  return response.json();
}

export function largestTelegramPhoto(message: TelegramUpdate["message"]) {
  return message?.photo?.slice().sort((a, b) => (b.file_size || b.width * b.height) - (a.file_size || a.width * a.height))[0] || null;
}

export async function downloadTelegramFile(tokenEnc: string, fileId: string, fallbackName: string, fallbackMimeType: string) {
  const token = decryptSecret(tokenEnc);
  const fileResponse = await fetch(telegramUrl(token, `getFile?file_id=${encodeURIComponent(fileId)}`));
  if (!fileResponse.ok) throw new Error("Telegram Datei konnte nicht gefunden werden");
  const file = (await fileResponse.json()) as TelegramFile;
  const filePath = file.result?.file_path;
  if (!filePath) throw new Error("Telegram Datei ohne Pfad");

  const response = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!response.ok) throw new Error("Telegram Datei konnte nicht geladen werden");
  const bytes = Buffer.from(await response.arrayBuffer());
  const extension = filePath.split(".").pop();
  const originalName = fallbackName.includes(".") || !extension ? fallbackName : `${fallbackName}.${extension}`;
  return {
    bytes,
    originalName,
    mimeType: response.headers.get("content-type") || fallbackMimeType
  };
}

export async function transcribeTelegramVoice(tokenEnc: string, openAiKeyEnc: string | null | undefined, fileId: string) {
  const token = decryptSecret(tokenEnc);
  const openAiKey = decryptSecret(openAiKeyEnc) || env.openAiApiKey;
  if (!openAiKey) throw new Error("OpenAI API-Key fehlt");

  const fileResponse = await fetch(telegramUrl(token, `getFile?file_id=${encodeURIComponent(fileId)}`));
  if (!fileResponse.ok) throw new Error("Telegram Datei konnte nicht gefunden werden");
  const file = (await fileResponse.json()) as TelegramFile;
  const path = file.result?.file_path;
  if (!path) throw new Error("Telegram Datei ohne Pfad");

  const audioResponse = await fetch(`https://api.telegram.org/file/bot${token}/${path}`);
  if (!audioResponse.ok) throw new Error("Telegram Audio konnte nicht geladen werden");
  const audio = await audioResponse.blob();
  const client = new OpenAI({ apiKey: openAiKey });
  const transcription = await client.audio.transcriptions.create({
    file: new File([audio], "voice.ogg", { type: audio.type || "audio/ogg" }),
    model: env.openAiTranscriptionModel
  });
  return transcription.text;
}
