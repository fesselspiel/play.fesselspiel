import type { AuditLog, ChatNotificationRule, User } from "@prisma/client";
import { env } from "@/lib/env";
import { actionLabel, notificationActionAliases } from "@/lib/notification-actions";
import { prisma } from "@/lib/prisma";
import { createCircleChatReceipts } from "@/lib/circle-chat";
import { awardPointsForAudit } from "@/lib/points";
import { dispatchAuditNotifications } from "@/lib/telegram-notifications";
import { dispatchEmailAuditNotifications } from "@/lib/email-notifications";
import { dispatchExternalPushNotifications } from "@/lib/external-push-notifications";
import { dispatchNativePushNotifications } from "@/lib/native-push-notifications";

type AuditForChat = Pick<AuditLog, "id" | "actorId" | "action" | "title" | "href" | "entityType" | "entityId" | "details">;
type ActorForChat = User & { profile?: { displayName?: string | null } | null };
type RuleForChat = ChatNotificationRule & { targetCircle: { id: string; name: string; tenantId: string | null } };

const ignoredActions = new Set([
  "circle_chat_message_created",
  "circle_chat_message_created_api",
  "circle_chat_message_deleted",
  "circle_chat_message_deleted_api",
  "chat_notification_failed"
]);

function fullUrl(href?: string | null) {
  if (!href) return "";
  if (/^https?:\/\//i.test(href)) return href;
  return `${env.appUrl}${href.startsWith("/") ? href : `/${href}`}`;
}

function actorName(actor?: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null } | null) {
  return actor?.profile?.displayName || actor?.name || actor?.username || actor?.email || "System";
}

function objectDetails(details: unknown) {
  return details && typeof details === "object" && !Array.isArray(details) ? details as Record<string, unknown> : {};
}

function detailString(details: unknown) {
  if (!details) return "";
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

function renderTemplate(template: string, audit: AuditForChat, actor?: Parameters<typeof actorName>[0]) {
  const values: Record<string, string> = {
    title: audit.title,
    actor: actorName(actor),
    action: audit.action,
    event: actionLabel(audit.action),
    entityType: audit.entityType || "",
    entityId: audit.entityId || "",
    url: fullUrl(audit.href),
    details: detailString(audit.details)
  };
  return Object.entries(values).reduce((message, [key, value]) => message.replaceAll(`{${key}}`, value), template).trim();
}

async function tenantIdsForAudit(audit: AuditForChat, actor?: ActorForChat | null) {
  const ids = new Set<string>();
  const details = objectDetails(audit.details);
  if (typeof details.tenantId === "string" && details.tenantId) ids.add(details.tenantId);
  if (actor?.tenantId) ids.add(actor.tenantId);
  if (audit.actorId) {
    const memberships = await prisma.tenantMembership.findMany({
      where: { userId: audit.actorId, active: true },
      select: { tenantId: true }
    });
    memberships.forEach((membership) => ids.add(membership.tenantId));
  }
  return Array.from(ids);
}

async function canActorSendToCircle(actorId: string, tenantId: string, circleId: string) {
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { role: true, tenantId: true } });
  if (!actor) return false;
  if ((actor.role === "ADMIN" || actor.role === "SUPER_ADMIN") && actor.tenantId === tenantId) return true;
  const membership = await prisma.tenantMembership.findFirst({
    where: { tenantId, circleId, userId: actorId, active: true, user: { active: true } },
    select: { id: true }
  });
  return Boolean(membership);
}

async function senderIdForRule(rule: RuleForChat, audit: AuditForChat) {
  if (audit.actorId && await canActorSendToCircle(audit.actorId, rule.tenantId, rule.targetCircleId)) return audit.actorId;
  const membership = await prisma.tenantMembership.findFirst({
    where: { tenantId: rule.tenantId, circleId: rule.targetCircleId, active: true, user: { active: true } },
    orderBy: { createdAt: "asc" },
    select: { userId: true }
  });
  if (membership?.userId) return membership.userId;
  const admin = await prisma.tenantMembership.findFirst({
    where: { tenantId: rule.tenantId, active: true, user: { active: true, role: { in: ["ADMIN", "SUPER_ADMIN"] } } },
    orderBy: { createdAt: "asc" },
    select: { userId: true }
  });
  return admin?.userId || null;
}

