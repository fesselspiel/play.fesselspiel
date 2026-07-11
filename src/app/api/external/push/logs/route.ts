import { NextRequest, NextResponse } from "next/server";
import { actionLabel } from "@/lib/notification-actions";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function payloadObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function alertFromPayload(payload: Record<string, unknown>) {
  const aps = payloadObject(payload.aps);
  const alert = payloadObject(aps.alert);
  return {
    title: typeof alert.title === "string" ? alert.title : null,
    body: typeof alert.body === "string" ? alert.body : null
  };
}

function serializeDelivery(delivery: Awaited<ReturnType<typeof prisma.nativePushDelivery.findMany>>[number] & {
  device?: { id: string; platform: string; environment: string; deviceName?: string | null; appVersion?: string | null } | null;
  user?: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null } | null;
}) {
  const payload = payloadObject(delivery.payload);
  const alert = alertFromPayload(payload);
  return {
    id: delivery.id,
    createdAt: delivery.createdAt.toISOString(),
    type: delivery.action,
    action: delivery.action,
    actionLabel: actionLabel(delivery.action),
    title: alert.title || actionLabel(delivery.action),
    body: alert.body,
    target: payloadObject(payload.target),
    payload,
    device: delivery.device ? {
      id: delivery.device.id,
      platform: delivery.device.platform,
      environment: delivery.device.environment,
      deviceName: delivery.device.deviceName,
      appVersion: delivery.device.appVersion
    } : null,
    user: delivery.user ? {
      id: delivery.userId,
      displayName: delivery.user.profile?.displayName || delivery.user.name || delivery.user.username || delivery.user.email
    } : null,
    environment: delivery.device?.environment || null,
    status: delivery.status,
    apnsId: delivery.apnsId,
    statusCode: delivery.statusCode,
    errorReason: delivery.error
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 50)));
  const deviceId = String(searchParams.get("deviceId") || "").trim();
  const isAdmin = auth.user.role === "ADMIN" || auth.user.role === "SUPER_ADMIN";
  const deliveries = await prisma.nativePushDelivery.findMany({
    where: {
      ...(auth.user.tenantId ? { tenantId: auth.user.tenantId } : {}),
      ...(isAdmin ? {} : { userId: auth.user.id }),
      ...(deviceId ? { deviceId } : {})
    },
    include: {
      device: true,
      user: { include: { profile: true } }
    },
    orderBy: { createdAt: "desc" },
    take: limit
  });
  return NextResponse.json({ ok: true, count: deliveries.length, items: deliveries.map(serializeDelivery), logs: deliveries.map(serializeDelivery) });
}
