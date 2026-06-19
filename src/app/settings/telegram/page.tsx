import { redirect } from "next/navigation";
import { BellRing, Check, Globe2, Save, Send, Trash2, UserRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Button, Field, inputClass, PageGuide, PageHeader, Panel, selectClass } from "@/components/ui";
import { TelegramChatDiscovery } from "@/components/telegram/chat-discovery";
import { currentUser } from "@/lib/auth";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { formatDateTime } from "@/lib/dates";
import { actionLabel, defaultNotificationTemplate, knownAuditActions } from "@/lib/notification-actions";
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

function normalizeTelegramUsername(value: string) {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

function secretSuffix(value?: string | null) {
  try {
    const decrypted = decryptSecret(value);
    if (!decrypted) return "";
    return decrypted.slice(-6);
  } catch {
    return "";
  }
}

function readSecret(value?: string | null) {
  try {
    return decryptSecret(value);
  } catch {
    return "";
  }
}

async function readTelegramBotName(value?: string | null) {
  const token = readSecret(value);
  if (!token) return null;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      cache: "no-store"
    });
    const payload = await response.json() as {
      ok?: boolean;
      result?: { first_name?: string; username?: string };
    };
    if (!payload.ok || !payload.result) return null;
    const username = payload.result.username ? `@${payload.result.username}` : "";
    return [payload.result.first_name, username].filter(Boolean).join(" ");
  } catch {
    return null;
  }
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
  redirect("/settings/telegram?saved=secrets");
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

async function createTelegramUserMapping(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  if (!settings) redirect("/settings/telegram");
  const telegramUserId = String(formData.get("telegramUserId") || "").trim() || null;
  const telegramUsernameRaw = normalizeTelegramUsername(String(formData.get("telegramUsername") || ""));
  const telegramUsername = telegramUsernameRaw || (telegramUserId ? `id:${telegramUserId}` : "");
  const appUserId = String(formData.get("appUserId") || "");
  if (!telegramUsername || !appUserId) redirect("/settings/telegram");
  const appUser = await prisma.user.findFirst({
    where: {
      id: appUserId,
      active: true,
      ...(user.role === "ADMIN" ? {} : { OR: [{ id: user.id }, ...(user.circleId ? [{ circleId: user.circleId }] : [])] })
    },
    select: { id: true }
  });
  if (!appUser) redirect("/settings/telegram");
  await prisma.telegramUserMapping.upsert({
    where: { settingsId_telegramUsername: { settingsId: settings.id, telegramUsername } },
    update: { appUserId: appUser.id, telegramUserId },
    create: { settingsId: settings.id, telegramUsername, telegramUserId, appUserId: appUser.id }
  });
  redirect("/settings/telegram#mappings");
}

async function deleteTelegramUserMapping(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  if (!settings) redirect("/settings/telegram");
  await prisma.telegramUserMapping.deleteMany({
    where: { id: String(formData.get("mappingId") || ""), settingsId: settings.id }
  });
  redirect("/settings/telegram#mappings");
}

async function createNotificationRule(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/settings/telegram");
  const settings = await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id }
  });
  const action = String(formData.get("action") || "").trim();
  const message = String(formData.get("message") || "").trim();
  const targetData = await readTargetData(user, formData);
  if (!action || !message || (!targetData.targetUserId && !targetData.targetCircleId)) redirect("/settings/telegram#notifications");
  await prisma.telegramNotificationRule.create({
    data: {
      settingsId: settings.id,
      action,
      message,
      ...targetData
    }
  });
  redirect("/settings/telegram#notifications");
}

async function updateNotificationRule(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/settings/telegram");
  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  if (!settings) redirect("/settings/telegram#notifications");
  const id = String(formData.get("ruleId") || "");
  const action = String(formData.get("action") || "").trim();
  const message = String(formData.get("message") || "").trim();
  const targetData = await readTargetData(user, formData);
  if (!id || !action || !message || (!targetData.targetUserId && !targetData.targetCircleId)) redirect("/settings/telegram#notifications");
  await prisma.telegramNotificationRule.updateMany({
    where: { id, settingsId: settings.id },
    data: {
      action,
      message,
      active: formData.get("active") === "on",
      ...targetData
    }
  });
  redirect("/settings/telegram#notifications");
}

