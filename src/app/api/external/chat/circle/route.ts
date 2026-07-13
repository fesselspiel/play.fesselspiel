import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { createCircleChatReceipts, requireCircleChatScope, serializeCircleChatMessageWithContext, serializeCircleChatMessages } from "@/lib/circle-chat";
import { saveUploadedFile } from "@/lib/files";
import { logAction, userDisplayName } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "circleChat");
  if (blocked) return blocked;
  const requestedCircleId = request.nextUrl.searchParams.get("circleId");
  const scope = await requireCircleChatScope(auth.user, requestedCircleId).catch(() => null);
  if (!scope) return NextResponse.json({ ok: false, error: "Kein Zirkel für den Chat zugeordnet" }, { status: 403 });
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 50)));
  const after = request.nextUrl.searchParams.get("after");
  const messages = await prisma.circleChatMessage.findMany({
    where: {
      tenantId: scope.tenantId,
      circleId: scope.circleId,
      deletedAt: null,
      ...(after ? { createdAt: { gt: new Date(after) } } : {})
    },
    include: { circle: true, sender: { include: { profile: true } }, file: true, receipts: { include: { user: { include: { profile: true } } } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit
  });
  return NextResponse.json({
    ok: true,
    circle: { id: scope.circleId, name: scope.circleName },
    items: await serializeCircleChatMessages(messages.reverse(), auth.user.id, auth.user.role)
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "circleChat");
  if (blocked) return blocked;
  const contentType = request.headers.get("content-type") || "";
  let body = "";
  let file: File | null = null;
  let requestedCircleId: string | null = null;
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    body = String(formData.get("body") || "").trim();
    requestedCircleId = String(formData.get("circleId") || "").trim() || null;
    file = formData.get("file") as File | null;
  } else {
    const payload = await request.json().catch(() => ({}));
    body = String(payload.body || payload.text || "").trim();
    requestedCircleId = String(payload.circleId || "").trim() || null;
  }
  const scope = await requireCircleChatScope(auth.user, requestedCircleId).catch(() => null);
  if (!scope) return NextResponse.json({ ok: false, error: "Kein Zirkel für den Chat zugeordnet" }, { status: 403 });
  if (!body && (!file || file.size === 0)) return NextResponse.json({ ok: false, error: "Nachricht oder Bild fehlt" }, { status: 400 });
  const asset = await saveUploadedFile(auth.user.id, file, scope.tenantId);
  const message = await prisma.circleChatMessage.create({
    data: {
      tenantId: scope.tenantId,
      circleId: scope.circleId,
      senderId: auth.user.id,
      body: body || null,
      fileId: asset?.id || null
    },
    include: { circle: true, sender: { include: { profile: true } }, file: true, receipts: { include: { user: { include: { profile: true } } } } }
  });
  await createCircleChatReceipts(message.id, scope.tenantId, scope.circleId, auth.user.id);
  const messageWithReceipts = await prisma.circleChatMessage.findUniqueOrThrow({
    where: { id: message.id },
    include: { circle: true, sender: { include: { profile: true } }, file: true, receipts: { include: { user: { include: { profile: true } } } } }
  });
  await logAction({
    actorId: auth.user.id,
    action: "circle_chat_message_created_api",
    entityType: "circleChatMessage",
    entityId: message.id,
    title: `Chat-Nachricht per API von ${userDisplayName(auth.user)}`,
    href: "/chat",
    details: {
      circleId: scope.circleId,
      circleName: scope.circleName,
      targetScreen: "chat",
      targetId: scope.circleId,
      hasFile: Boolean(asset),
      fileMimeType: asset?.mimeType || null,
      text: body ? body.slice(0, 240) : null,
      excludeActorFromTargets: true
    }
  });
  const item = await serializeCircleChatMessageWithContext(messageWithReceipts, auth.user.id, auth.user.role);
  return NextResponse.json({ ok: true, item, message: item });
}
