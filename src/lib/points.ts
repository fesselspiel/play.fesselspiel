import { prisma } from "@/lib/prisma";

export async function awardPointsForAudit(input: {
  auditLogId: string;
  actorId?: string | null;
  action: string;
  title: string;
}) {
  if (!input.actorId) return null;
  if ([
    "activity_consent_decline",
    "activity_consent_revoke",
    "activity_consent_cancel",
    "activity_consent_accept",
    "self_bondage_order_accepted",
    "self_bondage_order_discarded"
  ].includes(input.action)) return null;
  const actor = await prisma.user.findUnique({
    where: { id: input.actorId },
    select: { id: true, tenantId: true }
  });
  if (!actor?.tenantId) return null;
  const rule = await prisma.pointRule.findUnique({
    where: { tenantId_action: { tenantId: actor.tenantId, action: input.action } },
    select: { points: true, active: true }
  });
  if (!rule?.active || rule.points === 0) return null;
  return prisma.pointEntry.upsert({
    where: { auditLogId_userId: { auditLogId: input.auditLogId, userId: actor.id } },
    update: { points: rule.points, action: input.action, note: input.title },
    create: {
      tenantId: actor.tenantId,
      userId: actor.id,
      auditLogId: input.auditLogId,
      action: input.action,
      points: rule.points,
      note: input.title
    }
  });
}

export async function userPointTotal(userId: string, tenantId: string) {
  const result = await prisma.pointEntry.aggregate({
    where: { userId, tenantId },
    _sum: { points: true }
  });
  return result._sum.points || 0;
}

export async function tenantPointTotals(tenantId: string) {
  const groups = await prisma.pointEntry.groupBy({
    by: ["userId"],
    where: { tenantId },
    _sum: { points: true },
    _count: { id: true },
    orderBy: { _sum: { points: "desc" } }
  });
  return groups.map((group) => ({
    userId: group.userId,
    points: group._sum.points || 0,
    entries: group._count.id
  }));
}