async function deleteNotificationRule(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/settings/telegram");
  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  if (!settings) redirect("/settings/telegram#notifications");
  await prisma.telegramNotificationRule.deleteMany({
    where: { id: String(formData.get("ruleId") || ""), settingsId: settings.id }
  });
  redirect("/settings/telegram#notifications");
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
  targetCircleId,
  allowNone = true
}: {
  users: TelegramTargetUser[];
  circles: TelegramTargetCircle[];
  targetType?: string;
  targetUserId?: string | null;
  targetCircleId?: string | null;
  allowNone?: boolean;
}) {
  return (
    <>
      <Field label="Ziel">
        <select className={selectClass} name="targetType" defaultValue={targetType || (allowNone ? "none" : "user")}>
          {allowNone ? <option value="none">Kein spezielles Ziel</option> : null}
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

export default async function TelegramPage({ searchParams }: { searchParams?: { saved?: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const [settings, targetUsers, targetCircles, auditActions] = await Promise.all([
    prisma.userSettings.findUnique({
      where: { userId: user.id },
      include: {
        telegramChats: {
          include: { targetUser: { include: { profile: true } }, targetCircle: true },
          orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
        },
        telegramUserMappings: {
          include: { appUser: { include: { profile: true } } },
          orderBy: { telegramUsername: "asc" }
        },
        telegramKnownUsers: { orderBy: { lastMessageAt: "desc" } },
        telegramNotificationRules: {
          include: { targetUser: { include: { profile: true } }, targetCircle: true },
          orderBy: [{ active: "desc" }, { action: "asc" }]
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
    }),
    prisma.auditLog.findMany({
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" }
    })
  ]);
  const activeChats = settings?.telegramChats.filter((chat) => chat.status === "ACTIVE") || [];
  const pendingChats = settings?.telegramChats.filter((chat) => chat.status === "PENDING") || [];
  const mappings = settings?.telegramUserMappings || [];
  const knownUsers = settings?.telegramKnownUsers || [];
  const notificationRules = settings?.telegramNotificationRules || [];
  const actionOptions = Array.from(new Set([...knownAuditActions.map(([action]) => action), ...auditActions.map((entry) => entry.action)])).sort((a, b) => actionLabel(a).localeCompare(actionLabel(b)));
  const telegramTokenSuffix = secretSuffix(settings?.telegramBotTokenEnc);
  const openAiKeySuffix = secretSuffix(settings?.openAiApiKeyEnc);
  const telegramBotName = await readTelegramBotName(settings?.telegramBotTokenEnc);
  return (
    <AppShell>
      <PageHeader title="Telegram" />
      <PageGuide title="Bot, Chats und Voice-Transkription verbinden">
        Hier verbindest du Telegram mit dem Portal. Speichere Bot-Token und OpenAI-Key, lies Chats ein, uebernimm Chat-ID und Thread-ID und setze den Webhook, damit der Bot Nachrichten, Bilder und Aktionen verarbeiten kann.
      </PageGuide>
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Panel>
          <h2 className="mb-4 text-lg font-semibold">Zugangsdaten</h2>
          {searchParams?.saved === "secrets" ? <p className="mb-4 rounded-md bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Zugangsdaten gespeichert.</p> : null}
          <form action={saveSettings} className="space-y-4">
            <Field label="Telegram Bot API-Key">
              <input className={inputClass} name="telegramBotToken" type="password" placeholder={telegramTokenSuffix ? `Gespeichert ...${telegramTokenSuffix}` : ""} />
              {telegramTokenSuffix ? (
                <p className="mt-2 rounded-md bg-surface px-3 py-2 text-sm text-graphite">
                  Aktiver Bot: <strong className="text-ink">{telegramBotName || "Token gespeichert, Bot-Name nicht abrufbar"}</strong> · endet auf <strong className="text-ink">...{telegramTokenSuffix}</strong>
                </p>
              ) : null}
            </Field>
            <Field label="OpenAI API-Key fuer Voice-Transkription">
              <input className={inputClass} name="openAiApiKey" type="password" placeholder={openAiKeySuffix ? `Gespeichert ...${openAiKeySuffix}` : ""} />
              {openAiKeySuffix ? (
                <p className="mt-2 rounded-md bg-surface px-3 py-2 text-sm text-graphite">
                  KI-Key gespeichert · endet auf <strong className="text-ink">...{openAiKeySuffix}</strong>
                </p>
              ) : null}
            </Field>
            <SubmitButton pendingLabel="Speichert..."><Save className="h-4 w-4" /> Sicher speichern</SubmitButton>
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
                  <div className="mt-3 rounded-md bg-surface p-3">
                    <div className="font-semibold text-ink">Letzte erkannte Testnachricht</div>
                    <div className="mt-1 text-graphite">{chat.lastMessageText || "Keine Textvorschau gespeichert."}</div>
                    <div className="mt-1 text-xs text-graphite">Von: {chat.lastMessageFrom || "-"} · Erkannt: {formatDateTime(chat.lastMessageAt)}</div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action={activateDetectedChat}>
                      <input type="hidden" name="chatId" value={chat.id} />
                      <input type="hidden" name="scope" value="thread" />
                      <input type="hidden" name="targetType" value="user" />
                      <input type="hidden" name="targetUserId" value={user.id} />
                      <Button type="submit" variant="secondary"><Check className="h-4 w-4" /> Nur diesen Thread aktivieren</Button>
                    </form>
                    {!chat.threadId ? (
                      <form action={activateDetectedChat}>
                        <input type="hidden" name="chatId" value={chat.id} />
                        <input type="hidden" name="scope" value="chat" />
                        <input type="hidden" name="targetType" value="user" />
                        <input type="hidden" name="targetUserId" value={user.id} />
                        <Button type="submit"><Globe2 className="h-4 w-4" /> Ganzen Chat aktivieren</Button>
                      </form>
                    ) : null}
                    <form action={deleteChat}>
                      <input type="hidden" name="chatIdInternal" value={chat.id} />
                      <Button variant="danger"><Trash2 className="h-4 w-4" /> Erkennung loeschen</Button>
                    </form>
                  </div>
                </div>
              ))}
              {!pendingChats.length ? <p className="text-sm text-graphite">Keine neuen Chats oder Threads erkannt.</p> : null}
            </div>
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
                    <div className="mb-4 rounded-md bg-surface p-3">
                      <div className="font-semibold text-ink">Letzte erkannte Testnachricht</div>
                      <div className="mt-1 text-graphite">{chat.lastMessageText || "Keine Textvorschau gespeichert."}</div>
                      <div className="mt-1 text-xs text-graphite">Von: {chat.lastMessageFrom || "-"} · Erkannt: {formatDateTime(chat.lastMessageAt)}</div>
                    </div>
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
            <h2 id="mappings" className="mb-4 flex items-center gap-2 text-lg font-semibold"><UserRound className="h-5 w-5 text-redbrand" /> Telegram-Benutzer zuordnen</h2>
            <form action={createTelegramUserMapping} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Field label="Telegram Username">
                <input className={inputClass} name="telegramUsername" placeholder="@telegramname" required />
              </Field>
              <Field label="App-Benutzer">
                <select className={selectClass} name="appUserId" required>
                  {targetUsers.map((entry) => <option key={entry.id} value={entry.id}>{userLabel(entry)}</option>)}
                </select>
              </Field>
              <Button><Save className="h-4 w-4" /> Zuordnen</Button>
            </form>
            <div className="mt-5">
              <h3 className="mb-3 text-sm font-semibold text-ink">Erkannte Telegram-Benutzer</h3>
              <div className="space-y-2">
                {knownUsers.map((known) => {
                  const display = known.telegramUsername ? `@${known.telegramUsername}` : `ID ${known.telegramUserId}`;
                  const name = [known.firstName, known.lastName].filter(Boolean).join(" ");
                  const mapped = mappings.find((entry) => entry.telegramUserId === known.telegramUserId || (known.telegramUsername && entry.telegramUsername === known.telegramUsername));
                  return (
                    <form key={known.id} action={createTelegramUserMapping} className="grid gap-3 rounded-md border border-line bg-paper p-3 text-sm sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                      <input type="hidden" name="telegramUserId" value={known.telegramUserId} />
                      <input type="hidden" name="telegramUsername" value={known.telegramUsername || ""} />
                      <div>
                        <div className="font-semibold text-ink">{display}</div>
                        <div className="text-xs text-graphite">{name || "Name unbekannt"} · ID {known.telegramUserId}</div>
                        <div className="text-xs text-graphite">Zuletzt: {formatDateTime(known.lastMessageAt)}</div>
                      </div>
                      <Field label="App-Benutzer">
                        <select className={selectClass} name="appUserId" defaultValue={mapped?.appUserId || targetUsers[0]?.id || ""} required>
                          {targetUsers.map((entry) => <option key={entry.id} value={entry.id}>{userLabel(entry)}</option>)}
                        </select>
                      </Field>
                      <Button><Save className="h-4 w-4" /> {mapped ? "Aendern" : "Zuordnen"}</Button>
                    </form>
                  );
                })}
                {!knownUsers.length ? <p className="rounded-md border border-dashed border-line bg-paper p-4 text-sm text-graphite">Noch keine Telegram-Benutzer erkannt. Sobald jemand im aktiven Thread schreibt, erscheint der Benutzer hier.</p> : null}
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {mappings.map((mapping) => (
                <div key={mapping.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-paper p-3 text-sm">
                  <div>
                    <strong>{mapping.telegramUsername.startsWith("id:") ? `ID ${mapping.telegramUserId || mapping.telegramUsername.slice(3)}` : `@${mapping.telegramUsername}`}</strong>
                    {mapping.telegramUserId ? <span className="ml-2 text-xs text-graphite">ID {mapping.telegramUserId}</span> : null}
                    <span className="mx-2 text-graphite">{"->"}</span>
                    <span>{userLabel(mapping.appUser)}</span>
                  </div>
                  <form action={deleteTelegramUserMapping}>
                    <input type="hidden" name="mappingId" value={mapping.id} />
                    <Button variant="danger"><Trash2 className="h-4 w-4" /> Loeschen</Button>
                  </form>
                </div>
              ))}
              {!mappings.length ? <p className="text-sm text-graphite">Noch keine Telegram-Benutzer zugeordnet.</p> : null}
            </div>
          </Panel>
          {user.role === "ADMIN" ? (
            <Panel>
              <h2 id="notifications" className="mb-4 flex items-center gap-2 text-lg font-semibold"><BellRing className="h-5 w-5 text-redbrand" /> Aktions-Benachrichtigungen</h2>
              <p className="mb-4 text-sm leading-6 text-graphite">
                Waehle eine protokollierte Aktion, ein Telegram-Ziel und eine HTML-Nachricht. Wenn die Aktion im Portal passiert, wird die Nachricht an aktive Kanaele geschickt, die diesem Benutzer oder Kreis zugeordnet sind.
              </p>
              <form action={createNotificationRule} className="space-y-4 rounded-lg border border-line bg-paper p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Aktion">
                    <select className={selectClass} name="action" required>
                      {actionOptions.map((action) => <option key={action} value={action}>{actionLabel(action)}</option>)}
                    </select>
                  </Field>
                  <TargetFields users={targetUsers} circles={targetCircles} allowNone={false} />
                </div>
                <Field label="Telegram-Nachricht als HTML">
                  <textarea className={inputClass} name="message" rows={5} defaultValue={defaultNotificationTemplate()} required />
                </Field>
                <p className="text-xs text-graphite">Variablen: {"{title}"}, {"{actor}"}, {"{event}"}, {"{action}"}, {"{url}"}, {"{details}"}</p>
                <SubmitButton pendingLabel="Regel wird gespeichert..."><Save className="h-4 w-4" /> Regel anlegen</SubmitButton>
              </form>
              <div className="mt-5 space-y-3">
                {notificationRules.map((rule) => (
                  <details key={rule.id} className="rounded-md border border-line bg-paper p-3">
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0">
                        <strong className="block truncate">{actionLabel(rule.action)}</strong>
                        <span className="mt-1 block text-sm text-graphite">
                          Ziel: {rule.targetCircle ? `Kreis ${rule.targetCircle.name}` : rule.targetUser ? userLabel(rule.targetUser) : "-"}
                        </span>
                      </span>
                      <Badge tone={rule.active ? "green" : "neutral"}>{rule.active ? "aktiv" : "inaktiv"}</Badge>
                    </summary>
                    <form action={updateNotificationRule} className="mt-4 space-y-4 border-t border-line pt-4">
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Aktion">
                          <select className={selectClass} name="action" defaultValue={rule.action} required>
                            {actionOptions.map((action) => <option key={action} value={action}>{actionLabel(action)}</option>)}
                          </select>
                        </Field>
                        <TargetFields users={targetUsers} circles={targetCircles} targetType={targetTypeFor(rule)} targetUserId={rule.targetUserId} targetCircleId={rule.targetCircleId} allowNone={false} />
                      </div>
                      <Field label="Telegram-Nachricht als HTML">
                        <textarea className={inputClass} name="message" rows={5} defaultValue={rule.message} required />
                      </Field>
                      <label className="flex items-center gap-2 text-sm text-graphite">
                        <input name="active" type="checkbox" defaultChecked={rule.active} className="h-4 w-4 accent-redbrand" />
                        aktiv
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <SubmitButton pendingLabel="Regel wird gespeichert..."><Save className="h-4 w-4" /> Regel speichern</SubmitButton>
                      </div>
                    </form>
                    <form action={deleteNotificationRule} className="mt-3">
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <Button variant="danger"><Trash2 className="h-4 w-4" /> Regel loeschen</Button>
                    </form>
                  </details>
                ))}
                {!notificationRules.length ? <p className="rounded-md border border-dashed border-line bg-paper p-4 text-sm text-graphite">Noch keine aktionsbasierten Telegram-Regeln angelegt.</p> : null}
              </div>
            </Panel>
          ) : null}
          <Panel>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Send className="h-5 w-5 text-redbrand" /> Voice-Verarbeitung</h2>
            <p className="text-sm leading-6 text-graphite">Voice-Nachrichten werden nach Aktivierung des Telegram-Pollings heruntergeladen, mit dem gespeicherten OpenAI-Key transkribiert und danach wie normale Textnachrichten verarbeitet.</p>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
