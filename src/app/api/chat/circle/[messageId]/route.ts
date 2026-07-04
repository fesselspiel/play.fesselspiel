import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { requireCircleChatScope } from "@/lib/circle-chat";
import { featureEnabled } from "@/lib/feature-utils";
import { logAction, userDisplayName } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest, { params }: { params: { messageId: string } }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Nicht angemeldet" }, { status: 401 });
  if (!featureEnabled(user.tenant?.features, "circleChat")) return NextResponse.json({ ok: false, error: "Feature deaktiviert" }, { status: 403 });
  const scope = await requireCircleChatScope(user, request.nextUrl.searchParams.get("circleId")).catch(() => null);
  if (!scope) return NextResponse.json({ ok: false, error: "Kein Zirkel für den Chat zugeordnet" }, { status: 403 });
  const message = await prisma.circleChatMessage.findFirst({
    where: { id: params.messageId, tenantId: scope.tenantId, circleId: scope.circleId, deletedAt: null },
    select: { id: true, senderId: true, body: true, fileId: true }
  });
  if (!message) return NextResponse.json({ ok: false, error: "Nachricht nicht gefunden" }, { status: 404 });
  const canDelete = message.senderId === user.id || user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  if (!canDelete) return NextResponse.json({ ok: false, error: "Keine Berechtigung zum Löschen" }, { status: 403 });
  const deletedAt = new Date();
  await prisma.circleChatMessage.update({ where: { id: message.id }, data: { deletedAt } });
  await logAction({
    actorId: user.id,
    action: "circle_chat_message_deleted",
    entityType: "circleChatMessage",
    entityId: message.id,
    title: `Chat-Nachricht gelöscht von ${userDisplayName(user)}`,
    href: `/chat?circleId=${encodeURIComponent(scope.circleId)}`,
    details: {
      circleId: scope.circleId,
      hadFile: Boolean(message.fileId),
      text: message.body ? message.body.slice(0, 240) : null,
      excludeActorFromTargets: true
    }
  });
  return NextResponse.json({ ok: true, id: message.id, deletedAt: deletedAt.toISOString() });
}
