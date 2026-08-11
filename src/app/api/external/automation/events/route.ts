import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { serializeAutomationEvent } from "@/lib/external-automation-serializers";
import { prisma } from "@/lib/prisma";
import { recordAutomationEvent } from "@/lib/session-automation";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "scheduledRules");
  if (blocked) return blocked;
  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 100)));
  const sessionId = url.searchParams.get("sessionId");
  const type = url.searchParams.get("type");
  const events = await prisma.automationEvent.findMany({
    where: {
      tenantId: auth.user.tenantId || "",
      ...(sessionId ? { sessionId } : {}),
      ...(type ? { type } : {})
    },
    include: {
      actor: { select: { id: true, name: true, username: true, profile: { select: { displayName: true } } } },
      device: true,
      capability: { include: { device: { select: { name: true } } } }
    },
    orderBy: { createdAt: "desc" },
    take: limit
  });
  return NextResponse.json({ ok: true, items: events.map(serializeAutomationEvent) });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, { allowUnaccepted: true });
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "scheduledRules");
  if (blocked) return blocked;
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const type = typeof body.type === "string" ? body.type.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!type || !title) return NextResponse.json({ ok: false, error: "type_and_title_required" }, { status: 400 });

  let deviceId = typeof body.deviceId === "string" ? body.deviceId : null;
  let capabilityId = typeof body.capabilityId === "string" ? body.capabilityId : null;
  if (deviceId) {
    const device = await prisma.automationDevice.findFirst({ where: { id: deviceId, tenantId: auth.user.tenantId }, select: { id: true } });
    if (!device) deviceId = null;
  }
  if (capabilityId) {
    const capability = await prisma.automationCapability.findFirst({ where: { id: capabilityId, tenantId: auth.user.tenantId }, select: { id: true, deviceId: true } });
    if (!capability) {
      capabilityId = null;
    } else if (!deviceId) {
      deviceId = capability.deviceId;
    }
  }
  if (deviceId) {
    await prisma.automationDevice.updateMany({
      where: { id: deviceId, tenantId: auth.user.tenantId },
      data: {
        health: typeof body.deviceHealth === "string" ? body.deviceHealth : undefined,
        statusJson: body.deviceState && typeof body.deviceState === "object" ? body.deviceState as never : undefined,
        lastSeenAt: new Date()
      }
    });
  }
  if (capabilityId) {
    const impliedCapabilityState = type === "switched_on" ? "ON"
      : type === "switched_off" ? "OFF"
        : type === "switch_error" ? "ERROR"
          : type === "speech_started" || type === "speech_finished" ? "ONLINE"
            : type === "voice_error" ? "ERROR"
              : undefined;
    await prisma.automationCapability.updateMany({
      where: { id: capabilityId, tenantId: auth.user.tenantId },
      data: {
        state: typeof body.capabilityState === "string" ? body.capabilityState : impliedCapabilityState,
        stateJson: body.capabilityStateJson && typeof body.capabilityStateJson === "object" ? body.capabilityStateJson as never : undefined
      }
    });
  }

  const item = await recordAutomationEvent({
    tenantId: auth.user.tenantId,
    actorId: auth.user.id,
    sessionId: typeof body.sessionId === "string" ? body.sessionId : null,
    actionId: typeof body.actionId === "string" ? body.actionId : null,
    deviceId,
    capabilityId,
    type,
    title,
    source: typeof body.source === "string" ? body.source : "IOBROKER",
    role: "SYSTEM",
    details: body.details,
    raw: body.raw,
    correlationId: typeof body.correlationId === "string" ? body.correlationId : undefined,
    idempotencyKey: request.headers.get("Idempotency-Key") || (typeof body.idempotencyKey === "string" ? body.idempotencyKey : null)
  });
  const full = await prisma.automationEvent.findUnique({
    where: { id: item.id },
    include: {
      actor: { select: { id: true, name: true, username: true, profile: { select: { displayName: true } } } },
      device: true,
      capability: { include: { device: { select: { name: true } } } }
    }
  });
  return NextResponse.json({ ok: true, item: full ? serializeAutomationEvent(full) : serializeAutomationEvent(item) }, { status: 201 });
}
