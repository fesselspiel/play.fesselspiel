import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";
import { recordAutomationEvent, upsertAutomationCapability, upsertAutomationDevice } from "@/lib/session-automation";

export const runtime = "nodejs";

function normalizedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizedJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalizedJson(item)]));
  }
  return value;
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(normalizedJson(left)) === JSON.stringify(normalizedJson(right));
}

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
  const integration = typeof body.integration === "string" ? body.integration : "IOBROKER";
  const rawCapabilities = Array.isArray(body.capabilities) ? body.capabilities : [];
  const capabilities = rawCapabilities.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const data = item as Record<string, unknown>;
    const key = typeof data.key === "string" ? data.key.trim() : "";
    const kind = typeof data.kind === "string" ? data.kind.trim() : "";
    const title = typeof data.title === "string" ? data.title.trim() : key;
    return key && kind && title ? [{ data, key, kind, title }] : [];
  });
  const existing = await prisma.automationDevice.findUnique({
    where: { tenantId_logicalId: { tenantId: auth.user.tenantId, logicalId } },
    include: { capabilities: true }
  });
  const definitionChanged = !existing
    || existing.name !== name
    || existing.integration !== integration
    || capabilities.some(({ data, key, kind, title }) => {
      const current = existing.capabilities.find((capability) => capability.key === key);
      return !current
        || current.kind !== kind
        || current.title !== title
        || !sameJson(current.actionsJson, Array.isArray(data.actions) ? data.actions : [])
        || !sameJson(current.eventsJson, Array.isArray(data.events) ? data.events : [])
        || !sameJson(current.conditionsJson, Array.isArray(data.conditions) ? data.conditions : [])
        || !sameJson(current.parametersJson, data.parameters && typeof data.parameters === "object" && !Array.isArray(data.parameters) ? data.parameters : {})
        || !sameJson(current.uiJson, data.ui && typeof data.ui === "object" && !Array.isArray(data.ui) ? data.ui : {});
    });
  const device = await upsertAutomationDevice({
    tenantId: auth.user.tenantId,
    logicalId,
    name,
    integration,
    health: typeof body.health === "string" ? body.health : "UNKNOWN",
    status: body.status,
    metadata: {
      ...(body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata as Record<string, unknown> : {}),
      source: "adapter"
    }
  });
  for (const { data, key, kind, title } of capabilities) {
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
  if (definitionChanged) {
    await recordAutomationEvent({
      tenantId: auth.user.tenantId,
      actorId: auth.user.id,
      deviceId: device.id,
      type: "device_synced",
      title: existing ? `Gerät aktualisiert: ${device.name}` : `Gerät verbunden: ${device.name}`,
      source: "API",
      role: "SYSTEM",
      details: { logicalId, capabilities: capabilities.length, change: existing ? "definition_updated" : "created" }
    });
  }
  const full = await prisma.automationDevice.findUnique({ where: { id: device.id }, include: { capabilities: true } });
  return NextResponse.json({ ok: true, item: full }, { status: 201 });
}
