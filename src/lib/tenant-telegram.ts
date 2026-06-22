import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

export const DEFAULT_TENANT_BOT_KEY = "default";

export function personalBotKey(userId: string) {
  return `user:${userId}`;
}

export function extraBotKey() {
  return `bot:${randomUUID()}`;
}

export async function ensureTenantTelegramSettings(tenantId: string, key = DEFAULT_TENANT_BOT_KEY) {
  return prisma.tenantTelegramSettings.upsert({
    where: { tenantId_key: { tenantId, key } },
    update: {},
    create: { tenantId, key, name: "Standard-Bot", scope: "TENANT", isDefault: key === DEFAULT_TENANT_BOT_KEY }
  });
}

export async function ensurePersonalTelegramSettings(tenantId: string, userId: string) {
  return prisma.tenantTelegramSettings.upsert({
    where: { tenantId_key: { tenantId, key: personalBotKey(userId) } },
    update: {},
    create: { tenantId, ownerId: userId, key: personalBotKey(userId), name: "Persönlicher Bot", scope: "USER", isDefault: false }
  });
}

export async function ensureLegacyUserSettings(userId: string) {
  return prisma.userSettings.upsert({
    where: { userId },
    update: {},
    create: { userId }
  });
}

export async function tenantTelegramSettingsForUser(tenantId: string, userId: string) {
  const [telegramSettings, legacySettings] = await Promise.all([
    ensureTenantTelegramSettings(tenantId),
    ensureLegacyUserSettings(userId)
  ]);
  return { telegramSettings, legacySettings };
}

export async function resolveTelegramSettingsForScope(tenantId: string, userId: string, input: { scope?: string | null; botId?: string | null }) {
  if (input.botId) {
    const bot = await prisma.tenantTelegramSettings.findFirst({ where: { id: input.botId, tenantId } });
    if (bot) return bot;
  }
  return input.scope === "user"
    ? ensurePersonalTelegramSettings(tenantId, userId)
    : ensureTenantTelegramSettings(tenantId);
}
