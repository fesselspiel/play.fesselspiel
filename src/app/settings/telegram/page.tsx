import { redirect } from "next/navigation";
import { Check, Globe2, Save, Search, Send } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, Button, Field, inputClass, PageGuide, PageHeader, Panel } from "@/components/ui";
import { TelegramChatDiscovery } from "@/components/telegram/chat-discovery";
import { currentUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

async function saveSettings(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: {
      telegramBotTokenEnc: encryptSecret(String(formData.get("telegramBotToken") || "")) || undefined,
      openAiApiKeyEnc: encryptSecret(String(formData.get("openAiApiKey") || "")) || undefined
    },
    create: {
      userId: user.id,
      telegramBotTokenEnc: encryptSecret(String(formData.get("telegramBotToken") || "")),
      openAiApiKeyEnc: encryptSecret(String(formData.get("openAiApiKey") || ""))
    }
  });
  redirect("/settings/telegram");
}

async function addChat(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const settings = await prisma.userSettings.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
  const chatId = String(formData.get("chatId"));
  const threadId = String(formData.get("threadId") || "") || null;
  const existing = await prisma.telegramChat.findFirst({ where: { settingsId: settings.id, chatId, threadId } });
  if (existing) {
    await prisma.telegramChat.update({ where: { id: existing.id }, data: { title: String(formData.get("title") || "").trim(), status: "ACTIVE" } });
  } else {
    await prisma.telegramChat.create({
      data: {
      settingsId: settings.id,
      chatId,
      threadId,
      title: String(formData.get("title") || "").trim(),
      status: "ACTIVE"
      }
    });
  }
  redirect("/settings/telegram");
}

async function activateDetectedChat(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  if (!settings) redirect("/settings/telegram");
  const chat = await prisma.telegramChat.findFirst({
    where: {
      id: String(formData.get("chatId") || ""),
      settingsId: settings.id
    }
  });
  if (!chat) redirect("/settings/telegram");
  const scope = String(formData.get("scope") || "thread");
  if (scope === "chat") {
    const existingWholeChat = await prisma.telegramChat.findFirst({
      where: { settingsId: settings.id, chatId: chat.chatId, threadId: null }
    });
    if (existingWholeChat) {
      await prisma.telegramChat.update({
        where: { id: existingWholeChat.id },
        data: { title: chat.title || existingWholeChat.title, status: "ACTIVE", lastMessageAt: new Date() }
      });
    } else {
      await prisma.telegramChat.create({
        data: {
          settingsId: settings.id,
          chatId: chat.chatId,
          threadId: null,
          title: chat.title,
          status: "ACTIVE",
          lastMessageAt: new Date()
        }
      });
    }
  } else {
    await prisma.telegramChat.update({
      where: { id: chat.id },
      data: { status: "ACTIVE", lastMessageAt: new Date() }
    });
  }
  redirect("/settings/telegram");
}

