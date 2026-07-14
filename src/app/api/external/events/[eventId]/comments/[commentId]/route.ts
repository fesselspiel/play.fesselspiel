import { NextRequest, NextResponse } from "next/server";
import { accessibleOwnerIds } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ eventId: string; commentId: string }> }
) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "auditLog");
  if (blocked) return blocked;
  const ownerIds = await accessibleOwnerIds(auth.user);
  const comment = await prisma.feedComment.findFirst({
    where: {
      id: params.commentId,
      auditLogId: params.eventId,
      auditLog: { actorId: { in: ownerIds } }
    },
    include: { auditLog: { select: { id: true, title: true, href: true } } }
  });
  if (!comment) return NextResponse.json({ ok: false, error: "comment_not_found" }, { status: 404 });
  if (comment.authorId !== auth.user.id && auth.user.role !== "ADMIN" && auth.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  await prisma.feedComment.delete({ where: { id: comment.id } });
  await logAction({
    actorId: auth.user.id,
    action: "feed_comment_deleted",
    entityType: "auditLog",
    entityId: comment.auditLogId,
    title: `Feed-Kommentar gelöscht: ${comment.auditLog.title}`,
    href: comment.auditLog.href || "/",
    details: { auditLogId: comment.auditLogId, commentId: comment.id }
  });
  const count = await prisma.feedComment.count({ where: { auditLogId: comment.auditLogId } });
  return NextResponse.json({ ok: true, eventId: comment.auditLogId, id: comment.id, commentCount: count });
}
