import { createHash, randomBytes } from "node:crypto";
import { sendNativeTestPush } from "@/lib/native-push-notifications";
import { sendTelegramMessage, telegramHtml, telegramLink } from "@/lib/telegram";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPasswordReset(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 2);
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: tokenHash(token),
      expiresAt
    }
  });
  return {
    token,
    expiresAt,
    resetUrl: `${env.appUrl}/password/reset?token=${encodeURIComponent(token)}`
  };
}

export async function findValidPasswordReset(token: string) {
  if (!token) return null;
  return prisma.passwordResetToken.findFirst({
    where: {
      tokenHash: tokenHash(token),
      usedAt: null,
      expiresAt: { gt: new Date() }
    },
    include: { user: { include: { profile: true } } }
  });
}

function displayName(user: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null }) {
  return user.profile?.displayName || user.name || user.username || user.email || "Benutzer";
}

async function sendPasswordResetPush(user: { id: string; tenantId?: string | null; profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null }, resetUrl: string) {
  if (!user.tenantId) return { sent: 0, failed: 0, devices: 0, error: "missing_tenant" };
  return sendNativeTestPush({
    tenantId: user.tenantId,
    actorId: user.id,
    targetUserIds: [user.id],
    title: "Passwort zurücksetzen",
    body: `Hallo ${displayName(user)}, tippe hier, um dein Passwort neu zu setzen.`,
    sound: "playplaner_chime.caf",
    action: "password_reset_requested",
    href: resetUrl,
    targetScreen: "web",
    targetId: user.id,
    entityType: "user",
    entityId: user.id
  });
}

async function directTelegramTargets(userId: string) {
  const chats = await prisma.telegramChat.findMany({
    where: {
      targetUserId: userId,
      status: "ACTIVE",
      threadId: null,
      OR: [{ chatType: "private" }, { chatType: null }]
    },
    include: { telegramSettings: true, settings: true },
    orderBy: { updatedAt: "desc" },
    take: 3
  });
  if (chats.length) {
    return chats
      .map((chat) => ({
        tokenEnc: chat.telegramSettings?.telegramBotTokenEnc || chat.settings?.telegramBotTokenEnc,
        chatId: chat.chatId,
        source: "direct_chat"
      }))
      .filter((entry): entry is { tokenEnc: string; chatId: string; source: string } => Boolean(entry.tokenEnc && entry.chatId));
  }
  const mappings = await prisma.telegramUserMapping.findMany({
    where: { appUserId: userId, telegramUserId: { not: null } },
    include: { telegramSettings: true, settings: true },
    orderBy: { updatedAt: "desc" },
    take: 3
  });
  return mappings
    .map((mapping) => ({
      tokenEnc: mapping.telegramSettings?.telegramBotTokenEnc,
      chatId: mapping.telegramUserId || "",
      source: "user_mapping"
    }))
    .filter((entry): entry is { tokenEnc: string; chatId: string; source: string } => Boolean(entry.tokenEnc && entry.chatId));
}

async function sendPasswordResetTelegram(user: { id: string; profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null }, resetUrl: string) {
  const targets = await directTelegramTargets(user.id);
  if (!targets.length) return { sent: 0, failed: 0, targets: 0 };
  const message = [
    "<b>Passwort zurücksetzen</b>",
    "",
    `Hallo ${telegramHtml(displayName(user))},`,
    "für dein Konto wurde ein Link zum Zurücksetzen des Passworts angefordert.",
    "",
    telegramLink(resetUrl, "Neues Passwort setzen"),
    "",
    "Falls du das nicht warst, ignoriere diese Nachricht."
  ].join("\n");
  const unique = new Map(targets.map((target) => [`${target.tokenEnc}:${target.chatId}`, target]));
  const results = await Promise.allSettled(
    Array.from(unique.values()).map((target) =>
      sendTelegramMessage(target.tokenEnc, target.chatId, null, message, {
        parseMode: "HTML",
        disableWebPagePreview: true
      })
    )
  );
  return {
    sent: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected").length,
    targets: unique.size
  };
}

export async function notifyPasswordReset(user: { id: string; tenantId?: string | null; profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null }, reset: { resetUrl: string }) {
  const [push, telegram] = await Promise.all([
    sendPasswordResetPush(user, reset.resetUrl).catch((error) => ({ sent: 0, failed: 1, devices: 0, error: error instanceof Error ? error.message : String(error) })),
    sendPasswordResetTelegram(user, reset.resetUrl).catch((error) => ({ sent: 0, failed: 1, targets: 0, error: error instanceof Error ? error.message : String(error) }))
  ]);
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "password_reset_requested",
      entityType: "user",
      entityId: user.id,
      title: `Passwort-Reset angefordert: ${displayName(user)}`,
      href: "/password/forgot",
      details: { push, telegram }
    }
  });
  return { push, telegram };
}
