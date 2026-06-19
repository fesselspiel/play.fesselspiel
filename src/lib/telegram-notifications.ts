import type { AuditLog } from "@prisma/client";
import { env } from "@/lib/env";
import { actionLabel } from "@/lib/notification-actions";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage, telegramHtml } from "@/lib/telegram";

type AuditForNotification = AuditLog;

function fullUrl(href?: string | null) {
  if (!href) return "";
  if (/^https?:\/\//i.test(href)) return href;
  return `${env.appUrl}${href.startsWith("/") ? href : `/${href}`}`;
}

function actorName(actor?: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null } | null) {
  return actor?.profile?.displayName || actor?.name || actor?.username || actor?.email || "System";
}

function renderTemplate(template: string, audit: AuditForNotification, actor?: Parameters<typeof actorName>[0]) {
  const url = fullUrl(audit.href);
  const values: Record<string, string> = {
    title: telegramHtml(audit.title),
    actor: telegramHtml(actorName(actor)),
    action: telegramHtml(audit.action),
    event: telegramHtml(actionLabel(audit.action)),
    entityType: telegramHtml(audit.entityType || ""),
    entityId: telegramHtml(audit.entityId || ""),
    url: url ? `<a href="${telegramHtml(url)}">In der App oeffnen</a>` : "",
    details: telegramHtml(audit.details ? JSON.stringify(audit.details) : "")
  };
  return template.replace(/\{([a-zA-Z]+)\}/g, (match, key) => values[key] ?? match).trim();
}

export async function dispatchAuditNotifications(audit: AuditForNotification) {
  const rules = await prisma.telegramNotificationRule.findMany({
    where: { action: audit.action, active: true },
    include: {
      settings: { include: { telegramChats: { where: { status: "ACTIVE" } } } },
      targetUser: { include: { profile: true } },
      targetCircle: true
    }
  });
  if (!rules.length) return;
  const actor = audit.actorId
    ? await prisma.user.findUnique({ where: { id: audit.actorId }, include: { profile: true } })
    : null;
  const sent = new Set<string>();
  await Promise.allSettled(
    rules.flatMap((rule) => {
      if (!rule.settings.telegramBotTokenEnc) return [];
      const chats = rule.settings.telegramChats.filter((chat) => {
        if (rule.targetUserId) return chat.targetUserId === rule.targetUserId;
        if (rule.targetCircleId) return chat.targetCircleId === rule.targetCircleId;
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
    })
  );
}
