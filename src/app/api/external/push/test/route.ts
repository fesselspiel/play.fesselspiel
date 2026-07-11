import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { sendNativeTestPush } from "@/lib/native-push-notifications";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function text(value: unknown) {
  return String(value || "").trim();
}

function targetFromBody(body: Record<string, unknown>) {
  const target = body.target && typeof body.target === "object" && !Array.isArray(body.target)
    ? body.target as Record<string, unknown>
    : {};
  return {
    screen: text(target.screen),
    id: text(target.id),
    href: text(target.href),
    entityType: text(target.entityType),
    entityId: text(target.entityId)
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const isAdmin = auth.user.role === "ADMIN" || auth.user.role === "SUPER_ADMIN";
  const deviceId = text(body.deviceId);
  const userId = text(body.userId);
  const circleId = text(body.circleId);
  let targetUserIds: string[] = [];
  let deviceIds: string[] = [];

  if (deviceId) {
    const device = await prisma.nativePushDevice.findFirst({
      where: {
        id: deviceId,
        tenantId: auth.user.tenantId,
        ...(isAdmin ? {} : { userId: auth.user.id })
      },
      select: { id: true, userId: true }
    });
    if (!device) return NextResponse.json({ ok: false, error: "device_not_found" }, { status: 404 });
    targetUserIds = [device.userId];
    deviceIds = [device.id];
  } else if (userId && isAdmin) {
    const membership = await prisma.tenantMembership.findFirst({ where: { tenantId: auth.user.tenantId, userId, active: true, user: { active: true } }, select: { userId: true } });
    if (!membership) return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
    targetUserIds = [membership.userId];
  } else if (circleId && isAdmin) {
    const memberships = await prisma.tenantMembership.findMany({ where: { tenantId: auth.user.tenantId, circleId, active: true, user: { active: true } }, select: { userId: true } });
    targetUserIds = memberships.map((membership) => membership.userId);
  } else {
    targetUserIds = [auth.user.id];
  }

  if (!targetUserIds.length) return NextResponse.json({ ok: false, error: "missing_targets" }, { status: 400 });
  const target = targetFromBody(body);
  const result = await sendNativeTestPush({
    tenantId: auth.user.tenantId,
    actorId: auth.user.id,
    targetUserIds,
    deviceIds,
    title: text(body.title),
    body: text(body.body),
    sound: text(body.sound),
    action: "native_push_test",
    href: target.href || "/settings/push",
    targetScreen: target.screen || "setup",
    targetId: target.id || target.entityId || auth.user.tenantId,
    entityType: target.entityType || "tenant",
    entityId: target.entityId || auth.user.tenantId
  });
  return NextResponse.json({
    ok: !result.error,
    sent: result.sent,
    failed: result.failed,
    devices: result.devices,
    error: result.error,
    attempts: result.attempts || []
  }, { status: result.error ? 400 : 200 });
}
