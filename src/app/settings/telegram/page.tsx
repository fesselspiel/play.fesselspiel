import { redirect } from "next/navigation";
import { BellRing, Check, ChevronDown, Clock3, Globe2, MessageSquareText, Save, Send, Trash2, UserRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Button, Field, inputClass, PageGuide, PageHeader, Panel, selectClass } from "@/components/ui";
import { TelegramChatDiscovery } from "@/components/telegram/chat-discovery";
import { NotificationMessageField } from "@/components/telegram/notification-message-field";
import { NotificationTargetFields } from "@/components/telegram/notification-target-fields";
import { currentSessionContext, currentUser } from "@/lib/auth";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { appTimeZone, formatDate, formatDateTime } from "@/lib/dates";
import { env } from "@/lib/env";
import { requireFeature } from "@/lib/features";
import { actionLabel, defaultNotificationTemplate, knownAuditActions } from "@/lib/notification-actions";
import { prisma } from "@/lib/prisma";
import { getTelegramChatAdministrators, setTelegramWebhook } from "@/lib/telegram";
import { testTelegramNotificationRule } from "@/lib/telegram-notifications";

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

async function readOutputChatId(settingsId: string, formData: FormData) {
  const outputChatId = String(formData.get("outputChatId") || "").trim();
  if (!outputChatId) return null;
  const chat = await prisma.telegramChat.findFirst({
    where: { id: outputChatId, settingsId, status: "ACTIVE" },
    select: { id: true }
  });
  return chat?.id || null;
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

function telegramKnownUserSourceLabel(source?: string | null) {
  if (source === "ADMIN_SYNC") return "Admin-Abgleich";
  if (source === "MEMBER_UPDATE") return "Mitgliedsänderung";
  if (source === "MEMBER_SERVICE_MESSAGE") return "Mitglied hinzugefügt/entfernt";
  if (source === "BOT_MEMBER_UPDATE") return "Bot-Status";
  if (source === "CHAT_DISCOVERY") return "Chat einlesen";
  if (source === "PROTOCOL") return "Protokoll";
  return "Nachricht";
}

function telegramMembershipStatusLabel(status?: string | null) {
  if (status === "LEFT") return "nicht mehr in der Gruppe";
  if (status === "KICKED") return "entfernt";
  return "aktiv";
}

function readSecret(value?: string | null) {
  try {
    return decryptSecret(value);
  } catch {
    return "";
  }
}

async function currentAdminUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("telegram");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/");
  return user;
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
  const user = await currentAdminUser();
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
  const user = await currentAdminUser();
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
      title: String(formData.get("threadTitle") || "").trim() || null,
      chatTitle: String(formData.get("chatTitle") || "").trim() || null,
      threadTitle: String(formData.get("threadTitle") || "").trim() || null,
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
  const user = await currentAdminUser();
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
  const user = await currentAdminUser();
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
  const user = await currentAdminUser();
  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  if (!settings) redirect("/settings/telegram");
  await prisma.telegramUserMapping.deleteMany({
    where: { id: String(formData.get("mappingId") || ""), settingsId: settings.id }
  });
  redirect("/settings/telegram#mappings");
}

