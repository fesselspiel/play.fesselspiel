import { redirect } from "next/navigation";
import { Check, Globe2, Save, Search, Send, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, Button, Field, inputClass, PageGuide, PageHeader, Panel, selectClass } from "@/components/ui";
import { TelegramChatDiscovery } from "@/components/telegram/chat-discovery";
import { currentUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

type TelegramTargetUser = {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  profile: { displayName: string | null } | null;
};

type TelegramTargetCircle = {
  id: string;
  name: string;
};

function userLabel(user: TelegramTargetUser) {
  return user.profile?.displayName || user.name || user.username || user.email;
}

async function readTargetData(user: Awaited<ReturnType<typeof currentUser>>, formData: FormData) {
  if (!user) return { targetUserId: null, targetCircleId: null };
  const targetType = String(formData.get("targetType") || "none");
  if (targetType === "user") {
    const targetUserId = String(formData.get("targetUserId") || "");
    const targetUser = targetUserId
      ? await prisma.user.findFirst({
          where: {
            id: targetUserId,
            active: true,
            ...(user.role === "ADMIN" ? {} : { OR: [{ id: user.id }, ...(user.circleId ? [{ circleId: user.circleId }] : [])] })
          },
          select: { id: true }
        })
      : null;
    return { targetUserId: targetUser?.id || null, targetCircleId: null };
  }
  if (targetType === "circle") {
    const targetCircleId = String(formData.get("targetCircleId") || "");
    const targetCircle = targetCircleId
      ? await prisma.circle.findFirst({
          where: {
            id: targetCircleId,
            ...(user.role === "ADMIN" ? {} : user.circleId ? { id: user.circleId } : { id: "__none__" })
          },
          select: { id: true }
        })
      : null;
    return { targetUserId: null, targetCircleId: targetCircle?.id || null };
  }
  return { targetUserId: null, targetCircleId: null };
}

function targetTypeFor(chat: { targetUserId: string | null; targetCircleId: string | null }) {
  if (chat.targetUserId) return "user";
  if (chat.targetCircleId) return "circle";
  return "none";
}

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
  const targetData = await readTargetData(user, formData);
  const existing = await prisma.telegramChat.findFirst({ where: { settingsId: settings.id, chatId, threadId } });
  if (existing) {
    await prisma.telegramChat.update({ where: { id: existing.id }, data: { title: String(formData.get("title") || "").trim(), status: "ACTIVE", ...targetData } });
  } else {
    await prisma.telegramChat.create({
      data: {
        settingsId: settings.id,
        ...targetData,
        chatId,
        threadId,
        title: String(formData.get("title") || "").trim(),
        status: "ACTIVE"
      }
    });
  }
  redirect("/settings/telegram");
}

async function updateChat(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  if (!settings) redirect("/settings/telegram");
  const chat = await prisma.telegramChat.findFirst({
    where: { id: String(formData.get("chatIdInternal") || ""), settingsId: settings.id }
  });
  if (!chat) redirect("/settings/telegram");
  const targetData = await readTargetData(user, formData);
  await prisma.telegramChat.update({
    where: { id: chat.id },
    data: {
      title: String(formData.get("title") || "").trim(),
      chatId: String(formData.get("chatId") || "").trim(),
      threadId: String(formData.get("threadId") || "") || null,
      status: String(formData.get("status") || "ACTIVE") as "ACTIVE" | "DISABLED" | "PENDING",
      ...targetData
    }
  });
  redirect("/settings/telegram");
}

