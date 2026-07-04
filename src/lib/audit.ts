import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dispatchEmailAuditNotifications } from "@/lib/email-notifications";
import { dispatchExternalPushNotifications } from "@/lib/external-push-notifications";
import { dispatchNativePushNotifications } from "@/lib/native-push-notifications";
import { awardPointsForAudit } from "@/lib/points";
import { dispatchAuditNotifications } from "@/lib/telegram-notifications";

export type AuditActionInput = {
  actorId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  title: string;
  details?: Prisma.InputJsonValue | null;
  href?: string | null;
};

export async function logAction(input: AuditActionInput) {
  try {
    const audit = await prisma.auditLog.create({
      data: {
        actorId: input.actorId || null,
        action: input.action,
        entityType: input.entityType || null,
        entityId: input.entityId || null,
        title: input.title,
        details: input.details ?? undefined,
        href: input.href || null
      }
    });
    await awardPointsForAudit({
      auditLogId: audit.id,
      actorId: audit.actorId,
      action: audit.action,
      title: audit.title
    });
    await Promise.all([
      dispatchAuditNotifications(audit),
      dispatchEmailAuditNotifications(audit),
      dispatchExternalPushNotifications(audit),
      dispatchNativePushNotifications(audit)
    ]);
  } catch (error) {
    console.error("audit log failed", error);
  }
}

export function userDisplayName(user: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null }) {
  return user.profile?.displayName || user.name || user.username || user.email || "Unbekannter Benutzer";
}
