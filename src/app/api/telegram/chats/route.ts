import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { currentTenant } from "@/lib/tenancy";
import { ensureLegacyUserSettings, resolveTelegramSettingsForScope } from "@/lib/tenant-telegram";

const Body = z.object({
  chatId: z.string().min(1),
  threadId: z.string().nullable().optional(),
  title: z.string().optional(),
  chatTitle: z.string().optional(),
  threadTitle: z.string().nullable().optional(),
  lastMessageText: z.string().optional(),
  lastMessageFrom: z.string().optional(),
  fromId: z.string().nullable().optional(),
  fromUsername: z.string().nullable().optional(),
  fromFirstName: z.string().nullable().optional(),
  fromLastName: z.string().nullable().optional(),
  scope: z.enum(["tenant", "user"]).optional(),
  botId: z.string().optional()
});

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  const scope = parsed.data.scope === "user" ? "user" : "tenant";
  const tenant = await currentTenant();
  try {
  const [telegramSettings, legacySettings] = await Promise.all([
    resolveTelegramSettingsForScope(tenant.id, user.id, { scope, botId: parsed.data.botId }),
    ensureLegacyUserSettings(user.id)
  ]);
  const membership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    select: { userId: true, active: true }
  });
  const targetUserId = membership?.active ? user.id : null;
  const activeTelegramSettingsId = telegramSettings.id;
  const threadId = parsed.data.threadId || null;
  const chatTitle = parsed.data.chatTitle || parsed.data.title || parsed.data.chatId;
  const threadTitle = parsed.data.threadTitle || null;
  const existing = await prisma.telegramChat.findFirst({
    where: {
      chatId: parsed.data.chatId,
      threadId,
      OR: [
        { telegramSettingsId: telegramSettings.id },
        { settingsId: legacySettings.id }
      ]
    }
  });
  const detectedMessage = {
    lastMessageText: parsed.data.lastMessageText || null,
    lastMessageFrom: parsed.data.lastMessageFrom || null,
    lastMessageAt: new Date()
  };
  const chat = existing
    ? await prisma.telegramChat.update({
        where: { id: existing.id },
        data: {
          title: threadTitle || existing.threadTitle || null,
          chatTitle: chatTitle || existing.chatTitle,
          threadTitle: threadTitle || existing.threadTitle,
          status: "ACTIVE",
          targetUserId: existing.targetUserId || targetUserId,
          settingsId: legacySettings.id,
          telegramSettingsId: activeTelegramSettingsId,
          ...detectedMessage
        }
      })
    : await prisma.telegramChat.create({
        data: {
          settingsId: legacySettings.id,
          telegramSettingsId: activeTelegramSettingsId,
          targetUserId,
          chatId: parsed.data.chatId,
          threadId,
          title: threadTitle || null,
          chatTitle,
          threadTitle,
          status: "ACTIVE",
          ...detectedMessage
        }
      });
  if (parsed.data.fromId) {
    await prisma.telegramKnownUser.upsert({
      where: { telegramSettingsId_telegramUserId: { telegramSettingsId: telegramSettings.id, telegramUserId: parsed.data.fromId } },
      update: {
        telegramUsername: parsed.data.fromUsername ? parsed.data.fromUsername.toLowerCase() : null,
        firstName: parsed.data.fromFirstName || null,
        lastName: parsed.data.fromLastName || null,
        membershipStatus: "ACTIVE",
        source: "CHAT_DISCOVERY",
        lastChatId: parsed.data.chatId,
        lastChatTitle: parsed.data.chatTitle || parsed.data.title || null,
        lastMessageAt: new Date()
      },
      create: {
        settingsId: legacySettings.id,
        telegramSettingsId: activeTelegramSettingsId,
        telegramUserId: parsed.data.fromId,
        telegramUsername: parsed.data.fromUsername ? parsed.data.fromUsername.toLowerCase() : null,
        firstName: parsed.data.fromFirstName || null,
        lastName: parsed.data.fromLastName || null,
        membershipStatus: "ACTIVE",
        source: "CHAT_DISCOVERY",
        lastChatId: parsed.data.chatId,
        lastChatTitle: parsed.data.chatTitle || parsed.data.title || null,
        lastMessageAt: new Date()
      }
    });
  }
  return NextResponse.json({ ok: true, chat });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    await logAction({
      actorId: user.id,
      action: "telegram_chat_save_failed",
      entityType: "telegramChat",
      title: "Telegram-Chat konnte nicht gespeichert werden",
      details: {
        chatId: parsed.data.chatId,
        threadId: parsed.data.threadId || null,
        scope,
        botId: parsed.data.botId || null,
        error: message.slice(0, 1000)
      },
      href: "/settings/telegram"
    });
    return NextResponse.json({ error: `Chat konnte nicht gespeichert werden: ${message}` }, { status: 500 });
  }
}