async function syncTelegramAdministrators() {
  "use server";
  const user = await currentAdminUser();
  const settings = await prisma.userSettings.findUnique({
    where: { userId: user.id },
    include: { telegramChats: { where: { status: "ACTIVE" }, orderBy: { updatedAt: "desc" } } }
  });
  if (!settings?.telegramBotTokenEnc) redirect("/settings/telegram?adminSyncFailed=token#mappings");
  const uniqueChats = Array.from(new Map(settings.telegramChats.map((chat) => [chat.chatId, chat])).values());
  let synced = 0;
  let failed = 0;
  for (const chat of uniqueChats) {
    try {
      const response = await getTelegramChatAdministrators(settings.telegramBotTokenEnc, chat.chatId);
      const admins = response.result || [];
      for (const admin of admins) {
        if (!admin.user.id || admin.user.is_bot) continue;
        await prisma.telegramKnownUser.upsert({
          where: { settingsId_telegramUserId: { settingsId: settings.id, telegramUserId: String(admin.user.id) } },
          update: {
            telegramUsername: admin.user.username ? admin.user.username.toLowerCase() : null,
            firstName: admin.user.first_name || null,
            lastName: admin.user.last_name || null,
            membershipStatus: "ACTIVE",
            source: "ADMIN_SYNC",
            lastChatId: chat.chatId,
            lastChatTitle: chat.chatTitle || chat.title || null,
            lastMessageAt: new Date()
          },
          create: {
            settingsId: settings.id,
            telegramUserId: String(admin.user.id),
            telegramUsername: admin.user.username ? admin.user.username.toLowerCase() : null,
            firstName: admin.user.first_name || null,
            lastName: admin.user.last_name || null,
            membershipStatus: "ACTIVE",
            source: "ADMIN_SYNC",
            lastChatId: chat.chatId,
            lastChatTitle: chat.chatTitle || chat.title || null,
            lastMessageAt: new Date()
          }
        });
        synced += 1;
      }
      await prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: "telegram_admins_synced",
          entityType: "telegram",
          title: "Telegram-Admins synchronisiert",
          details: {
            chatId: chat.chatId,
            chatTitle: chat.chatTitle || chat.title || null,
            count: admins.filter((admin) => !admin.user.is_bot).length
          }
        }
      });
    } catch (error) {
      failed += 1;
      await prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: "telegram_admin_sync_failed",
          entityType: "telegram",
          title: "Telegram-Admin-Abgleich fehlgeschlagen",
          details: {
            chatId: chat.chatId,
            chatTitle: chat.chatTitle || chat.title || null,
            error: error instanceof Error ? error.message.slice(0, 500) : "Unbekannter Fehler"
          }
        }
      });
    }
  }
  redirect(`/settings/telegram?adminSynced=${synced}&adminSyncFailed=${failed}#mappings`);
}

async function activateTelegramMemberDiscovery() {
  "use server";
  const user = await currentAdminUser();
  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  if (!settings?.telegramBotTokenEnc) redirect("/settings/telegram?memberDiscovery=missing-token#mappings");
  try {
    await setTelegramWebhook(settings.telegramBotTokenEnc, `${env.appUrl}/api/telegram/webhook`);
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "telegram_member_discovery_enabled",
        entityType: "telegram",
        title: "Telegram-Mitgliedserkennung aktiviert",
        details: {
          webhookUrl: `${env.appUrl}/api/telegram/webhook`,
          allowedUpdates: ["message", "edited_message", "channel_post", "chat_member", "my_chat_member"]
        }
      }
    });
    redirect("/settings/telegram?memberDiscovery=enabled#mappings");
  } catch (error) {
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "telegram_member_discovery_failed",
        entityType: "telegram",
        title: "Telegram-Mitgliedserkennung fehlgeschlagen",
        details: { error: error instanceof Error ? error.message.slice(0, 500) : "Unbekannter Fehler" }
      }
    });
    redirect("/settings/telegram?memberDiscovery=failed#mappings");
  }
}

async function createNotificationRule(formData: FormData) {
  "use server";
  const user = await currentAdminUser();
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/settings/telegram");
  const settings = await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id }
  });
  const action = String(formData.get("action") || "").trim();
  const message = String(formData.get("message") || "").trim();
  const targetData = await readTargetData(user, formData);
  const outputChatId = await readOutputChatId(settings.id, formData);
  if (!action || !message || (!targetData.targetUserId && !targetData.targetCircleId && !outputChatId)) redirect("/settings/telegram#notifications");
  await prisma.telegramNotificationRule.create({
    data: {
      settingsId: settings.id,
      action,
      message,
      outputChatId,
      ...targetData
    }
  });
  redirect("/settings/telegram#notifications");
}

async function updateNotificationRule(formData: FormData) {
  "use server";
  const user = await currentAdminUser();
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/settings/telegram");
  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  if (!settings) redirect("/settings/telegram#notifications");
  const id = String(formData.get("ruleId") || "");
  const action = String(formData.get("action") || "").trim();
  const message = String(formData.get("message") || "").trim();
  const targetData = await readTargetData(user, formData);
  const outputChatId = await readOutputChatId(settings.id, formData);
  if (!id || !action || !message || (!targetData.targetUserId && !targetData.targetCircleId && !outputChatId)) redirect("/settings/telegram#notifications");
  await prisma.telegramNotificationRule.updateMany({
    where: { id, settingsId: settings.id },
    data: {
      action,
      message,
      active: formData.get("active") === "on",
      outputChatId,
      ...targetData
    }
  });
  redirect("/settings/telegram#notifications");
}

