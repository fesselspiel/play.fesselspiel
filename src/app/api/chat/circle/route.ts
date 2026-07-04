import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { createCircleChatReceipts, requireCircleChatScope, serializeCircleChatMessage } from "@/lib/circle-chat";
import { featureEnabled } from "@/lib/feature-utils";
import { saveUploadedFile } from "@/lib/files";
import { logAction, userDisplayName } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Nicht angemeldet" }, { status: 401 });
  if (!featureEnabled(user.tenant?.features, "circleChat")) return NextResponse.json({ ok: false, error: "Feature deaktiviert" }, { status: 403 });
  const scope = await requireCircleChatScope(user, request.nextUrl.searchParams.get("circleId")).catch(() => null);
  if (!scope) return NextResponse.json({ ok: false, error: "Kein Zirkel für den Chat zugeordnet" }, { status: 403 });
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 50)));
  const after = request.nextUrl.searchParams.get("after");
  const where = {
    tenantId: scope.tenantId,
    circleId: scope.circleId,
    deletedAt: null,
    ...(after ? { createdAt: { gt: new Date(after) } } : {})
  };
  const messages = await prisma.circleChatMessage.findMany({
    where,
    include: { sender: { include: { profile: true } }, file: true, receipts: { include: { user: { include: { profile: true } } } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit
  });
  return NextResponse.json({
    ok: true,
    items: messages.reverse().map((message) => serializeCircleChatMessage(message, user.id, user.role))
  });
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Nicht angemeldet" }, { status: 401 });
  if (!featureEnabled(user.tenant?.features, "circleChat")) return NextResponse.json({ ok: false, error: "Feature deaktiviert" }, { status: 403 });
  const formData = await request.formData();
  const scope = await requireCircleChatScope(user, String(formData.get("circleId") || "") || request.nextUrl.searchParams.get("circleId")).catch(() => null);
  if (!scope) return NextResponse.json({ ok: false, error: "Kein Zirkel für den Chat zugeordnet" }, { status: 403 });
  const body = String(formData.get("body") || "").trim();
  const file = formData.get("file") as File | null;
  if (!body && (!file || file.size === 0)) return NextResponse.json({ ok: false, error: "Nachricht oder Bild fehlt" }, { status: 400 });
  const asset = await saveUploadedFile(user.id, file, scope.tenantId);
  const message = await prisma.circleChatMessage.create({
    data: {
      tenantId: scope.tenantId,
      circleId: scope.circleId,
      senderId: user.id,
      body: body || null,
      fileId: asset?.id || null
    },
    include: { sender: { include: { profile: true } }, file: true, receipts: { include: { user: { include: { profile: true } } } } }
  });
  await createCircleChatReceipts(message.id, scope.tenantId, scope.circleId, user.id);
  const messageWithReceipts = await prisma.circleChatMessage.findUniqueOrThrow({
    where: { id: message.id },
    include: { sender: { include: { profile: true } }, file: true, receipts: { include: { user: { include: { profile: true } } } } }
  });
  await logAction({
    actorId: user.id,
    action: "circle_chat_message_created",
    entityType: "circleChatMessage",
    entityId: message.id,
    title: `Chat-Nachricht von ${userDisplayName(user)}`,
    href: `/chat?circleId=${encodeURIComponent(scope.circleId)}`,
    details: {
      circleId: scope.circleId,
      hasFile: Boolean(asset),
      fileMimeType: asset?.mimeType || null,
      text: body ? body.slice(0, 240) : null,
      excludeActorFromTargets: true
    }
  });
  return NextResponse.json({ ok: true, message: serializeCircleChatMessage(messageWithReceipts, user.id, user.role) });
}
