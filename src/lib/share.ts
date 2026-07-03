import type { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
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

function displayUrl(user: ShareUser, href: string) {
  if (/^https?:\/\//i.test(href)) return href;
  const hostname = user.tenant?.domains.find((domain) => domain.primary && domain.active)?.hostname || user.tenant?.domains.find((domain) => domain.active)?.hostname;
  if (hostname) return `https://${hostname}${href.startsWith("/") ? href : `/${href}`}`;
  return `${env.appUrl}${href.startsWith("/") ? href : `/${href}`}`;
}

export function absoluteUrl(user: ShareUser, href: string) {
  if (/^https?:\/\//i.test(href)) return href;
  const hostname = user.tenant?.domains.find((domain) => domain.primary && domain.active)?.hostname || user.tenant?.domains.find((domain) => domain.active)?.hostname;
  if (hostname) return `https://${hostname}${href.startsWith("/") ? href : `/${href}`}`;
  return `${env.appUrl}${href.startsWith("/") ? href : `/${href}`}`;
}

function trackingPath(token: string) {
  return `/share/open/${token}`;
}

async function createShareDelivery(input: {
  actor: ShareUser;
  userId: string;
  channel: "email" | "telegram" | "push";
  entityType: string;
  entityId: string;
  title: string;
  href: string;
  text: string;
}) {
  const token = randomBytes(24).toString("base64url");
  const delivery = await prisma.shareDelivery.create({
    data: {
      token,
      tenantId: input.actor.tenantId || null,
      actorId: input.actor.id,
      targetUserId: input.userId,
      channel: input.channel,
      entityType: input.entityType,
      entityId: input.entityId,
      title: input.title,
      href: input.href,
      text: input.text || null
    }
  });
  return {
    delivery,
    url: absoluteUrl(input.actor, trackingPath(token))
  };
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
  href: string;
  entityType: string;
  entityId: string;
}) {
  const results = await Promise.all(input.users.map(async (user) => {
    const delivery = await createShareDelivery({ actor: input.actor, userId: user.id, channel: "email", entityType: input.entityType, entityId: input.entityId, title: input.title, href: input.href, text: input.text });
    return sendTemplateEmail({
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
        url: delivery.url,
        appUrl: env.appUrl,
        profileUrl: `${env.appUrl}/profile`,
        loginIdentifier: user.username || user.email
      }
    });
  }));
  return { sent: results.filter((result) => result.sent).length, attempted: results.length };
}

async function sendShareTelegram(input: {
  actor: ShareUser;
  tenantId: string;
  targetType: string;
  targetId: string;
  users: Awaited<ReturnType<typeof recipientUsers>>;
  title: string;
  text: string;
  href: string;
  entityType: string;
  entityId: string;
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
  const deliveries = await Promise.all(input.users.map((user) =>
    createShareDelivery({ actor: input.actor, userId: user.id, channel: "telegram", entityType: input.entityType, entityId: input.entityId, title: input.title, href: input.href, text: input.text })
  ));
  const links = deliveries.length === 1
    ? [`<a href="${telegramHtml(deliveries[0].url)}">In der App öffnen</a>`]
    : deliveries.map(({ url }, index) => `${telegramHtml(userDisplayName(input.users[index]))}: <a href="${telegramHtml(url)}">öffnen</a>`);
  const message = [
    "📤 <b>Geteilter Eintrag</b>",
    "",
    `<b>${telegramHtml(input.title)}</b>`,
    input.text ? telegramHtml(input.text) : "",
    ...links
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
  actor: ShareUser;
  actorId: string;
  tenantId: string;
  users: Awaited<ReturnType<typeof recipientUsers>>;
  title: string;
  text: string;
  href: string;
  entityType: string;
  entityId: string;
}) {
  const deliveries = await Promise.all(input.users.map((user) =>
    createShareDelivery({ actor: input.actor, userId: user.id, channel: "push", entityType: input.entityType, entityId: input.entityId, title: input.title, href: input.href, text: input.text })
  ));
  const results = await Promise.all(deliveries.map((delivery, index) => sendNativeTestPush({
    tenantId: input.tenantId,
    actorId: input.actorId,
    targetUserIds: [input.users[index].id],
    title: input.title,
    body: input.text || "Ein Eintrag wurde mit dir geteilt.",
    sound: "playplaner_chime.caf",
    action: "item_shared",
    href: trackingPath(delivery.delivery.token),
    targetScreen: "web",
    targetId: delivery.delivery.id,
    entityType: input.entityType,
    entityId: input.entityId
  })));
  return {
    sent: results.reduce((sum, result) => sum + result.sent, 0),
    attempted: results.reduce((sum, result) => sum + result.devices, 0),
    failed: results.reduce((sum, result) => sum + result.failed, 0),
    errors: results.map((result) => result.error).filter(Boolean),
    urls: deliveries.map(({ url }) => url)
  };
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
  const url = displayUrl(input.actor, input.href);
  const users = await recipientUsers({ tenantId: input.actor.tenantId, targetType: input.targetType, targetId: input.targetId });
  if (!users.length) throw new Error("Kein Ziel gefunden");
  const results: Record<string, unknown> = {};
  if (input.channel === "all" || input.channel === "email") results.email = await sendShareEmail({ actor: input.actor, users, title: input.title, text: input.text || "", href: input.href, entityType: input.entityType, entityId: input.entityId });
  if (input.channel === "all" || input.channel === "telegram") results.telegram = await sendShareTelegram({ actor: input.actor, tenantId: input.actor.tenantId, targetType: input.targetType, targetId: input.targetId, users, title: input.title, text: input.text || "", href: input.href, entityType: input.entityType, entityId: input.entityId });
  if (input.channel === "all" || input.channel === "push") results.push = await sendSharePush({ actor: input.actor, actorId: input.actor.id, tenantId: input.actor.tenantId, users, title: input.title, text: input.text || url, href: input.href, entityType: input.entityType, entityId: input.entityId });
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

async function sendShareOpenedEmail(input: {
  delivery: NonNullable<Awaited<ReturnType<typeof loadShareDelivery>>>;
  openerName: string;
  url: string;
}) {
  return sendTemplateEmail({
    key: "item_share_opened",
    to: input.delivery.actor.email,
    actorId: input.delivery.targetUserId,
    source: "share-opened",
    entityType: input.delivery.entityType,
    entityId: input.delivery.entityId,
    variables: {
      userName: userDisplayName(input.delivery.actor),
      opener: input.openerName,
      title: input.delivery.title,
      url: input.url
    }
  });
}

async function sendShareOpenedTelegram(input: {
  delivery: NonNullable<Awaited<ReturnType<typeof loadShareDelivery>>>;
  openerName: string;
  url: string;
}) {
  const chats = await prisma.telegramChat.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { settings: { user: { tenantId: input.delivery.tenantId } } },
        { telegramSettings: { tenantId: input.delivery.tenantId || undefined } }
      ],
      AND: [{
        targetUserId: input.delivery.actorId
      }]
    },
    include: { settings: true, telegramSettings: true }
  });
  const message = [
    "👀 <b>Geteilter Eintrag geöffnet</b>",
    "",
    `${telegramHtml(input.openerName)} hat geöffnet:`,
    `<b>${telegramHtml(input.delivery.title)}</b>`,
    "",
    `<a href="${telegramHtml(input.url)}">Eintrag öffnen</a>`
  ].join("\n");
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

