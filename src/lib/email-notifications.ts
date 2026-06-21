import type { AuditLog } from "@prisma/client";
import { env } from "@/lib/env";
import { actionLabel } from "@/lib/notification-actions";
import { prisma } from "@/lib/prisma";
import { sendTemplateEmail } from "@/lib/email";

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

function variablesForAudit(
  audit: Pick<AuditForNotification, "action" | "title" | "href" | "entityType" | "entityId" | "details">,
  actor?: Parameters<typeof actorName>[0]
) {
  const url = fullUrl(audit.href);
  return {
    userName: "",
    loginIdentifier: "",
    appUrl: env.appUrl,
    profileUrl: `${env.appUrl}/profile`,
    loginTime: "",
    confirmUrl: "",
    resetUrl: "",
    title: audit.title,
    actor: actorName(actor),
    action: audit.action,
    event: actionLabel(audit.action),
    entityType: audit.entityType || "",
    entityId: audit.entityId || "",
    url,
    details: audit.details ? JSON.stringify(audit.details) : ""
  };
}

async function findRulesForAudit(audit: Pick<AuditForNotification, "action">) {
  return prisma.emailNotificationRule.findMany({
    where: { action: audit.action, active: true },
    include: {
      targetUser: { include: { profile: true } },
      targetCircle: true,
      template: true
    }
  });
}

async function recipientsForRule(rule: RuleForNotification) {
  if (rule.targetUserId) {
    const user = await prisma.user.findFirst({ where: { id: rule.targetUserId, active: true }, include: { profile: true } });
    return user ? [user] : [];
  }
  if (rule.targetCircleId) {
    const memberships = await prisma.tenantMembership.findMany({
      where: { circleId: rule.targetCircleId, active: true, user: { active: true } },
      include: { user: { include: { profile: true } } },
      orderBy: { createdAt: "asc" }
    });
    return memberships.map((membership) => membership.user);
  }
  return [];
}

async function sendRule(rule: RuleForNotification, audit: Pick<AuditForNotification, "action" | "title" | "href" | "entityType" | "entityId" | "details">, actor: Parameters<typeof actorName>[0] | null) {
  const users = await recipientsForRule(rule);
  const sentTo = new Set<string>();
  const tasks = users
    .filter((user) => {
      if (!user.email || sentTo.has(user.email)) return false;
      sentTo.add(user.email);
      return true;
    })
    .map((user) =>
      sendTemplateEmail({
        key: rule.templateKey,
        to: user.email,
        variables: {
          ...variablesForAudit(audit, actor),
          userName: actorName(user),
          loginIdentifier: user.username || user.email,
          profileUrl: `${env.appUrl}/profile`
        }
      })
    );
  return Promise.allSettled(tasks);
}

export async function dispatchEmailAuditNotifications(audit: AuditForNotification) {
  const rules = await findRulesForAudit(audit);
  if (!rules.length) return;
  const actor = audit.actorId
    ? await prisma.user.findUnique({ where: { id: audit.actorId }, include: { profile: true } })
    : null;
  for (const rule of rules) {
    const results = await sendRule(rule, audit, actor);
    results.forEach((result) => {
      if (result.status === "rejected") console.error("email notification failed", result.reason);
    });
  }
}

export async function testEmailNotificationRule(ruleId: string, actorId: string) {
  const rule = await prisma.emailNotificationRule.findUnique({
    where: { id: ruleId },
    include: { targetUser: { include: { profile: true } }, targetCircle: true, template: true }
  });
  if (!rule) return { sent: 0, failed: 0 };
  const actor = await prisma.user.findUnique({ where: { id: actorId }, include: { profile: true } });
  const results = await sendRule(rule, {
    action: rule.action,
    title: `Test: ${actionLabel(rule.action)}`,
    href: "/settings/email#notifications",
    entityType: "emailNotificationRule",
    entityId: rule.id,
    details: { test: true }
  }, actor);
  return {
    sent: results.filter((result) => result.status === "fulfilled" && result.value.sent).length,
    failed: results.filter((result) => result.status === "rejected" || (result.status === "fulfilled" && !result.value.sent)).length
  };
}
