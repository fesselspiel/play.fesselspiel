import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";
import { recordAutomationEvent, upsertAutomationCapability, upsertAutomationDevice } from "@/lib/session-automation";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "scheduledRules");
  if (blocked) return blocked;
  const devices = await prisma.automationDevice.findMany({
    where: { tenantId: auth.user.tenantId || "" },
    include: { capabilities: true },
    orderBy: { name: "asc" }
  });
  return NextResponse.json({ ok: true, items: devices });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, { allowUnaccepted: true });
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "scheduledRules");
  if (blocked) return blocked;
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const logicalId = typeof body.logicalId === "string" ? body.logicalId.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : logicalId;
  if (!logicalId || !name) return NextResponse.json({ ok: false, error: "logical_id_required" }, { status: 400 });
  const device = await upsertAutomationDevice({
    tenantId: auth.user.tenantId,
    logicalId,
    name,
    integration: typeof body.integration === "string" ? body.integration : "IOBROKER",
    health: typeof body.health === "string" ? body.health : "UNKNOWN",
    status: body.status,
    metadata: {
      ...(body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata as Record<string, unknown> : {}),
      source: "adapter"
    }
  });
  const capabilities = Array.isArray(body.capabilities) ? body.capabilities : [];
  for (const item of capabilities) {
    if (!item || typeof item !== "object") continue;
    const data = item as Record<string, unknown>;
    const key = typeof data.key === "string" ? data.key.trim() : "";
    const kind = typeof data.kind === "string" ? data.kind.trim() : "";
    const title = typeof data.title === "string" ? data.title.trim() : key;
    if (!key || !kind || !title) continue;
    await upsertAutomationCapability({
      tenantId: auth.user.tenantId,
      deviceId: device.id,
      key,
      kind,
      title,
      state: typeof data.state === "string" ? data.state : "UNKNOWN",
      actions: data.actions,
      events: data.events,
      conditions: data.conditions,
      parameters: data.parameters,
      ui: data.ui
    });
  }
  await recordAutomationEvent({ tenantId: auth.user.tenantId, actorId: auth.user.id, deviceId: device.id, type: "device_synced", title: `Gerät synchronisiert: ${device.name}`, source: "API", role: "SYSTEM", details: { logicalId, capabilities: capabilities.length } });
  const full = await prisma.automationDevice.findUnique({ where: { id: device.id }, include: { capabilities: true } });
  return NextResponse.json({ ok: true, item: full }, { status: 201 });
}