async function sendRule(rule: RuleForChat, audit: AuditForChat, actor?: ActorForChat | null) {
  const senderId = await senderIdForRule(rule, audit);
  if (!senderId) return { sent: 0, failed: 1, error: "missing_sender" };
  const body = renderTemplate(rule.message, audit, actor);
  if (!body) return { sent: 0, failed: 1, error: "empty_message" };

  const message = await prisma.circleChatMessage.create({
    data: {
      tenantId: rule.tenantId,
      circleId: rule.targetCircleId,
      senderId,
      body
    }
  });
  await createCircleChatReceipts(message.id, rule.tenantId, rule.targetCircleId, senderId);

  const chatAudit = await prisma.auditLog.create({
    data: {
      actorId: senderId,
      action: "circle_chat_message_created",
      entityType: "circleChatMessage",
      entityId: message.id,
      title: `Chat-Ereignis: ${actionLabel(audit.action)}`,
      href: `/chat?circleId=${rule.targetCircleId}`,
      details: {
        circleId: rule.targetCircleId,
        sourceAction: audit.action,
        sourceAuditId: audit.id,
        chatNotificationRuleId: rule.id,
        generatedFromEvent: true,
        excludeActorFromTargets: true,
        text: body.slice(0, 240)
      }
    }
  });
  await awardPointsForAudit({
    auditLogId: chatAudit.id,
    actorId: chatAudit.actorId,
    action: chatAudit.action,
    title: chatAudit.title
  });
  await Promise.all([
    dispatchAuditNotifications(chatAudit),
    dispatchEmailAuditNotifications(chatAudit),
    dispatchExternalPushNotifications(chatAudit),
    dispatchNativePushNotifications(chatAudit)
  ]);
  return { sent: 1, failed: 0 };
}

export async function dispatchChatAuditNotifications(audit: AuditForChat) {
  if (ignoredActions.has(audit.action)) return;
  const actor = audit.actorId
    ? await prisma.user.findUnique({ where: { id: audit.actorId }, include: { profile: true } })
    : null;
  const tenantIds = await tenantIdsForAudit(audit, actor);
  if (!tenantIds.length) return;
  const rules = await prisma.chatNotificationRule.findMany({
    where: {
      tenantId: { in: tenantIds },
      action: { in: notificationActionAliases(audit.action) },
      active: true
    },
    include: { targetCircle: { select: { id: true, name: true, tenantId: true } } },
    orderBy: { createdAt: "asc" }
  });
  if (!rules.length) return;
  for (const rule of rules) {
    try {
      await sendRule(rule, audit, actor);
    } catch (error) {
      console.error("chat notification failed", error);
      await prisma.auditLog.create({
        data: {
          actorId: audit.actorId || null,
          action: "chat_notification_failed",
          entityType: "chatNotificationRule",
          entityId: rule.id,
          title: `Chat-Ereignis fehlgeschlagen: ${actionLabel(audit.action)}`,
          href: "/settings/chat#notifications",
          details: {
            sourceAction: audit.action,
            sourceAuditId: audit.id,
            targetCircleId: rule.targetCircleId,
            error: error instanceof Error ? error.message : String(error)
          }
        }
      });
    }
  }
}

export async function testChatNotificationRule(ruleId: string, actorId: string) {
  const rule = await prisma.chatNotificationRule.findUnique({
    where: { id: ruleId },
    include: { targetCircle: { select: { id: true, name: true, tenantId: true } } }
  });
  if (!rule) return { sent: 0, failed: 0, error: "missing_rule" };
  const actor = await prisma.user.findUnique({ where: { id: actorId }, include: { profile: true } });
  const audit: AuditForChat = {
    id: `test-${Date.now()}`,
    actorId,
    action: rule.action,
    title: `Test: ${actionLabel(rule.action)}`,
    href: "/settings/chat#notifications",
    entityType: "chatNotificationRule",
    entityId: rule.id,
    details: { test: true, tenantId: rule.tenantId }
  };
  try {
    return await sendRule(rule, audit, actor);
  } catch (error) {
    console.error("chat notification test failed", error);
    return { sent: 0, failed: 1, error: error instanceof Error ? error.message : "failed" };
  }
}