async function deleteChat(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  if (!settings) redirect("/settings/telegram");
  const chat = await prisma.telegramChat.findFirst({
    where: { id: String(formData.get("chatIdInternal") || ""), settingsId: settings.id }
  });
  if (chat) await prisma.telegramChat.delete({ where: { id: chat.id } });
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
  const targetData = await readTargetData(user, formData);
  if (scope === "chat") {
    const existingWholeChat = await prisma.telegramChat.findFirst({
      where: { settingsId: settings.id, chatId: chat.chatId, threadId: null }
    });
    if (existingWholeChat) {
      await prisma.telegramChat.update({
        where: { id: existingWholeChat.id },
        data: { title: chat.title || existingWholeChat.title, status: "ACTIVE", lastMessageAt: new Date(), ...targetData }
      });
    } else {
      await prisma.telegramChat.create({
        data: {
          settingsId: settings.id,
          ...targetData,
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
      data: { status: "ACTIVE", lastMessageAt: new Date(), ...targetData }
    });
  }
  redirect("/settings/telegram");
}

function TargetFields({
  users,
  circles,
  targetType,
  targetUserId,
  targetCircleId
}: {
  users: TelegramTargetUser[];
  circles: TelegramTargetCircle[];
  targetType?: string;
  targetUserId?: string | null;
  targetCircleId?: string | null;
}) {
  return (
    <>
      <Field label="Ziel">
        <select className={selectClass} name="targetType" defaultValue={targetType || "none"}>
          <option value="none">Kein spezielles Ziel</option>
          <option value="user">Ein Benutzer</option>
          <option value="circle">Ganzer Kreis</option>
        </select>
      </Field>
      <Field label="Ziel-Benutzer">
        <select className={selectClass} name="targetUserId" defaultValue={targetUserId || ""}>
          <option value="">-</option>
          {users.map((entry) => <option key={entry.id} value={entry.id}>{userLabel(entry)}</option>)}
        </select>
      </Field>
      <Field label="Ziel-Kreis">
        <select className={selectClass} name="targetCircleId" defaultValue={targetCircleId || ""}>
          <option value="">-</option>
          {circles.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </Field>
    </>
  );
}

export default async function TelegramPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const [settings, targetUsers, targetCircles] = await Promise.all([
    prisma.userSettings.findUnique({
      where: { userId: user.id },
      include: {
        telegramChats: {
          include: { targetUser: { include: { profile: true } }, targetCircle: true },
          orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
        }
      }
    }),
    prisma.user.findMany({
      where: {
        active: true,
        ...(user.role === "ADMIN" ? {} : { OR: [{ id: user.id }, ...(user.circleId ? [{ circleId: user.circleId }] : [])] })
      },
      include: { profile: true },
      orderBy: [{ name: "asc" }, { email: "asc" }]
    }),
    prisma.circle.findMany({
      where: user.role === "ADMIN" ? {} : user.circleId ? { id: user.circleId } : { id: "__none__" },
      orderBy: { name: "asc" }
    })
  ]);
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
                      <input type="hidden" name="targetType" value="user" />
                      <input type="hidden" name="targetUserId" value={user.id} />
                      <Button type="submit" variant="secondary"><Check className="h-4 w-4" /> Nur diesen Thread aktivieren</Button>
                    </form>
                    <form action={activateDetectedChat}>
                      <input type="hidden" name="chatId" value={chat.id} />
                      <input type="hidden" name="scope" value="chat" />
                      <input type="hidden" name="targetType" value="user" />
                      <input type="hidden" name="targetUserId" value={user.id} />
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
              <TargetFields users={targetUsers} circles={targetCircles} targetType="user" targetUserId={user.id} />
              <div className="flex items-end gap-2">
                <Button><Search className="h-4 w-4" /> Uebernehmen</Button>
              </div>
            </form>
          </Panel>
          <Panel>
            <h2 className="mb-4 text-lg font-semibold">Aktive Kanaele</h2>
            <div className="space-y-3">
              {activeChats.map((chat) => (
                <details key={chat.id} className="rounded-md border border-line bg-paper p-3 text-sm">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">
                      <strong className="block truncate">{chat.title || chat.chatId}</strong>
                      <span className="mt-1 block text-graphite">Chat-ID: {chat.chatId} · Thread-ID: {chat.threadId || "-"}</span>
                      <span className="mt-1 block text-graphite">
                        Ziel: {chat.targetCircle ? `Kreis ${chat.targetCircle.name}` : chat.targetUser ? userLabel(chat.targetUser) : "kein spezielles Ziel"}
                      </span>
                    </span>
                    <Badge tone="green">aktiv</Badge>
                  </summary>
                  <div className="mt-4 border-t border-line pt-4">
                    <form action={updateChat} className="grid gap-3 sm:grid-cols-2">
                      <input type="hidden" name="chatIdInternal" value={chat.id} />
                      <Field label="Titel"><input className={inputClass} name="title" defaultValue={chat.title || ""} /></Field>
                      <Field label="Status">
                        <select className={selectClass} name="status" defaultValue={chat.status}>
                          <option value="ACTIVE">aktiv</option>
                          <option value="DISABLED">deaktiviert</option>
                          <option value="PENDING">wartet</option>
                        </select>
                      </Field>
                      <Field label="Chat-ID"><input className={inputClass} name="chatId" defaultValue={chat.chatId} required /></Field>
                      <Field label="Thread-ID optional"><input className={inputClass} name="threadId" defaultValue={chat.threadId || ""} /></Field>
                      <TargetFields users={targetUsers} circles={targetCircles} targetType={targetTypeFor(chat)} targetUserId={chat.targetUserId} targetCircleId={chat.targetCircleId} />
                      <div className="flex items-end">
                        <Button><Save className="h-4 w-4" /> Kanal speichern</Button>
                      </div>
                    </form>
                    <form action={deleteChat} className="mt-3">
                      <input type="hidden" name="chatIdInternal" value={chat.id} />
                      <Button variant="danger"><Trash2 className="h-4 w-4" /> Kanal loeschen</Button>
                    </form>
                  </div>
                </details>
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
