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

export function serializeCircleChatMessage(
  message: {
    id: string;
    body: string | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    file?: { id: string; originalName: string; mimeType: string; sizeBytes: number } | null;
    sender: { id: string; username: string | null; name: string | null; email: string | null; profile?: { displayName: string | null; imageUrl: string | null } | null };
  },
  currentUserId?: string
) {
  const file = message.file;
  return {
    id: message.id,
    body: message.body || "",
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
    deletedAt: message.deletedAt?.toISOString() || null,
    own: message.sender.id === currentUserId,
    sender: {
      id: message.sender.id,
      username: message.sender.username,
      displayName: userDisplayName(message.sender),
      imageUrl: message.sender.profile?.imageUrl || null
    },
    file: file ? {
      id: file.id,
      url: fileAssetUrl(file.id),
      downloadPath: `/api/files/${file.id}`,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      kind: file.mimeType.startsWith("image/") ? "image" : file.mimeType.startsWith("video/") ? "video" : "file"
    } : null
  };
}

