import { NextRequest, NextResponse } from "next/server";
import { accessibleOwnerIds, type AccessUser } from "@/lib/access";
import { logAction, userDisplayName } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function displayName(user?: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null } | null) {
  return user?.profile?.displayName || user?.name || user?.username || user?.email || null;
}

async function findCommentableAuditLog(user: AccessUser, eventId: string) {
  const ownerIds = await accessibleOwnerIds(user);
  return prisma.auditLog.findFirst({
    where: { id: eventId, actorId: { in: ownerIds } },
    select: { id: true, title: true, href: true }
  });
}

function serializeComment(comment: Awaited<ReturnType<typeof prisma.feedComment.findMany>>[number] & {
  author?: { id: string; username: string | null; name: string | null; email: string | null; profile?: { displayName: string | null; imageUrl: string | null } | null } | null;
}, currentUserId: string) {
  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    own: comment.authorId === currentUserId,
    canDelete: comment.authorId === currentUserId,
    author: comment.author ? {
      id: comment.author.id,
      username: comment.author.username,
      displayName: displayName(comment.author),
      imageUrl: comment.author.profile?.imageUrl || null
    } : null
  };
}

async function commentState(eventId: string, currentUserId: string) {
  const comments = await prisma.feedComment.findMany({
    where: { auditLogId: eventId },
    include: { author: { include: { profile: true } } },
    orderBy: { createdAt: "asc" }
  });
  return {
    canComment: true,
    commentCount: comments.length,
    comments: comments.map((comment) => serializeComment(comment, currentUserId))
  };
}

export async function GET(request: NextRequest, { params }: { params: { eventId: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "auditLog");
  if (blocked) return blocked;
  const auditLog = await findCommentableAuditLog(auth.user, params.eventId);
  if (!auditLog) return NextResponse.json({ ok: false, error: "event_not_found" }, { status: 404 });
  const state = await commentState(auditLog.id, auth.user.id);
  return NextResponse.json({ ok: true, eventId: auditLog.id, ...state });
}

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "auditLog");
  if (blocked) return blocked;
  const auditLog = await findCommentableAuditLog(auth.user, params.eventId);
  if (!auditLog) return NextResponse.json({ ok: false, error: "event_not_found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const text = String(body.body || body.text || body.comment || "").trim();
  if (!text) return NextResponse.json({ ok: false, error: "comment_required" }, { status: 400 });
  const comment = await prisma.feedComment.create({
    data: { auditLogId: auditLog.id, authorId: auth.user.id, body: text },
    include: { author: { include: { profile: true } } }
  });
  await logAction({
    actorId: auth.user.id,
    action: "feed_commented",
    entityType: "auditLog",
    entityId: auditLog.id,
    title: `${userDisplayName(auth.user)} hat kommentiert: ${auditLog.title}`,
    href: auditLog.href || "/",
    details: { auditLogId: auditLog.id, commentId: comment.id, commentPreview: text.slice(0, 160) }
  });
  const state = await commentState(auditLog.id, auth.user.id);
  return NextResponse.json({ ok: true, eventId: auditLog.id, item: serializeComment(comment, auth.user.id), ...state }, { status: 201 });
}
