import type { Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { sendTemplateEmail } from "@/lib/email";
import { sendNativeTestPush } from "@/lib/native-push-notifications";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage, telegramHtml } from "@/lib/telegram";
import { logAction, userDisplayName } from "@/lib/audit";

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export type ShareUser = {
  id: string;
  tenantId?: string | null;
  circleId?: string | null;
  role?: string | null;
  tenant?: { domains: { hostname: string; active: boolean; primary: boolean }[] } | null;
};

export type ShareTargetOption = {
  id: string;
  label: string;
};

export type ShareTargets = {
  users: ShareTargetOption[];
  circles: ShareTargetOption[];
};

export async function shareTargetsForUser(user: ShareUser): Promise<ShareTargets> {
  if (!user.tenantId) return { users: [], circles: [] };
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const [memberships, circles] = await Promise.all([
    prisma.tenantMembership.findMany({
      where: {
        tenantId: user.tenantId,
        active: true,
        user: { active: true },
        ...(isAdmin ? {} : user.circleId ? { circleId: user.circleId } : { userId: user.id })
      },
      include: { user: { include: { profile: true } } },
      orderBy: { createdAt: "asc" }
    }),
    prisma.circle.findMany({
      where: {
        tenantId: user.tenantId,
        ...(isAdmin ? {} : user.circleId ? { id: user.circleId } : { memberships: { some: { userId: user.id, active: true } } })
      },
      orderBy: { name: "asc" }
    })
  ]);
  return {
    users: memberships.map((membership) => ({ id: membership.user.id, label: userDisplayName(membership.user) })),
    circles: circles.map((circle) => ({ id: circle.id, label: circle.name }))
  };
}

function absoluteUrl(user: ShareUser, href: string) {
  if (/^https?:\/\//i.test(href)) return href;
  const hostname = user.tenant?.domains.find((domain) => domain.primary && domain.active)?.hostname || user.tenant?.domains.find((domain) => domain.active)?.hostname;
  if (hostname) return `https://${hostname}${href.startsWith("/") ? href : `/${href}`}`;
  return `${env.appUrl}${href.startsWith("/") ? href : `/${href}`}`;
}

async function recipientUsers(input: { tenantId: string; targetType: string; targetId: string }) {
  if (input.targetType === "user") {
    const user = await prisma.user.findFirst({ where: { id: input.targetId, tenantId: input.tenantId, active: true }, include: { profile: true } });
    return user ? [user] : [];
  }
  if (input.targetType === "circle") {
    const memberships = await prisma.tenantMembership.findMany({
      where: { tenantId: input.tenantId, circleId: input.targetId, active: true, user: { active: true } },
      include: { user: { include: { profile: true } } },
      orderBy: { createdAt: "asc" }
    });
    return memberships.map((membership) => membership.user);
  }
  return [];
}

async function sendShareEmail(input: {
  actor: ShareUser & { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null };
  users: Awaited<ReturnType<typeof recipientUsers>>;
  title: string;
  text: string;
  url: string;
  entityType: string;
  entityId: string;
}) {
  const results = await Promise.all(input.users.map((user) =>
    sendTemplateEmail({
      key: "item_share",
      to: user.email,
      actorId: input.actor.id,
      source: "share",
      entityType: input.entityType,
      entityId: input.entityId,
      variables: {
        userName: userDisplayName(user),
        actor: userDisplayName(input.actor),
        title: input.title,
        text: input.text,
        url: input.url,
        appUrl: env.appUrl,
        profileUrl: `${env.appUrl}/profile`,
        loginIdentifier: user.username || user.email
      }
    })
  ));
  return { sent: results.filter((result) => result.sent).length, attempted: results.length };
}

async function sendShareTelegram(input: {
  tenantId: string;
  targetType: string;
  targetId: string;
  title: string;
  text: string;
  url: string;
}) {
  const chats = await prisma.telegramChat.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { settings: { user: { tenantId: input.tenantId } } },
        { telegramSettings: { tenantId: input.tenantId } }
      ],
      AND: [{
      OR: [
        input.targetType === "user" ? { targetUserId: input.targetId } : {},
        input.targetType === "circle" ? { targetCircleId: input.targetId } : {}
      ].filter((entry) => Object.keys(entry).length > 0)
      }]
    },
    include: { settings: true, telegramSettings: true }
  });
  const message = [
    "📤 <b>Geteilter Eintrag</b>",
    "",
    `<b>${telegramHtml(input.title)}</b>`,
    input.text ? telegramHtml(input.text) : "",
    `<a href="${telegramHtml(input.url)}">In der App öffnen</a>`
  ].filter(Boolean).join("\n");
  let sent = 0;
  const seen = new Set<string>();
  for (const chat of chats) {
    const tokenEnc = chat.telegramSettings?.telegramBotTokenEnc || chat.settings.telegramBotTokenEnc;
    if (!tokenEnc) continue;
    const key = `${tokenEnc}:${chat.chatId}:${chat.threadId || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await sendTelegramMessage(tokenEnc, chat.chatId, chat.threadId, message, { parseMode: "HTML", disableWebPagePreview: true });
    sent += 1;
  }
  return { sent, attempted: chats.length };
}

async function sendSharePush(input: {
  actorId: string;
  tenantId: string;
  users: Awaited<ReturnType<typeof recipientUsers>>;
  title: string;
  text: string;
}) {
  const result = await sendNativeTestPush({
    tenantId: input.tenantId,
    actorId: input.actorId,
    targetUserIds: input.users.map((user) => user.id),
    title: input.title,
    body: input.text || "Ein Eintrag wurde mit dir geteilt.",
    sound: "playplaner_chime.caf",
    action: "item_shared"
  });
  return { sent: result.sent, attempted: result.devices, failed: result.failed, error: result.error };
}

export async function shareItem(input: {
  actor: ShareUser & { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null };
  channel: "email" | "telegram" | "push" | "all";
  targetType: "user" | "circle";
  targetId: string;
  entityType: string;
  entityId: string;
  title: string;
  href: string;
  text?: string;
}) {
  if (!input.actor.tenantId) throw new Error("Keine Seite aktiv");
  const url = absoluteUrl(input.actor, input.href);
  const users = await recipientUsers({ tenantId: input.actor.tenantId, targetType: input.targetType, targetId: input.targetId });
  if (!users.length) throw new Error("Kein Ziel gefunden");
  const results: Record<string, unknown> = {};
  if (input.channel === "all" || input.channel === "email") results.email = await sendShareEmail({ actor: input.actor, users, title: input.title, text: input.text || "", url, entityType: input.entityType, entityId: input.entityId });
  if (input.channel === "all" || input.channel === "telegram") results.telegram = await sendShareTelegram({ tenantId: input.actor.tenantId, targetType: input.targetType, targetId: input.targetId, title: input.title, text: input.text || "", url });
  if (input.channel === "all" || input.channel === "push") results.push = await sendSharePush({ actorId: input.actor.id, tenantId: input.actor.tenantId, users, title: input.title, text: input.text || url });
  await logAction({
    actorId: input.actor.id,
    action: "item_shared",
    entityType: input.entityType,
    entityId: input.entityId,
    title: `Geteilt: ${input.title}`,
    href: input.href,
    details: jsonValue({
      tenantId: input.actor.tenantId,
      channel: input.channel,
      targetType: input.targetType,
      targetId: input.targetId,
      url,
      text: input.text || null,
      results
    })
  });
  return results;
}
