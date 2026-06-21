import type { AuditLog } from "@prisma/client";
import { env } from "@/lib/env";
import { actionLabel } from "@/lib/notification-actions";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage, telegramHtml } from "@/lib/telegram";

type AuditForNotification = AuditLog;
type RuleForNotification = Awaited<ReturnType<typeof findRulesForAudit>>[number];

function fullUrl(href?: string | null) {
  if (!href) return "";
  if (/^https?:\/\//i.test(href)) return href;
  return `${env.appUrl}${href.startsWith("/") ? href : `/${href}`}`;
}

function actorName(actor?: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null } | null) {
  return actor?.profile?.displayName || actor?.name || actor?.username || actor?.email || "System";
}

function renderTemplate(template: string, audit: Pick<AuditForNotification, "action" | "title" | "href" | "entityType" | "entityId" | "details">, actor?: Parameters<typeof actorName>[0]) {
  const url = fullUrl(audit.href);
  const values: Record<string, string> = {
    title: telegramHtml(audit.title),
    actor: telegramHtml(actorName(actor)),
    action: telegramHtml(audit.action),
    event: telegramHtml(actionLabel(audit.action)),
    entityType: telegramHtml(audit.entityType || ""),
    entityId: telegramHtml(audit.entityId || ""),
    url: url ? `<a href="${telegramHtml(url)}">In der App öffnen</a>` : "",
    details: telegramHtml(audit.details ? JSON.stringify(audit.details) : "")
  };
  return template.replace(/\{([a-zA-Z]+)\}/g, (match, key) => values[key] ?? match).trim();
}

async function findRulesForAudit(audit: Pick<AuditForNotification, "action">) {
  return prisma.telegramNotificationRule.findMany({
    where: { action: audit.action, active: true },
    include: {
      settings: { include: { telegramChats: { where: { status: "ACTIVE" } } } },
      targetUser: { include: { profile: true } },
      targetCircle: true,
      outputChat: true
    }
  });
}

async function sendRule(rule: RuleForNotification, audit: Pick<AuditForNotification, "action" | "title" | "href" | "entityType" | "entityId" | "details">, actor: Parameters<typeof actorName>[0] | null, sent: Set<string>) {
  if (!rule.settings.telegramBotTokenEnc) return [];
  const targetUserIds = rule.targetCircleId
    ? new Set((await prisma.tenantMembership.findMany({ where: { circleId: rule.targetCircleId, active: true, user: { active: true } }, select: { userId: true } })).map((member) => member.userId))
    : new Set<string>();
  const targetUserCircleId = rule.targetUserId
    ? (await prisma.tenantMembership.findFirst({ where: { userId: rule.targetUserId, active: true }, select: { circleId: true } }))?.circleId || null
    : null;
  const chats = rule.outputChatId
    ? rule.outputChat?.status === "ACTIVE" ? [rule.outputChat] : []
    : rule.settings.telegramChats.filter((chat) => {
        if (rule.targetUserId) return chat.targetUserId === rule.targetUserId || Boolean(targetUserCircleId && chat.targetCircleId === targetUserCircleId);
        if (rule.targetCircleId) return chat.targetCircleId === rule.targetCircleId || Boolean(chat.targetUserId && targetUserIds.has(chat.targetUserId));
        return false;
      });
  const message = renderTemplate(rule.message, audit, actor);
  return chats
    .filter((chat) => {
      const key = `${rule.settings.telegramBotTokenEnc}:${chat.chatId}:${chat.threadId || ""}`;
      if (sent.has(key)) return false;
      sent.add(key);
      return true;
    })
    .map((chat) =>
      sendTelegramMessage(rule.settings.telegramBotTokenEnc!, chat.chatId, chat.threadId, message, {
        parseMode: "HTML",
        disableWebPagePreview: true
      })
    );
}

async function settleTelegramTasks(tasks: Promise<unknown>[]) {
  const results = await Promise.allSettled(tasks);
  results.forEach((result) => {
    if (result.status === "rejected") console.error("telegram notification failed", result.reason);
  });
  return results;
}

export async function dispatchAuditNotifications(audit: AuditForNotification) {
  const rules = await findRulesForAudit(audit);
  if (!rules.length) return;
  const actor = audit.actorId
    ? await prisma.user.findUnique({ where: { id: audit.actorId }, include: { profile: true } })
    : null;
  const sent = new Set<string>();
  const tasks: Promise<unknown>[] = [];
  for (const rule of rules) {
    tasks.push(...(await sendRule(rule, audit, actor, sent)));
  }
  await settleTelegramTasks(tasks);
}

export async function testTelegramNotificationRule(ruleId: string, settingsId: string, actorId: string) {
  const rule = await prisma.telegramNotificationRule.findFirst({
    where: { id: ruleId, settingsId },
    include: {
      settings: { include: { telegramChats: { where: { status: "ACTIVE" } } } },
      targetUser: { include: { profile: true } },
      targetCircle: true,
      outputChat: true
    }
  });
  if (!rule) return { sent: 0, failed: 0 };
  const actor = await prisma.user.findUnique({ where: { id: actorId }, include: { profile: true } });
  const tasks = await sendRule(rule, {
    action: rule.action,
    title: `Test: ${actionLabel(rule.action)}`,
    href: "/settings/telegram#notifications",
    entityType: "telegramNotificationRule",
    entityId: rule.id,
    details: { test: true }
  }, actor, new Set<string>());
  const results = await settleTelegramTasks(tasks);
  return {
    sent: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected").length
  };
}
