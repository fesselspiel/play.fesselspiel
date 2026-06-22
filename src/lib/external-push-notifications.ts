import type { AuditLog } from "@prisma/client";
import { env } from "@/lib/env";
import { actionLabel } from "@/lib/notification-actions";
import { prisma } from "@/lib/prisma";

type AuditForPush = AuditLog;

function fullUrl(href?: string | null) {
  if (!href) return "";
  if (/^https?:\/\//i.test(href)) return href;
  return `${env.appUrl}${href.startsWith("/") ? href : `/${href}`}`;
}

function actorName(actor?: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null } | null) {
  return actor?.profile?.displayName || actor?.name || actor?.username || actor?.email || "System";
}

function renderTemplate(template: string, audit: Pick<AuditForPush, "action" | "title" | "href" | "entityType" | "entityId" | "details">, actor?: Parameters<typeof actorName>[0]) {
  const detailsJson = audit.details ? JSON.stringify(audit.details) : "{}";
  const values: Record<string, string> = {
    title: audit.title,
    actor: actorName(actor),
    action: audit.action,
    event: actionLabel(audit.action),
    entityType: audit.entityType || "",
    entityId: audit.entityId || "",
    url: fullUrl(audit.href),
    details: audit.details ? JSON.stringify(audit.details) : "",
    detailsJson
  };
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => values[key] ?? "");
}

function parseHeaders(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, headerValue]) => [key, String(headerValue)]));
}

async function tenantIdForAudit(audit: AuditForPush) {
  if (audit.actorId) {
    const actor = await prisma.user.findUnique({ where: { id: audit.actorId }, select: { tenantId: true } });
    if (actor?.tenantId) return actor.tenantId;
  }
  return null;
}

export async function dispatchExternalPushNotifications(audit: AuditForPush) {
  const tenantId = await tenantIdForAudit(audit);
  if (!tenantId) return;
  const rules = await prisma.externalPushRule.findMany({
    where: { tenantId, action: audit.action, active: true },
    orderBy: { createdAt: "asc" }
  });
  if (!rules.length) return;
  const actor = audit.actorId
    ? await prisma.user.findUnique({ where: { id: audit.actorId }, include: { profile: true } })
    : null;
  await Promise.allSettled(rules.map(async (rule) => {
    const payload = renderTemplate(rule.payloadTemplate, audit, actor);
    try {
      const response = await fetch(rule.url, {
        method: rule.method || "POST",
        headers: { "Content-Type": "application/json", ...parseHeaders(rule.headersJson) },
        body: rule.method === "GET" ? undefined : payload
      });
      await prisma.externalPushLog.create({
        data: {
          tenantId,
          ruleId: rule.id,
          action: audit.action,
          url: rule.url,
          status: response.ok ? "SENT" : "FAILED",
          statusCode: response.status,
          error: response.ok ? null : (await response.text().catch(() => "")).slice(0, 1000)
        }
      });
      await prisma.auditLog.create({
        data: {
          actorId: audit.actorId,
          action: response.ok ? "external_push_sent" : "external_push_failed",
          entityType: "externalPushRule",
          entityId: rule.id,
          title: response.ok ? `Externer Push gesendet: ${rule.name}` : `Externer Push fehlgeschlagen: ${rule.name}`,
          href: "/messages#external-push",
          details: {
            sourceAction: audit.action,
            sourceTitle: audit.title,
            ruleName: rule.name,
            url: rule.url,
            statusCode: response.status,
            payload: payload.slice(0, 2000)
          }
        }
      });
    } catch (error) {
      await prisma.externalPushLog.create({
        data: {
          tenantId,
          ruleId: rule.id,
          action: audit.action,
          url: rule.url,
          status: "FAILED",
          error: error instanceof Error ? error.message.slice(0, 1000) : "Unbekannter Fehler"
        }
      });
      await prisma.auditLog.create({
        data: {
          actorId: audit.actorId,
          action: "external_push_failed",
          entityType: "externalPushRule",
          entityId: rule.id,
          title: `Externer Push fehlgeschlagen: ${rule.name}`,
          href: "/messages#external-push",
          details: {
            sourceAction: audit.action,
            sourceTitle: audit.title,
            ruleName: rule.name,
            url: rule.url,
            error: error instanceof Error ? error.message.slice(0, 1000) : "Unbekannter Fehler",
            payload: payload.slice(0, 2000)
          }
        }
      });
    }
  }));
}

export async function testExternalPushRule(ruleId: string, actorId: string) {
  const rule = await prisma.externalPushRule.findUnique({ where: { id: ruleId } });
  if (!rule) return { sent: 0, failed: 0 };
  const actor = await prisma.user.findUnique({ where: { id: actorId }, include: { profile: true } });
  const audit = {
    id: "test",
    actorId,
    action: rule.action,
    title: `Test: ${actionLabel(rule.action)}`,
    href: "/messages#external-push",
    entityType: "externalPushRule",
    entityId: rule.id,
    details: { test: true, message: "Test aus Playplaner" },
    createdAt: new Date()
  } satisfies AuditLog;
  const payload = renderTemplate(rule.payloadTemplate, audit, actor);
  try {
    const response = await fetch(rule.url, {
      method: rule.method || "POST",
      headers: { "Content-Type": "application/json", ...parseHeaders(rule.headersJson) },
      body: rule.method === "GET" ? undefined : payload
    });
    const responseText = response.ok ? "" : (await response.text().catch(() => "")).slice(0, 1000);
    await prisma.externalPushLog.create({
      data: {
        tenantId: rule.tenantId,
        ruleId: rule.id,
        action: rule.action,
        url: rule.url,
        status: response.ok ? "SENT" : "FAILED",
        statusCode: response.status,
        error: response.ok ? null : responseText
      }
    });
    await prisma.auditLog.create({
      data: {
        actorId,
        action: response.ok ? "external_push_sent" : "external_push_failed",
        entityType: "externalPushRule",
        entityId: rule.id,
        title: response.ok ? `Test-Push gesendet: ${rule.name}` : `Test-Push fehlgeschlagen: ${rule.name}`,
        href: "/messages#external-push",
        details: {
          test: true,
          sourceAction: rule.action,
          ruleName: rule.name,
          url: rule.url,
          method: rule.method || "POST",
          statusCode: response.status,
          response: responseText,
          payload: payload.slice(0, 2000)
        }
      }
    });
    return { sent: response.ok ? 1 : 0, failed: response.ok ? 0 : 1 };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Unbekannter Fehler";
    await prisma.externalPushLog.create({
      data: {
        tenantId: rule.tenantId,
        ruleId: rule.id,
        action: rule.action,
        url: rule.url,
        status: "FAILED",
        error: message
      }
    });
    await prisma.auditLog.create({
      data: {
        actorId,
        action: "external_push_failed",
        entityType: "externalPushRule",
        entityId: rule.id,
        title: `Test-Push fehlgeschlagen: ${rule.name}`,
        href: "/messages#external-push",
        details: {
          test: true,
          sourceAction: rule.action,
          ruleName: rule.name,
          url: rule.url,
          method: rule.method || "POST",
          error: message,
          payload: payload.slice(0, 2000)
        }
      }
    });
    return { sent: 0, failed: 1 };
  }
}
