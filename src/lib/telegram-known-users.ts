import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type KnownTelegramUserInput = {
  settingsId: string;
  telegramSettingsId?: string | null;
  telegramUserId: string;
  telegramUsername?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  membershipStatus?: string;
  source?: string;
  lastChatId?: string | null;
  lastChatTitle?: string | null;
};

function knownUserData(input: KnownTelegramUserInput) {
  return {
    settingsId: input.settingsId,
    telegramSettingsId: input.telegramSettingsId || null,
    telegramUserId: input.telegramUserId,
    telegramUsername: input.telegramUsername ? input.telegramUsername.toLowerCase() : null,
    firstName: input.firstName || null,
    lastName: input.lastName || null,
    membershipStatus: input.membershipStatus || "ACTIVE",
    source: input.source || "MESSAGE",
    lastChatId: input.lastChatId || null,
    lastChatTitle: input.lastChatTitle || null,
    lastMessageAt: new Date()
  };
}

function knownUserWhere(input: KnownTelegramUserInput): Prisma.TelegramKnownUserWhereInput {
  return {
    telegramUserId: input.telegramUserId,
    OR: [
      { settingsId: input.settingsId },
      input.telegramSettingsId ? { telegramSettingsId: input.telegramSettingsId } : null
    ].filter(Boolean) as Prisma.TelegramKnownUserWhereInput[]
  };
}

export async function rememberKnownTelegramUser(input: KnownTelegramUserInput) {
  const data = knownUserData(input);
  const matches = await prisma.telegramKnownUser.findMany({
    where: knownUserWhere(input),
    orderBy: [{ telegramSettingsId: "desc" }, { updatedAt: "desc" }]
  });
  const primary = matches.find((entry) => input.telegramSettingsId && entry.telegramSettingsId === input.telegramSettingsId)
    || matches.find((entry) => entry.settingsId === input.settingsId)
    || matches[0];
  if (primary) {
    const duplicateIds = matches.filter((entry) => entry.id !== primary.id).map((entry) => entry.id);
    await prisma.$transaction([
      ...(duplicateIds.length ? [prisma.telegramKnownUser.deleteMany({ where: { id: { in: duplicateIds } } })] : []),
      prisma.telegramKnownUser.update({ where: { id: primary.id }, data })
    ]);
    return;
  }
  try {
    await prisma.telegramKnownUser.create({ data });
  } catch (error) {
    const conflict = await prisma.telegramKnownUser.findFirst({ where: knownUserWhere(input) });
    if (!conflict) throw error;
    await prisma.telegramKnownUser.update({ where: { id: conflict.id }, data });
  }
}
