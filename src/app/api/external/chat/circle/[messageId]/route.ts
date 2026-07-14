import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { canAccessCircleChat } from "@/lib/circle-chat";
import { logAction, userDisplayName } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function DELETE(_request: NextRequest, props: { params: Promise<{ messageId: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(_request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "circleChat");
  if (blocked) return blocked;
  const requestedCircleId = _request.nextUrl.searchParams.get("circleId");
  const message = await prisma.circleChatMessage.findFirst({
    where: { id: params.messageId, tenantId: auth.user.tenantId || "", ...(requestedCircleId ? { circleId: requestedCircleId } : {}), deletedAt: null },
    select: { id: true, circleId: true, senderId: true, body: true, fileId: true, circle: { select: { name: true } } }
  });
  if (!message) return NextResponse.json({ ok: false, error: "Nachricht nicht gefunden" }, { status: 404 });
  if (!(await canAccessCircleChat(auth.user, message.circleId))) return NextResponse.json({ ok: false, error: "Kein Zugriff auf diesen Zirkel" }, { status: 403 });
  const canDelete = message.senderId === auth.user.id || auth.user.role === "ADMIN" || auth.user.role === "SUPER_ADMIN";
  if (!canDelete) return NextResponse.json({ ok: false, error: "Keine Berechtigung zum Löschen" }, { status: 403 });
  const deletedAt = new Date();
  await prisma.circleChatMessage.update({ where: { id: message.id }, data: { deletedAt } });
  await logAction({
    actorId: auth.user.id,
    action: "circle_chat_message_deleted_api",
    entityType: "circleChatMessage",
    entityId: message.id,
    title: `Chat-Nachricht gelöscht von ${userDisplayName(auth.user)}`,
    href: "/chat",
    details: {
      circleId: message.circleId,
      circleName: message.circle.name,
      targetScreen: "chat",
      targetId: message.circleId,
      hadFile: Boolean(message.fileId),
      text: message.body ? message.body.slice(0, 240) : null,
      excludeActorFromTargets: true
    }
  });
  return NextResponse.json({ ok: true, id: message.id, circle: { id: message.circleId, name: message.circle.name }, deletedAt: deletedAt.toISOString() });
}