async function deleteNotificationRule(formData: FormData) {
  "use server";
  const user = await currentAdminUser();
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/settings/telegram");
  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  if (!settings) redirect("/settings/telegram#notifications");
  await prisma.telegramNotificationRule.deleteMany({
    where: { id: String(formData.get("ruleId") || ""), settingsId: settings.id }
  });
  redirect("/settings/telegram#notifications");
}

async function testNotificationRule(formData: FormData) {
  "use server";
  const user = await currentAdminUser();
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/settings/telegram");
  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  if (!settings) redirect("/settings/telegram#notifications");
  const result = await testTelegramNotificationRule(String(formData.get("ruleId") || ""), settings.id, user.id);
  redirect(`/settings/telegram?testSent=${result.sent}&testFailed=${result.failed}#notifications`);
}

async function activateDetectedChat(formData: FormData) {
  "use server";
  const user = await currentAdminUser();
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
        data: {
          title: null,
          chatTitle: chat.chatTitle || chat.title || existingWholeChat.chatTitle || existingWholeChat.title,
          threadTitle: null,
          status: "ACTIVE",
          lastMessageAt: new Date(),
          ...targetData
        }
      });
    } else {
      await prisma.telegramChat.create({
        data: {
          settingsId: settings.id,
          ...targetData,
          chatId: chat.chatId,
          threadId: null,
          title: null,
          chatTitle: chat.chatTitle || chat.title,
          threadTitle: null,
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

function notificationUsers(users: TelegramTargetUser[]) {
  return users.map((entry) => ({ id: entry.id, label: userLabel(entry) }));
}

type TelegramChatOption = {
  id: string;
  chatId: string;
  threadId: string | null;
  title: string | null;
  chatTitle: string | null;
  threadTitle: string | null;
  targetCircle?: { name: string } | null;
  targetUser?: TelegramTargetUser | null;
};

function chatTitleLabel(chat: { title?: string | null; chatTitle?: string | null; chatId: string }) {
  const title = chat.chatTitle?.trim() || chat.title?.trim();
  if (title && title !== chat.chatId) return title;
  return "Chatname fehlt";
}

function threadNameLabel(chat: { title?: string | null; chatTitle?: string | null; threadTitle?: string | null; chatId: string; threadId: string | null }) {
  const title = chat.threadTitle?.trim() || chat.title?.trim();
  if (title && title !== chat.chatId && title !== chat.chatTitle) return title;
  return chat.threadId ? "Thread-Name fehlt" : "Hauptchat";
}

function chatLabel(chat: TelegramChatOption) {
  const target = chat.targetCircle ? `Kreis ${chat.targetCircle.name}` : chat.targetUser ? userLabel(chat.targetUser) : "ohne Ziel";
  return `${threadNameLabel(chat)} · ${chatTitleLabel(chat)} · Chat ${chat.chatId} · Thread ${chat.threadId || "-"} · ${target}`;
}

function detailText(details: unknown, key: string) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return "";
  const value = (details as Record<string, unknown>)[key];
  return value == null ? "" : String(value);
}

function actorLabel(user?: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null } | null) {
  return user?.profile?.displayName || user?.name || user?.username || user?.email || "System";
}

function hourLabel(value: Date) {
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: appTimeZone }).format(value);
}

function hourGroupLabel(value: Date) {
  return `${new Intl.DateTimeFormat("de-DE", { hour: "2-digit", timeZone: appTimeZone }).format(value)} Uhr`;
}

function dayKey(value: Date) {
  return new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: appTimeZone }).format(value);
}

function normalizeLoggedTelegramHtml(value: string) {
  const escaped = value
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  let html = escaped;
  for (const tag of ["b", "strong", "i", "em", "u", "s", "code", "pre"]) {
    html = html.replace(new RegExp(`&lt;${tag}&gt;`, "gi"), `<${tag}>`);
    html = html.replace(new RegExp(`&lt;/${tag}&gt;`, "gi"), `</${tag}>`);
  }
  html = html.replace(
    /&lt;a href=&quot;(https?:\/\/[^"&<>\s]+|\/[^"&<>\s]*)&quot;&gt;([\s\S]*?)&lt;\/a&gt;/gi,
    (_match, href: string, label: string) => `<a href="${href}" class="font-semibold text-redbrand underline decoration-redbrand/30 underline-offset-2">${label}</a>`
  );
  return html.replace(/\n/g, "<br />");
}

