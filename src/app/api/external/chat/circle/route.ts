import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { createCircleChatReceipts, requireCircleChatScope, serializeCircleChatMessageWithContext, serializeCircleChatMessages } from "@/lib/circle-chat";
import { saveUploadedFile } from "@/lib/files";
import { logAction, userDisplayName } from "@/lib/audit";
import { selfBondageCategory } from "@/lib/activity-orders";
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
  let entityType: string | null = null;
  let entityId: string | null = null;
  let entityTitle: string | null = null;
  let targetScreen: string | null = null;
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    body = String(formData.get("body") || "").trim();
    requestedCircleId = String(formData.get("circleId") || "").trim() || null;
    entityType = String(formData.get("entityType") || "").trim() || null;
    entityId = String(formData.get("entityId") || "").trim() || null;
    entityTitle = String(formData.get("entityTitle") || "").trim() || null;
    targetScreen = String(formData.get("targetScreen") || "").trim() || null;
    file = formData.get("file") as File | null;
  } else {
    const payload = await request.json().catch(() => ({}));
    body = String(payload.body || payload.text || "").trim();
    requestedCircleId = String(payload.circleId || "").trim() || null;
    entityType = String(payload.entityType || "").trim() || null;
    entityId = String(payload.entityId || "").trim() || null;
    entityTitle = String(payload.entityTitle || "").trim() || null;
    targetScreen = String(payload.targetScreen || "").trim() || null;
  }
  const scope = await requireCircleChatScope(auth.user, requestedCircleId).catch(() => null);
  if (!scope) return NextResponse.json({ ok: false, error: "Kein Zirkel für den Chat zugeordnet" }, { status: 403 });
  const normalizedEntityType = entityType?.toLowerCase() || null;
  const cardKind = normalizedEntityType === "order" ? "order" : (normalizedEntityType === "session" || normalizedEntityType === "activity" ? "session" : null);
  const cardActivity = cardKind
    ? await prisma.activityPlan.findFirst({
        where: {
          id: entityId || "",
          tenantId: scope.tenantId,
          ...(cardKind === "order" ? { category: selfBondageCategory } : {})
        },
        select: { id: true, title: true, slug: true }
      })
    : null;
  if (cardKind && !cardActivity) {
    return NextResponse.json({ ok: false, error: cardKind === "order" ? "order_not_found" : "session_not_found" }, { status: 404 });
  }
  if (!body && (!file || file.size === 0) && !cardActivity) return NextResponse.json({ ok: false, error: "Nachricht, Bild oder Karte fehlt" }, { status: 400 });
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
      excludeActorFromTargets: true,
      ...(cardActivity ? {
        entityType: cardKind || "session",
        entityId: cardActivity.id,
        entityTitle: entityTitle || cardActivity.title,
        targetScreen: targetScreen || (cardKind === "order" ? "orders" : "sessions"),
        target: {
          screen: targetScreen || (cardKind === "order" ? "orders" : "sessions"),
          entityType: cardKind || "session",
          entityId: cardActivity.id,
          id: cardActivity.id,
          href: cardKind === "order" ? `/orders#order-${cardActivity.id}` : `/activities/${cardActivity.slug}`
        }
      } : {})
    }
  });
  const item = await serializeCircleChatMessageWithContext(messageWithReceipts, auth.user.id, auth.user.role);
  return NextResponse.json({ ok: true, item, message: item });
}
