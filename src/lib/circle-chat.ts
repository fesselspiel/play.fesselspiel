import { prisma } from "@/lib/prisma";
import { fileAssetUrl } from "@/lib/files";
import { userDisplayName } from "@/lib/audit";
import { selfBondageCategory } from "@/lib/activity-orders";

export type CircleChatUser = {
  id: string;
  tenantId?: string | null;
  circleId?: string | null;
  role?: string | null;
};

export type CircleChatScope = {
  tenantId: string;
  circleId: string;
  circleName: string;
};

export async function requireCircleChatScope(user: CircleChatUser, requestedCircleId?: string | null): Promise<CircleChatScope> {
  if (!user.tenantId) throw new Error("Keine Seite aktiv");
  if (requestedCircleId) {
    const circle = await prisma.circle.findFirst({ where: { id: requestedCircleId, tenantId: user.tenantId }, select: { id: true, name: true } });
    if (!circle || !(await canAccessCircleChat(user, circle.id))) throw new Error("Kein Zugriff auf diesen Zirkel");
    return { tenantId: user.tenantId, circleId: circle.id, circleName: circle.name };
  }
  if (user.circleId) {
    const circle = await prisma.circle.findFirst({ where: { id: user.circleId, tenantId: user.tenantId }, select: { id: true, name: true } });
    if (circle) return { tenantId: user.tenantId, circleId: circle.id, circleName: circle.name };
  }
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
    const circle = await prisma.circle.findFirst({ where: { tenantId: user.tenantId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
    if (circle) return { tenantId: user.tenantId, circleId: circle.id, circleName: circle.name };
  }
  throw new Error("Kein Zirkel für den Chat gefunden");
}

export async function canAccessCircleChat(user: CircleChatUser, circleId: string) {
  if (!user.tenantId) return false;
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
    return Boolean(await prisma.circle.findFirst({ where: { id: circleId, tenantId: user.tenantId }, select: { id: true } }));
  }
  if (!user.circleId || user.circleId !== circleId) return false;
  const membership = await prisma.tenantMembership.findFirst({
    where: { tenantId: user.tenantId, circleId, userId: user.id, active: true, user: { active: true } },
    select: { id: true }
  });
  return Boolean(membership);
}

export async function circleChatMembers(tenantId: string, circleId: string) {
  const memberships = await prisma.tenantMembership.findMany({
    where: { tenantId, circleId, active: true, user: { active: true } },
    include: { user: { include: { profile: true } } },
    orderBy: { createdAt: "asc" }
  });
  return memberships.map((membership) => membership.user);
}

export async function accessibleCircleChats(user: CircleChatUser) {
  if (!user.tenantId) return [];
  const circles = user.role === "ADMIN" || user.role === "SUPER_ADMIN"
    ? await prisma.circle.findMany({
        where: { tenantId: user.tenantId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, _count: { select: { memberships: { where: { active: true, user: { active: true } } } } } }
      })
    : await prisma.circle.findMany({
        where: { tenantId: user.tenantId, memberships: { some: { userId: user.id, active: true, user: { active: true } } } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, _count: { select: { memberships: { where: { active: true, user: { active: true } } } } } }
      });
  const summaries = await Promise.all(circles.map(async (circle) => {
    const [lastMessage, unreadCount] = await Promise.all([
      prisma.circleChatMessage.findFirst({
        where: { tenantId: user.tenantId!, circleId: circle.id, deletedAt: null },
        include: { sender: { include: { profile: true } }, file: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      }),
      prisma.circleChatMessage.count({
        where: {
          tenantId: user.tenantId!,
          circleId: circle.id,
          deletedAt: null,
          senderId: { not: user.id },
          OR: [
            { receipts: { none: { userId: user.id } } },
            { receipts: { some: { userId: user.id, readAt: null } } }
          ]
        }
      })
    ]);
    return {
      id: circle.id,
      name: circle.name,
      current: circle.id === user.circleId,
      default: circle.id === user.circleId,
      memberCount: circle._count.memberships,
      unreadCount,
      lastMessage: lastMessage ? {
        id: lastMessage.id,
        body: lastMessage.body || "",
        createdAt: lastMessage.createdAt.toISOString(),
        hasFile: Boolean(lastMessage.fileId),
        fileKind: lastMessage.file?.mimeType.startsWith("image/") ? "image" : lastMessage.file?.mimeType.startsWith("video/") ? "video" : lastMessage.file ? "file" : null,
        sender: {
          id: lastMessage.sender.id,
          displayName: userDisplayName(lastMessage.sender)
        }
      } : null
    };
  }));
  return summaries;
}

export async function createCircleChatReceipts(messageId: string, tenantId: string, circleId: string, senderId: string) {
  const now = new Date();
  const members = await circleChatMembers(tenantId, circleId);
  await prisma.$transaction(members.map((member) => prisma.circleChatReceipt.upsert({
    where: { messageId_userId: { messageId, userId: member.id } },
    update: {
      deliveredAt: now,
      ...(member.id === senderId ? { readAt: now } : {})
    },
    create: {
      messageId,
      userId: member.id,
      deliveredAt: now,
      readAt: member.id === senderId ? now : null
    }
  })));
}

export async function markCircleChatRead(input: {
  tenantId: string;
  circleId: string;
  userId: string;
  messageIds?: string[];
  upToMessageId?: string | null;
  upToCreatedAt?: Date | null;
}) {
  const now = new Date();
  let upToCreatedAt = input.upToCreatedAt || null;
  if (!upToCreatedAt && input.upToMessageId) {
    const message = await prisma.circleChatMessage.findFirst({
      where: {
        id: input.upToMessageId,
        tenantId: input.tenantId,
        circleId: input.circleId,
        deletedAt: null
      },
      select: { createdAt: true }
    });
    upToCreatedAt = message?.createdAt || null;
  }
  const messages = await prisma.circleChatMessage.findMany({
    where: {
      tenantId: input.tenantId,
      circleId: input.circleId,
      deletedAt: null,
      senderId: { not: input.userId },
      ...(input.messageIds?.length ? { id: { in: input.messageIds } } : {}),
      ...(upToCreatedAt ? { createdAt: { lte: upToCreatedAt } } : {})
    },
    select: { id: true },
    take: 500
  });
  await prisma.$transaction(messages.map((message) => prisma.circleChatReceipt.upsert({
    where: { messageId_userId: { messageId: message.id, userId: input.userId } },
    update: { deliveredAt: now, readAt: now },
    create: { messageId: message.id, userId: input.userId, deliveredAt: now, readAt: now }
  })));
  return { count: messages.length, readAt: now };
}

export function serializeCircleChatMessage(
  message: {
    id: string;
    body: string | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    file?: { id: string; originalName: string; mimeType: string; sizeBytes: number } | null;
    circle?: { id: string; name: string } | null;
    sender: { id: string; username: string | null; name: string | null; email: string | null; profile?: { displayName: string | null; imageUrl: string | null } | null };
    receipts?: {
      deliveredAt: Date | null;
      readAt: Date | null;
      user: { id: string; username: string | null; name: string | null; email: string | null; profile?: { displayName: string | null; imageUrl: string | null } | null };
    }[];
  },
  currentUserId?: string,
  currentUserRole?: string | null
) {
  const file = message.file;
  const receipts = message.receipts || [];
  const recipientReceipts = receipts.filter((receipt) => receipt.user.id !== message.sender.id);
  const currentUserReceipt = currentUserId ? receipts.find((receipt) => receipt.user.id === currentUserId) : null;
  const canDelete = Boolean(currentUserId && (message.sender.id === currentUserId || currentUserRole === "ADMIN" || currentUserRole === "SUPER_ADMIN"));
  const deleted = Boolean(message.deletedAt);
  return {
    id: message.id,
    body: deleted ? "" : message.body || "",
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
    deletedAt: message.deletedAt?.toISOString() || null,
    deleted,
    own: message.sender.id === currentUserId,
    canDelete,
    permissions: { delete: canDelete },
    circle: message.circle ? {
      id: message.circle.id,
      name: message.circle.name
    } : null,
    sender: {
      id: message.sender.id,
      username: message.sender.username,
      displayName: userDisplayName(message.sender),
      imageUrl: message.sender.profile?.imageUrl || null
    },
    file: !deleted && file ? {
      id: file.id,
      url: fileAssetUrl(file.id),
      downloadPath: `/api/files/${file.id}`,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      kind: file.mimeType.startsWith("image/") ? "image" : file.mimeType.startsWith("video/") ? "video" : "file"
    } : null,
    receipt: currentUserReceipt ? {
      deliveredAt: currentUserReceipt.deliveredAt?.toISOString() || null,
      readAt: currentUserReceipt.readAt?.toISOString() || null
    } : null,
    receipts: receipts.map((receipt) => ({
      userId: receipt.user.id,
      displayName: userDisplayName(receipt.user),
      deliveredAt: receipt.deliveredAt?.toISOString() || null,
      readAt: receipt.readAt?.toISOString() || null
    })),
    readSummary: {
      recipients: recipientReceipts.length,
      delivered: recipientReceipts.filter((receipt) => receipt.deliveredAt).length,
      read: recipientReceipts.filter((receipt) => receipt.readAt).length,
      allDelivered: recipientReceipts.length > 0 && recipientReceipts.every((receipt) => receipt.deliveredAt),
      allRead: recipientReceipts.length > 0 && recipientReceipts.every((receipt) => receipt.readAt)
    }
  };
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cardEntityFromDetails(details: unknown) {
  const data = objectValue(details);
  const entityType = String(data.entityType || objectValue(data.entity).entityType || objectValue(data.target).entityType || "").toLowerCase();
  const targetScreen = String(data.targetScreen || objectValue(data.target).screen || "").toLowerCase();
  const entityId = data.entityId || objectValue(data.entity).entityId || objectValue(data.entity).id || objectValue(data.target).entityId || objectValue(data.target).id;
  if (typeof entityId !== "string" || !entityId) return null;
  if (entityType === "order" || targetScreen === "orders") return { id: entityId, kind: "order" as const };
  if (entityType === "session" || entityType === "activity" || targetScreen === "sessions" || targetScreen === "activities") return { id: entityId, kind: "session" as const };
  return null;
}

function sessionPermissions(activity: { ownerId: string; status: string }, currentUserId?: string, currentUserRole?: string | null) {
  const admin = currentUserRole === "ADMIN" || currentUserRole === "SUPER_ADMIN";
  const responder = Boolean(currentUserId && (activity.ownerId !== currentUserId || admin));
  const ownerOrAdmin = Boolean(currentUserId && (activity.ownerId === currentUserId || admin));
  return {
    canConfirm: activity.status === "REQUESTED" && responder,
    canReschedule: activity.status === "REQUESTED" && responder,
    canDecline: activity.status === "REQUESTED" && responder,
    canStart: activity.status === "PLANNED" && (responder || ownerOrAdmin),
    canCancel: (activity.status === "REQUESTED" || activity.status === "PLANNED") && (responder || ownerOrAdmin)
  };
}

function sessionActions(permissions: ReturnType<typeof sessionPermissions>) {
  return [
    permissions.canConfirm ? "CONFIRM" : null,
    permissions.canReschedule ? "RESCHEDULE" : null,
    permissions.canDecline ? "DECLINE" : null,
    permissions.canStart ? "START" : null,
    permissions.canCancel ? "CANCEL" : null
  ].filter(Boolean) as string[];
}

function sessionActionTargets(sessionId: string, permissions: ReturnType<typeof sessionPermissions>) {
  const path = `/api/external/sessions/${sessionId}`;
  return {
    ...(permissions.canConfirm ? { CONFIRM: { method: "PATCH", path, body: { status: "PLANNED" } } } : {}),
    ...(permissions.canReschedule ? { RESCHEDULE: { method: "PATCH", path, body: { plannedAt: "ISO_DATE_TIME", status: "REQUESTED" } } } : {}),
    ...(permissions.canDecline ? { DECLINE: { method: "PATCH", path, body: { status: "DISCARDED" } } } : {}),
    ...(permissions.canStart ? { START: { method: "PATCH", path, body: { status: "DONE" } } } : {}),
    ...(permissions.canCancel ? { CANCEL: { method: "PATCH", path, body: { status: "DISCARDED" } } } : {})
  };
}

async function sessionCardsForMessages(
  messages: { id: string }[],
  currentUserId?: string,
  currentUserRole?: string | null
) {
  const messageIds = messages.map((message) => message.id);
  const cards = new Map<string, unknown>();
  if (!messageIds.length) return cards;
  const chatAudits = await prisma.auditLog.findMany({
    where: { entityType: "circleChatMessage", entityId: { in: messageIds } },
    select: { entityId: true, details: true },
    orderBy: { createdAt: "desc" }
  });
  const sourceByMessage = new Map<string, string>();
  const activityByMessage = new Map<string, { id: string; kind: "session" | "order" }>();
  for (const audit of chatAudits) {
    if (!audit.entityId) continue;
    const directActivity = cardEntityFromDetails(audit.details);
    if (directActivity && !activityByMessage.has(audit.entityId)) {
      activityByMessage.set(audit.entityId, directActivity);
      continue;
    }
    if (sourceByMessage.has(audit.entityId)) continue;
    const sourceAuditId = objectValue(audit.details).sourceAuditId;
    if (typeof sourceAuditId === "string" && sourceAuditId) sourceByMessage.set(audit.entityId, sourceAuditId);
  }
  const sourceAuditIds = Array.from(new Set(sourceByMessage.values()));
  const sourceAudits = sourceAuditIds.length ? await prisma.auditLog.findMany({
    where: { id: { in: sourceAuditIds } },
    select: { id: true, entityType: true, entityId: true }
  }) : [];
  const sourceById = new Map(sourceAudits.map((audit) => [audit.id, audit]));
  for (const [messageId, sourceAuditId] of sourceByMessage.entries()) {
    const source = sourceById.get(sourceAuditId);
    if (source?.entityType === "activity" && source.entityId && !activityByMessage.has(messageId)) {
      activityByMessage.set(messageId, { id: source.entityId, kind: "session" });
    }
  }
  const activityIds = Array.from(new Set([
    ...Array.from(activityByMessage.values()).map((entry) => entry.id),
    ...sourceAudits
    .filter((audit) => audit.entityType === "activity" && audit.entityId)
    .map((audit) => audit.entityId as string)
  ]));
  if (!activityIds.length) return cards;
  const activities = await prisma.activityPlan.findMany({
    where: { id: { in: activityIds } },
    include: { owner: { include: { profile: true } } }
  });
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));
  for (const [messageId, cardSource] of activityByMessage.entries()) {
    const activity = activityById.get(cardSource.id);
    if (!activity) continue;
    const isOrder = cardSource.kind === "order" || activity.category === selfBondageCategory;
    const href = isOrder ? `/orders#order-${activity.id}` : `/activities/${activity.slug}`;
    const permissions = sessionPermissions(activity, currentUserId, currentUserRole);
    const actions = sessionActions(permissions);
    const entity = {
      type: isOrder ? "order" : "session",
      entityType: isOrder ? "order" : "session",
      entityId: activity.id,
      id: activity.id,
      title: activity.title,
      status: activity.status,
      plannedAt: activity.plannedAt?.toISOString() || null,
      href,
      owner: {
        id: activity.owner.id,
        username: activity.owner.username,
        displayName: userDisplayName(activity.owner)
      }
    };
    cards.set(messageId, {
      entity,
      target: {
        screen: isOrder ? "orders" : "activities",
        entityType: isOrder ? "order" : "session",
        entityId: activity.id,
        id: activity.id,
        href
      },
      [isOrder ? "order" : "session"]: {
        ...entity,
        permissions,
        capabilities: permissions,
        actions,
        actionTargets: sessionActionTargets(activity.id, permissions),
        statusActions: {
          CONFIRM: "PLANNED",
          DECLINE: "DISCARDED",
          RESCHEDULE: "REQUESTED",
          START: "DONE",
          CANCEL: "DISCARDED"
        }
      },
      permissions: { ...permissions, delete: false },
      capabilities: permissions,
      actions
    });
  }
  return cards;
}

export async function serializeCircleChatMessages(
  messages: Parameters<typeof serializeCircleChatMessage>[0][],
  currentUserId?: string,
  currentUserRole?: string | null
) {
  const cards = await sessionCardsForMessages(messages, currentUserId, currentUserRole);
  return messages.map((message) => {
    const serialized = serializeCircleChatMessage(message, currentUserId, currentUserRole);
    const card = cards.get(message.id);
    if (!card) return serialized;
    return {
      ...serialized,
      ...(card as Record<string, unknown>),
      permissions: {
        ...serialized.permissions,
        ...((card as { permissions?: Record<string, unknown> }).permissions || {})
      }
    };
  });
}

export async function serializeCircleChatMessageWithContext(
  message: Parameters<typeof serializeCircleChatMessage>[0],
  currentUserId?: string,
  currentUserRole?: string | null
) {
  return (await serializeCircleChatMessages([message], currentUserId, currentUserRole))[0];
}