function telegramLogDayGroups<T extends { createdAt: Date }>(logs: T[]) {
  const days = new Map<string, { label: string; logs: T[] }>();
  for (const log of logs) {
    const key = dayKey(log.createdAt);
    const day = days.get(key) || { label: formatDate(log.createdAt), logs: [] };
    day.logs.push(log);
    days.set(key, day);
  }
  return Array.from(days.entries()).map(([key, day]) => {
    const hours = new Map<string, T[]>();
    for (const log of day.logs) {
      const hour = hourGroupLabel(log.createdAt);
      hours.set(hour, [...(hours.get(hour) || []), log]);
    }
    return { key, label: day.label, count: day.logs.length, hours: Array.from(hours.entries()) };
  });
}

export default async function TelegramPage({ searchParams }: { searchParams?: { saved?: string; testSent?: string; testFailed?: string; action?: string; adminSynced?: string; adminSyncFailed?: string; memberDiscovery?: string } }) {
  const user = await currentAdminUser();
  const { tenant } = await currentSessionContext();
  if (!tenant) redirect("/");
  const [settings, targetMemberships, targetCircles, auditActions, telegramLogs, incomingTelegramLogs] = await Promise.all([
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
          include: { targetUser: { include: { profile: true } }, targetCircle: true, outputChat: { include: { targetUser: { include: { profile: true } }, targetCircle: true } } },
          orderBy: [{ active: "desc" }, { action: "asc" }]
        }
      }
    }),
    prisma.tenantMembership.findMany({
      where: user.role === "ADMIN" || user.role === "SUPER_ADMIN"
        ? { tenantId: tenant.id, active: true, user: { active: true } }
        : { tenantId: tenant.id, active: true, user: { active: true }, OR: [{ userId: user.id }, ...(user.circleId ? [{ circleId: user.circleId }] : [])] },
      include: { user: { include: { profile: true } } },
      orderBy: { createdAt: "asc" }
    }),
    prisma.circle.findMany({
      where: user.role === "ADMIN" || user.role === "SUPER_ADMIN" ? { tenantId: tenant.id } : user.circleId ? { tenantId: tenant.id, id: user.circleId } : { id: "__none__" },
      orderBy: { name: "asc" }
    }),
    prisma.auditLog.findMany({
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" }
    }),
    prisma.auditLog.findMany({
      where: { action: { in: ["telegram_notification_sent", "telegram_notification_failed", "telegram_answer_sent"] } },
      include: { actor: { include: { profile: true } } },
      orderBy: { createdAt: "desc" },
      take: 80
    }),
    prisma.auditLog.findMany({
      where: { action: { in: ["telegram_message_received", "telegram_image_received", "telegram_message_ignored", "telegram_member_detected", "telegram_member_left"] } },
      include: { actor: { include: { profile: true } } },
      orderBy: { createdAt: "desc" },
      take: 120
    })
  ]);
  const targetUsers = targetMemberships.map((membership) => membership.user);
  const activeChats = settings?.telegramChats.filter((chat) => chat.status === "ACTIVE") || [];
  const pendingChats = settings?.telegramChats.filter((chat) => chat.status === "PENDING") || [];
  const mappings = settings?.telegramUserMappings || [];
  const knownUsersFromLogs = incomingTelegramLogs
    .map((log) => ({
      id: `log-${log.id}`,
      telegramUserId: detailText(log.details, "telegramUserId"),
      telegramUsername: detailText(log.details, "telegramUsername") || null,
      firstName: detailText(log.details, "telegramFirstName") || null,
      lastName: detailText(log.details, "telegramLastName") || null,
      membershipStatus: detailText(log.details, "membershipStatus") || "ACTIVE",
      source: "PROTOCOL",
      lastChatId: detailText(log.details, "chatId") || null,
      lastChatTitle: detailText(log.details, "chatTitle") || null,
      lastMessageAt: log.createdAt,
      fromProtocol: true
    }))
    .filter((entry) => entry.telegramUserId);
  const knownUsers = [...(settings?.telegramKnownUsers || []).map((entry) => ({ ...entry, fromProtocol: false })), ...knownUsersFromLogs]
    .filter((entry, index, list) => list.findIndex((candidate) => candidate.telegramUserId === entry.telegramUserId) === index);
  const notificationRules = settings?.telegramNotificationRules || [];
  const requestedAction = String(searchParams?.action || "").trim();
  const actionOptions = Array.from(new Set([...knownAuditActions.map(([action]) => action), ...auditActions.map((entry) => entry.action), requestedAction].filter(Boolean))).sort((a, b) => actionLabel(a).localeCompare(actionLabel(b)));
  const telegramTokenSuffix = secretSuffix(settings?.telegramBotTokenEnc);
  const openAiKeySuffix = secretSuffix(settings?.openAiApiKeyEnc);
  const telegramBotName = await readTelegramBotName(settings?.telegramBotTokenEnc);
  const notificationTargetUsers = notificationUsers(targetUsers);
  const chatById = new Map((settings?.telegramChats || []).map((chat) => [chat.id, chat]));
  const telegramLogGroups = telegramLogDayGroups(telegramLogs);
  return (
    <AppShell>
      <PageHeader title="Telegram" />
      <PageGuide title="Bot, Chats und Voice-Transkription verbinden">
        Hier verbindest du Telegram mit dem Portal. Speichere Bot-Token und OpenAI-Key, lies Chats ein, übernimm Chat-ID und Thread-ID und setze den Webhook, damit der Bot Nachrichten, Bilder und Aktionen verarbeiten kann.
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
            <Field label="OpenAI API-Key für Voice-Transkription">
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
            <h2 className="mb-4 text-lg font-semibold">Chat bestätigen</h2>
            <p className="mb-4 text-sm leading-6 text-graphite">Schreibe dem Bot eine Testnachricht im gewünschten Chat oder Thread. Danach liest der Button die letzten Telegram-Updates aus und zeigt Chat-ID sowie Thread-ID an.</p>
            <TelegramChatDiscovery />
          </Panel>
          <Panel>
            <h2 className="mb-4 text-lg font-semibold">Erkannte Chats</h2>
            <div className="space-y-3">
              {pendingChats.map((chat) => (
                <div key={chat.id} className="rounded-md border border-line bg-paper p-3 text-sm">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div><span className="text-graphite">Chatname:</span> {chatTitleLabel(chat)}</div>
                    <div><span className="text-graphite">Threadname:</span> {threadNameLabel(chat)}</div>
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
                      <Button variant="danger"><Trash2 className="h-4 w-4" /> Erkennung löschen</Button>
                    </form>
                  </div>
                </div>
              ))}
              {!pendingChats.length ? <p className="text-sm text-graphite">Keine neuen Chats oder Threads erkannt.</p> : null}
            </div>
          </Panel>
          <Panel>
            <h2 className="mb-4 text-lg font-semibold">Aktive Kanäle</h2>
            <div className="space-y-3">
              {activeChats.map((chat) => (
                <details key={chat.id} className="rounded-md border border-line bg-paper p-3 text-sm">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">
                      <strong className="block truncate">{threadNameLabel(chat)}</strong>
                      <span className="mt-1 block text-graphite">Threadname: {threadNameLabel(chat)}</span>
                      <span className="mt-1 block text-graphite">Chatname: {chatTitleLabel(chat)}</span>
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
                      <Field label="Chatname"><input className={inputClass} name="chatTitle" defaultValue={chat.chatTitle || chat.title || ""} placeholder="z.B. Fesselspiel Play" /></Field>
                      <Field label="Threadname"><input className={inputClass} name="threadTitle" defaultValue={chat.threadTitle || ""} placeholder={chat.threadId ? "z.B. Testing" : "Hauptchat"} /></Field>
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
                      <Button variant="danger"><Trash2 className="h-4 w-4" /> Kanal löschen</Button>
                    </form>
                  </div>
                </details>
              ))}
              {!activeChats.length ? <p className="text-sm text-graphite">Noch kein Chat bestätigt.</p> : null}
            </div>
          </Panel>
          <Panel>
            <h2 id="mappings" className="mb-4 flex items-center gap-2 text-lg font-semibold"><UserRound className="h-5 w-5 text-redbrand" /> Telegram-Benutzer zuordnen</h2>
            {searchParams?.adminSynced || searchParams?.adminSyncFailed ? (
              <p className="mb-4 rounded-md bg-paper p-3 text-sm text-graphite">
                Admin-Abgleich: <strong className="text-ink">{searchParams.adminSynced || "0"}</strong> Benutzer erkannt
                {Number(searchParams.adminSyncFailed || 0) ? <span className="ml-2 text-redbrand">Fehlerhafte Chats: {searchParams.adminSyncFailed}</span> : null}
              </p>
            ) : null}
            {searchParams?.memberDiscovery ? (
              <p className={`mb-4 rounded-md p-3 text-sm font-semibold ${searchParams.memberDiscovery === "enabled" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-redbrand"}`}>
                {searchParams.memberDiscovery === "enabled" ? "Mitgliedserkennung aktiviert. Neue hinzugefügte Gruppenmitglieder werden jetzt automatisch erkannt." : "Mitgliedserkennung konnte nicht aktiviert werden. Prüfe Bot-Token und Gruppenrechte."}
              </p>
            ) : null}
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
              <p className="mb-3 rounded-md bg-paper p-3 text-sm leading-6 text-graphite">
                Aktiviere die Mitgliedserkennung, damit neu hinzugefügte normale Gruppenmitglieder ohne eigene Nachricht erscheinen. Telegram liefert Bots keine vollständige historische Liste aller normalen Gruppenmitglieder.
              </p>
              <div className="mb-3 flex flex-wrap gap-2">
                <form action={activateTelegramMemberDiscovery}>
                  <Button><UserRound className="h-4 w-4" /> Mitgliedserkennung aktivieren</Button>
                </form>
                <form action={syncTelegramAdministrators}>
                  <Button variant="secondary"><UserRound className="h-4 w-4" /> Gruppenadmins ergänzen</Button>
                </form>
              </div>
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
                        <div className="text-xs text-graphite">
                          {name || "Name unbekannt"} · ID {known.telegramUserId}
                          {" · "}{telegramMembershipStatusLabel(known.membershipStatus)}
                          {" · "}{telegramKnownUserSourceLabel(known.source)}
                        </div>
                        {known.lastChatTitle || known.lastChatId ? <div className="text-xs text-graphite">Chat: {known.lastChatTitle || known.lastChatId}</div> : null}
                        <div className="text-xs text-graphite">Zuletzt: {formatDateTime(known.lastMessageAt)}</div>
                      </div>
                      <Field label="App-Benutzer">
                        <select className={selectClass} name="appUserId" defaultValue={mapped?.appUserId || ""} required>
                          <option value="">Bitte auswählen</option>
                          {targetUsers.map((entry) => <option key={entry.id} value={entry.id}>{userLabel(entry)}</option>)}
                        </select>
                      </Field>
                      <Button><Save className="h-4 w-4" /> {mapped ? "Ändern" : "Zuordnen"}</Button>
                    </form>
                  );
                })}
                {!knownUsers.length ? <p className="rounded-md border border-dashed border-line bg-paper p-4 text-sm text-graphite">Noch keine Telegram-Benutzer erkannt. Synchronisiere Gruppenadmins oder setze den Webhook neu, damit neue Mitglieder automatisch erfasst werden.</p> : null}
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
                    <Button variant="danger"><Trash2 className="h-4 w-4" /> Löschen</Button>
                  </form>
                </div>
              ))}
              {!mappings.length ? <p className="text-sm text-graphite">Noch keine Telegram-Benutzer zugeordnet.</p> : null}
            </div>
          </Panel>
          {user.role === "ADMIN" || user.role === "SUPER_ADMIN" ? (
            <Panel>
              <h2 id="notifications" className="mb-4 flex items-center gap-2 text-lg font-semibold"><BellRing className="h-5 w-5 text-redbrand" /> Aktions-Benachrichtigungen</h2>
              <p className="mb-4 text-sm leading-6 text-graphite">
                Wähle eine protokollierte Aktion, ein Telegram-Ziel und eine HTML-Nachricht. Optional kannst du einen konkreten Ausgabe-Thread festlegen; dann geht die Nachricht genau in diesen Chat/Thread.
              </p>
              {searchParams?.testSent ? (
                <div className="mb-4 rounded-md border border-line bg-paper p-3 text-sm text-graphite">
                  Test gesendet: <strong className="text-ink">{searchParams.testSent}</strong>
                  {Number(searchParams.testFailed || 0) ? <span className="ml-2 text-redbrand">Fehler: {searchParams.testFailed}</span> : null}
                </div>
              ) : null}
              <form action={createNotificationRule} className="space-y-4 rounded-lg border border-line bg-paper p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Aktion">
                    <select className={selectClass} name="action" defaultValue={requestedAction || actionOptions[0] || ""} required>
                      {actionOptions.map((action) => <option key={action} value={action}>{actionLabel(action)}</option>)}
                    </select>
                  </Field>
                  <NotificationTargetFields users={notificationTargetUsers} circles={targetCircles} targetType="none" />
                  <Field label="Ausgabe-Thread">
                    <select className={selectClass} name="outputChatId" defaultValue="">
                      <option value="">Automatisch über Ziel</option>
                      {activeChats.map((chat) => <option key={chat.id} value={chat.id}>{chatLabel(chat)}</option>)}
                    </select>
                  </Field>
                </div>
                <NotificationMessageField defaultValue={defaultNotificationTemplate()} />
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
                        <span className="mt-1 block text-sm text-graphite">
                          Ausgabe: {rule.outputChat ? chatLabel(rule.outputChat) : "Automatisch über Ziel"}
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
                        <NotificationTargetFields users={notificationTargetUsers} circles={targetCircles} targetType={targetTypeFor(rule)} targetUserId={rule.targetUserId} targetCircleId={rule.targetCircleId} />
                        <Field label="Ausgabe-Thread">
                          <select className={selectClass} name="outputChatId" defaultValue={rule.outputChatId || ""}>
                            <option value="">Automatisch über Ziel</option>
                            {activeChats.map((chat) => <option key={chat.id} value={chat.id}>{chatLabel(chat)}</option>)}
                          </select>
                        </Field>
                      </div>
                      <NotificationMessageField defaultValue={rule.message} />
                      <label className="flex items-center gap-2 text-sm text-graphite">
                        <input name="active" type="checkbox" defaultChecked={rule.active} className="h-4 w-4 accent-redbrand" />
                        aktiv
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <SubmitButton pendingLabel="Regel wird gespeichert..."><Save className="h-4 w-4" /> Regel speichern</SubmitButton>
                      </div>
                    </form>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <form action={testNotificationRule}>
                        <input type="hidden" name="ruleId" value={rule.id} />
                        <Button><Send className="h-4 w-4" /> Test senden</Button>
                      </form>
                      <form action={deleteNotificationRule}>
                        <input type="hidden" name="ruleId" value={rule.id} />
                        <Button variant="danger"><Trash2 className="h-4 w-4" /> Regel löschen</Button>
                      </form>
                    </div>
                  </details>
                ))}
                {!notificationRules.length ? <p className="rounded-md border border-dashed border-line bg-paper p-4 text-sm text-graphite">Noch keine aktionsbasierten Telegram-Regeln angelegt.</p> : null}
              </div>
            </Panel>
          ) : null}
          <Panel>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><Send className="h-5 w-5 text-redbrand" /> Versandprotokoll</h2>
            <p className="mb-4 text-sm leading-6 text-graphite">
              Hier stehen die letzten Telegram-Ausgänge aus Aktionsregeln und Bot-Antworten. Einträge sind nach Tag und Stunde gruppiert und zeigen Ziel, Thread, Benutzer, Nachricht und Fehlerdetails.
            </p>
            <div className="space-y-4">
              {telegramLogGroups.map((day, dayIndex) => (
                <details key={day.key} open={dayIndex === 0} className="overflow-hidden rounded-lg border border-line bg-surface">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-paper px-4 py-3 font-semibold text-ink [&::-webkit-details-marker]:hidden">
                    <span>{day.label}</span>
                    <span className="flex items-center gap-2 text-sm font-medium text-graphite">
                      {day.count} Einträge <ChevronDown className="h-4 w-4" />
                    </span>
                  </summary>
                  <div className="divide-y divide-line">
                    {day.hours.map(([hour, hourLogs], hourIndex) => (
                      <details key={hour} open={dayIndex === 0 && hourIndex === 0} className="group">
                        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-graphite hover:bg-paper [&::-webkit-details-marker]:hidden">
                          <Clock3 className="h-4 w-4 text-redbrand" />
                          {hour}
                          <span className="ml-auto flex items-center gap-2 text-xs font-medium">
                            {hourLogs.length} <ChevronDown className="h-4 w-4" />
                          </span>
                        </summary>
                        <div className="space-y-2 bg-canvas/40 px-3 pb-3">
                          {hourLogs.map((log) => {
                            const outputChat = detailText(log.details, "outputChatId") ? chatById.get(detailText(log.details, "outputChatId")) : null;
                            const chatTitle = detailText(log.details, "chatTitle") || outputChat?.chatTitle || outputChat?.title || "Chat unbekannt";
                            const threadTitle = detailText(log.details, "threadTitle") || outputChat?.threadTitle || (detailText(log.details, "threadId") ? "Thread ohne Namen" : "Hauptchat");
                            const chatId = detailText(log.details, "chatId") || outputChat?.chatId || "";
                            const threadId = detailText(log.details, "threadId") || outputChat?.threadId || "";
                            const sourceAction = detailText(log.details, "sourceAction");
                            const sourceLabel = detailText(log.details, "sourceActionLabel") || (sourceAction ? actionLabel(sourceAction) : "Bot-Antwort");
                            const message = detailText(log.details, "message") || detailText(log.details, "answer");
                            const sourceHref = detailText(log.details, "sourceHref");
                            return (
                              <details key={log.id} className="overflow-hidden rounded-md border border-line bg-surface">
                                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-3 py-3 hover:bg-paper [&::-webkit-details-marker]:hidden">
                                  <span className="min-w-0">
                                    <span className="flex flex-wrap items-center gap-2">
                                      <strong className="text-sm text-ink">{log.title}</strong>
                                      <Badge tone={log.action === "telegram_notification_failed" ? "red" : "green"}>
                                        {log.action === "telegram_notification_failed" ? "Fehler" : "gesendet"}
                                      </Badge>
                                    </span>
                                    <span className="mt-1 block text-xs text-graphite">
                                      {actorLabel(log.actor)} · {hourLabel(log.createdAt)} · {sourceLabel}
                                    </span>
                                    <span className="mt-1 block text-xs text-graphite">
                                      {threadTitle} · {chatTitle}
                                    </span>
                                  </span>
                                  <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-graphite" />
                                </summary>
                                <div className="space-y-3 border-t border-line bg-paper p-3 text-sm">
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <div className="rounded-md bg-surface p-3">
                                      <div className="text-xs font-semibold uppercase tracking-wide text-graphite">Empfänger</div>
                                      <div className="mt-1 font-semibold text-ink">{detailText(log.details, "target") || "Automatisch"}</div>
                                      <div className="mt-1 text-xs text-graphite">{chatTitle}</div>
                                    </div>
                                    <div className="rounded-md bg-surface p-3">
                                      <div className="text-xs font-semibold uppercase tracking-wide text-graphite">Thread</div>
                                      <div className="mt-1 font-semibold text-ink">{threadTitle}</div>
                                      <div className="mt-1 text-xs text-graphite">
                                        Chat-ID {chatId || "-"} · Thread-ID {threadId || "-"}
                                      </div>
                                    </div>
                                    <div className="rounded-md bg-surface p-3">
                                      <div className="text-xs font-semibold uppercase tracking-wide text-graphite">Auslöser</div>
                                      <div className="mt-1 font-semibold text-ink">{sourceLabel}</div>
                                      <div className="mt-1 text-xs text-graphite">{detailText(log.details, "sourceTitle") || log.title}</div>
                                    </div>
                                    <div className="rounded-md bg-surface p-3">
                                      <div className="text-xs font-semibold uppercase tracking-wide text-graphite">Telegram</div>
                                      <div className="mt-1 font-semibold text-ink">Nachricht {detailText(log.details, "messageId") || "-"}</div>
                                      <div className="mt-1 text-xs text-graphite">{formatDateTime(log.createdAt)}</div>
                                    </div>
                                  </div>
                                  {message ? (
                                    <div className="rounded-md bg-surface p-3">
                                      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-graphite">
                                        <MessageSquareText className="h-4 w-4 text-redbrand" /> Nachricht
                                      </div>
                                      <div
                                        className="leading-6 text-graphite [&_code]:rounded [&_code]:bg-paper [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_strong]:text-ink"
                                        dangerouslySetInnerHTML={{ __html: normalizeLoggedTelegramHtml(message) }}
                                      />
                                    </div>
                                  ) : null}
                                  {sourceHref ? (
                                    <a href={sourceHref} className="focus-ring inline-flex min-h-9 items-center rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper hover:text-redbrand">
                                      Quelle öffnen
                                    </a>
                                  ) : null}
                                  {detailText(log.details, "error") ? (
                                    <pre className="whitespace-pre-wrap rounded-md bg-surface p-3 text-xs text-redbrand">{detailText(log.details, "error")}</pre>
                                  ) : null}
                                </div>
                              </details>
                            );
                          })}
                        </div>
                      </details>
                    ))}
                  </div>
                </details>
              ))}
              {!telegramLogs.length ? <p className="rounded-md border border-dashed border-line bg-paper p-4 text-sm text-graphite">Noch keine Telegram-Sendungen protokolliert.</p> : null}
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
