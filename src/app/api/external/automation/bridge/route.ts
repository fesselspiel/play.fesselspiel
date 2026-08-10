import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";
import { recordAutomationEvent } from "@/lib/session-automation";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, { allowUnaccepted: true });
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "scheduledRules");
  if (blocked) return blocked;
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 });
  const bridge = await prisma.automationBridge.upsert({
    where: { tenantId: auth.user.tenantId },
    update: {},
    create: { tenantId: auth.user.tenantId }
  });
  return NextResponse.json({ ok: true, item: bridge });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiUser(request, { allowUnaccepted: true });
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "scheduledRules");
  if (blocked) return blocked;
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const bridge = await prisma.automationBridge.upsert({
    where: { tenantId: auth.user.tenantId },
    update: {
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      mqttBaseTopic: typeof body.mqttBaseTopic === "string" ? body.mqttBaseTopic : undefined,
      mqttClientId: typeof body.mqttClientId === "string" ? body.mqttClientId : undefined,
      mqttUsername: typeof body.mqttUsername === "string" ? body.mqttUsername : undefined,
      health: typeof body.health === "string" ? body.health : undefined,
      heartbeatAt: body.heartbeat === true ? new Date() : undefined,
      metadataJson: body.metadata && typeof body.metadata === "object" ? body.metadata as never : undefined
    },
    create: {
      tenantId: auth.user.tenantId,
      enabled: body.enabled === true,
      mqttBaseTopic: typeof body.mqttBaseTopic === "string" ? body.mqttBaseTopic : "playplaner/v1",
      mqttClientId: typeof body.mqttClientId === "string" ? body.mqttClientId : null,
      mqttUsername: typeof body.mqttUsername === "string" ? body.mqttUsername : null,
      health: typeof body.health === "string" ? body.health : "UNKNOWN",
      heartbeatAt: body.heartbeat === true ? new Date() : null,
      metadataJson: body.metadata && typeof body.metadata === "object" ? body.metadata as never : {}
    }
  });
  await recordAutomationEvent({ tenantId: auth.user.tenantId, actorId: auth.user.id, type: "bridge_updated", title: "ioBroker-Bridge aktualisiert", source: "API", role: "SYSTEM", details: { health: bridge.health, enabled: bridge.enabled } });
  return NextResponse.json({ ok: true, item: bridge });
}
