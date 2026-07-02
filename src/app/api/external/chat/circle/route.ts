import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { requireCircleChatScope, serializeCircleChatMessage } from "@/lib/circle-chat";
import { saveUploadedFile } from "@/lib/files";
import { logAction, userDisplayName } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "circleChat");
  if (blocked) return blocked;
  const scope = await requireCircleChatScope(auth.user).catch(() => null);
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
    include: { sender: { include: { profile: true } }, file: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit
  });
  return NextResponse.json({
    ok: true,
    items: messages.reverse().map((message) => serializeCircleChatMessage(message, auth.user.id))
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "circleChat");
  if (blocked) return blocked;
  const scope = await requireCircleChatScope(auth.user).catch(() => null);
  if (!scope) return NextResponse.json({ ok: false, error: "Kein Zirkel für den Chat zugeordnet" }, { status: 403 });
  const contentType = request.headers.get("content-type") || "";
  let body = "";
  let file: File | null = null;
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    body = String(formData.get("body") || "").trim();
    file = formData.get("file") as File | null;
  } else {
    const payload = await request.json().catch(() => ({}));
    body = String(payload.body || payload.text || "").trim();
  }
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
    include: { sender: { include: { profile: true } }, file: true }
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
      hasFile: Boolean(asset),
      fileMimeType: asset?.mimeType || null,
      text: body ? body.slice(0, 240) : null,
      excludeActorFromTargets: true
    }
  });
  const item = serializeCircleChatMessage(message, auth.user.id);
  return NextResponse.json({ ok: true, item, message: item });
}
