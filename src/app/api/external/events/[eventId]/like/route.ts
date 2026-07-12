import { NextRequest, NextResponse } from "next/server";
import { accessibleOwnerIds, type AccessUser } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function displayName(user?: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null } | null) {
  return user?.profile?.displayName || user?.name || user?.username || user?.email || null;
}

async function findLikeableAuditLog(user: AccessUser, eventId: string) {
  const ownerIds = await accessibleOwnerIds(user);
  return prisma.auditLog.findFirst({
    where: {
      id: eventId,
      actorId: { in: ownerIds }
    },
    select: { id: true, title: true, href: true, actorId: true }
  });
}

async function engagement(eventId: string, userId: string) {
  const likes = await prisma.feedLike.findMany({
    where: { auditLogId: eventId },
    include: { user: { include: { profile: true } } },
    orderBy: { createdAt: "asc" }
  });
  return {
    likedByMe: likes.some((like) => like.userId === userId),
    own: likes.some((like) => like.userId === userId),
    likeCount: likes.length,
    canLike: true,
    likes: likes.map((like) => ({
      id: like.id,
      createdAt: like.createdAt.toISOString(),
      own: like.userId === userId,
      user: like.user ? {
        id: like.user.id,
        username: like.user.username,
        displayName: displayName(like.user),
        imageUrl: like.user.profile?.imageUrl || null
      } : null
    }))
  };
}

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "auditLog");
  if (blocked) return blocked;
  const auditLog = await findLikeableAuditLog(auth.user, params.eventId);
  if (!auditLog) return NextResponse.json({ ok: false, error: "event_not_found" }, { status: 404 });
  const existing = await prisma.feedLike.findUnique({ where: { auditLogId_userId: { auditLogId: auditLog.id, userId: auth.user.id } } });
  if (!existing) {
    await prisma.feedLike.create({ data: { auditLogId: auditLog.id, userId: auth.user.id } });
    await logAction({
      actorId: auth.user.id,
      action: "feed_liked",
      entityType: "auditLog",
      entityId: auditLog.id,
      title: `Feed geliked: ${auditLog.title}`,
      href: auditLog.href || "/",
      details: { auditLogId: auditLog.id }
    });
  }
  const state = await engagement(auditLog.id, auth.user.id);
  return NextResponse.json({ ok: true, eventId: auditLog.id, item: { id: auditLog.id, likedByMe: true, engagement: state }, ...state });
}

export async function DELETE(request: NextRequest, { params }: { params: { eventId: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "auditLog");
  if (blocked) return blocked;
  const auditLog = await findLikeableAuditLog(auth.user, params.eventId);
  if (!auditLog) return NextResponse.json({ ok: false, error: "event_not_found" }, { status: 404 });
  const existing = await prisma.feedLike.findUnique({ where: { auditLogId_userId: { auditLogId: auditLog.id, userId: auth.user.id } } });
  if (existing) {
    await prisma.feedLike.delete({ where: { id: existing.id } });
    await logAction({
      actorId: auth.user.id,
      action: "feed_unliked",
      entityType: "auditLog",
      entityId: auditLog.id,
      title: `Feed-Like entfernt: ${auditLog.title}`,
      href: auditLog.href || "/",
      details: { auditLogId: auditLog.id }
    });
  }
  const state = await engagement(auditLog.id, auth.user.id);
  return NextResponse.json({ ok: true, eventId: auditLog.id, item: { id: auditLog.id, likedByMe: false, engagement: state }, ...state });
}
