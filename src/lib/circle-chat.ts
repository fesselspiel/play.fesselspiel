import { prisma } from "@/lib/prisma";
import { fileAssetUrl } from "@/lib/files";
import { userDisplayName } from "@/lib/audit";

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