async function sendShareOpenedPush(input: {
  delivery: NonNullable<Awaited<ReturnType<typeof loadShareDelivery>>>;
  openerName: string;
}) {
  if (!input.delivery.tenantId) return { sent: 0, failed: 0, devices: 0, error: "missing_tenant" };
  return sendNativeTestPush({
    tenantId: input.delivery.tenantId,
    actorId: input.delivery.targetUserId,
    targetUserIds: [input.delivery.actorId],
    title: "Geteilter Eintrag geöffnet",
    body: `${input.openerName} hat geöffnet: ${input.delivery.title}`,
    sound: "playplaner_chime.caf",
    action: "item_share_opened",
    href: input.delivery.href,
    targetScreen: "web",
    targetId: input.delivery.entityId,
    entityType: input.delivery.entityType,
    entityId: input.delivery.entityId
  });
}

function loadShareDelivery(token: string) {
  return prisma.shareDelivery.findUnique({
    where: { token },
    include: {
      actor: { include: { profile: true, tenant: { include: { domains: true } } } },
      targetUser: { include: { profile: true } }
    }
  });
}

export async function openShareDelivery(token: string) {
  const delivery = await loadShareDelivery(token);
  if (!delivery) return null;
  const firstOpen = !delivery.openedAt;
  const now = new Date();
  await prisma.shareDelivery.update({
    where: { id: delivery.id },
    data: {
      openCount: { increment: 1 },
      openedAt: delivery.openedAt || now,
      lastOpenedAt: now
    }
  });
  const openerName = userDisplayName(delivery.targetUser);
  const url = absoluteUrl(delivery.actor, delivery.href);
  const results: Record<string, unknown> = {};
  if (firstOpen) {
    if (delivery.channel === "email") results.email = await sendShareOpenedEmail({ delivery, openerName, url });
    if (delivery.channel === "telegram") results.telegram = await sendShareOpenedTelegram({ delivery, openerName, url });
    if (delivery.channel === "push") results.push = await sendShareOpenedPush({ delivery, openerName });
  }
  await logAction({
    actorId: delivery.targetUserId,
    action: "item_share_opened",
    entityType: delivery.entityType,
    entityId: delivery.entityId,
    title: `${openerName} hat geöffnet: ${delivery.title}`,
    href: delivery.href,
    details: jsonValue({
      tenantId: delivery.tenantId,
      shareDeliveryId: delivery.id,
      originalActorId: delivery.actorId,
      targetUserId: delivery.targetUserId,
      channel: delivery.channel,
      firstOpen,
      openCount: delivery.openCount + 1,
      url,
      results
    })
  });
  return { href: delivery.href };
}
