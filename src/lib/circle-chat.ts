import { prisma } from "@/lib/prisma";
import { fileAssetUrl } from "@/lib/files";
import { userDisplayName } from "@/lib/audit";

export type CircleChatUser = {
  id: string;
  tenantId?: string | null;
  circleId?: string | null;
  role?: string | null;
};

export async function requireCircleChatScope(user: CircleChatUser) {
  if (!user.tenantId) throw new Error("Keine Seite aktiv");
  if (user.circleId) return { tenantId: user.tenantId, circleId: user.circleId };
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
    const circle = await prisma.circle.findFirst({ where: { tenantId: user.tenantId }, orderBy: { createdAt: "asc" } });
    if (circle) return { tenantId: user.tenantId, circleId: circle.id };
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
