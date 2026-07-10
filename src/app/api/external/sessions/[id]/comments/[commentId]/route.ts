import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";
import { findExternalSession, serializeExternalSession } from "../../../_helpers";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest, { params }: { params: { id: string; commentId: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "activities");
  if (blocked) return blocked;
  const session = await findExternalSession(auth.user, params.id);
  if (!session) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const comment = await prisma.activityComment.findFirst({ where: { id: params.commentId, activityId: session.id } });
  if (!comment) return NextResponse.json({ ok: false, error: "comment_not_found" }, { status: 404 });
  if (comment.ownerId !== auth.user.id && auth.user.role !== "ADMIN" && auth.user.role !== "SUPER_ADMIN") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  await prisma.activityComment.delete({ where: { id: comment.id } });
  await logAction({ actorId: auth.user.id, action: "activity_session_comment_deleted_api", entityType: "activity", entityId: session.id, title: `Session-Kommentar per API gelöscht: ${session.title}`, href: `/activities/${session.slug}`, details: { commentId: comment.id } });
  const updated = await findExternalSession(auth.user, session.id);
  return NextResponse.json({ ok: true, id: comment.id, item: updated ? serializeExternalSession(request, updated, auth.user.id) : null });
}