export default async function TelegramPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const settings = await prisma.userSettings.findUnique({
    where: { userId: user.id },
    include: { telegramChats: { orderBy: [{ status: "asc" }, { updatedAt: "desc" }] } }
  });
  const activeChats = settings?.telegramChats.filter((chat) => chat.status === "ACTIVE") || [];
  const activeWholeChatIds = new Set(activeChats.filter((chat) => !chat.threadId).map((chat) => chat.chatId));
  const pendingChats = settings?.telegramChats.filter((chat) => chat.status === "PENDING" && !activeWholeChatIds.has(chat.chatId)) || [];
  return (
    <AppShell>
      <PageHeader title="Telegram" />
      <PageGuide title="Bot, Chats und Voice-Transkription verbinden">
        Hier verbindest du Telegram mit dem Portal. Speichere Bot-Token und OpenAI-Key, lies Chats ein, uebernimm Chat-ID und Thread-ID und setze den Webhook, damit der Bot Nachrichten, Bilder und Aktionen verarbeiten kann.
      </PageGuide>
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Panel>
          <h2 className="mb-4 text-lg font-semibold">Zugangsdaten</h2>
          <form action={saveSettings} className="space-y-4">
            <Field label="Telegram Bot API-Key"><input className={inputClass} name="telegramBotToken" type="password" placeholder={settings?.telegramBotTokenEnc ? "Gespeichert" : ""} /></Field>
            <Field label="OpenAI API-Key fuer Voice-Transkription"><input className={inputClass} name="openAiApiKey" type="password" placeholder={settings?.openAiApiKeyEnc ? "Gespeichert" : ""} /></Field>
            <Button><Save className="h-4 w-4" /> Sicher speichern</Button>
          </form>
        </Panel>
        <div className="space-y-6">
          <Panel>
            <h2 className="mb-4 text-lg font-semibold">Chat bestaetigen</h2>
            <p className="mb-4 text-sm leading-6 text-graphite">Schreibe dem Bot eine Testnachricht im gewuenschten Chat oder Thread. Danach liest der Button die letzten Telegram-Updates aus und zeigt Chat-ID sowie Thread-ID an.</p>
            <TelegramChatDiscovery />
          </Panel>
          <Panel>
            <h2 className="mb-4 text-lg font-semibold">Erkannte Chats</h2>
            <div className="space-y-3">
              {pendingChats.map((chat) => (
                <div key={chat.id} className="rounded-md border border-line bg-paper p-3 text-sm">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div><span className="text-graphite">Titel:</span> {chat.title || chat.chatId}</div>
                    <div><span className="text-graphite">Status:</span> <Badge tone="neutral">wartet</Badge></div>
                    <div><span className="text-graphite">Chat-ID:</span> <strong>{chat.chatId}</strong></div>
                    <div><span className="text-graphite">Thread-ID:</span> <strong>{chat.threadId || "-"}</strong></div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action={activateDetectedChat}>
                      <input type="hidden" name="chatId" value={chat.id} />
                      <input type="hidden" name="scope" value="thread" />
                      <Button type="submit" variant="secondary"><Check className="h-4 w-4" /> Nur diesen Thread aktivieren</Button>
                    </form>
                    <form action={activateDetectedChat}>
                      <input type="hidden" name="chatId" value={chat.id} />
                      <input type="hidden" name="scope" value="chat" />
                      <Button type="submit"><Globe2 className="h-4 w-4" /> Ganzen Chat aktivieren</Button>
                    </form>
                  </div>
                </div>
              ))}
              {!pendingChats.length ? <p className="text-sm text-graphite">Keine neuen Chats oder Threads erkannt.</p> : null}
            </div>
          </Panel>
          <Panel>
            <h2 className="mb-4 text-lg font-semibold">Chat manuell speichern</h2>
            <form action={addChat} className="grid gap-3 sm:grid-cols-2">
              <Field label="Chat-ID"><input className={inputClass} name="chatId" required /></Field>
              <Field label="Thread-ID optional"><input className={inputClass} name="threadId" /></Field>
              <Field label="Titel"><input className={inputClass} name="title" placeholder="Privater Chat" /></Field>
              <div className="flex items-end gap-2">
                <Button><Search className="h-4 w-4" /> Uebernehmen</Button>
              </div>
            </form>
          </Panel>
          <Panel>
            <h2 className="mb-4 text-lg font-semibold">Aktive Kanaele</h2>
            <div className="space-y-2">
              {activeChats.map((chat) => (
                <div key={chat.id} className="flex items-center justify-between gap-3 rounded-md bg-paper p-3 text-sm">
                  <span>
                    {chat.title || chat.chatId}
                    <span className="ml-2 text-graphite">Chat-ID: {chat.chatId}</span>
                    <span className="ml-2 text-graphite">Thread-ID: {chat.threadId || "-"}</span>
                  </span>
                  <Badge tone={chat.status === "ACTIVE" ? "green" : "neutral"}>{chat.status.toLowerCase()}</Badge>
                </div>
              ))}
              {!activeChats.length ? <p className="text-sm text-graphite">Noch kein Chat bestaetigt.</p> : null}
            </div>
          </Panel>
          <Panel>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Send className="h-5 w-5 text-redbrand" /> Voice-Verarbeitung</h2>
            <p className="text-sm leading-6 text-graphite">Voice-Nachrichten werden nach Aktivierung des Telegram-Pollings heruntergeladen, mit dem gespeicherten OpenAI-Key transkribiert und danach wie normale Textnachrichten verarbeitet.</p>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
