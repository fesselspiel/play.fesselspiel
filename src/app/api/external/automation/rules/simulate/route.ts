import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { validateAutomationRulePayload } from "@/lib/automation-rule-model";
import { prisma } from "@/lib/prisma";
import { simulateAutomationRule } from "@/lib/session-automation";

export const runtime = "nodejs";

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function allowedStateOverrides(raw: unknown, allowedIds: string[]): Record<string, string> {
  const data = asRecord(raw);
  const allowed = new Set(allowedIds);
  return Object.fromEntries(
    Object.entries(data)
      .filter(([id, value]) => allowed.has(id) && typeof value === "string")
      .map(([id, value]) => [id, value as string])
  ) as Record<string, string>;
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "scheduledRules");
  if (blocked) return blocked;
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const [capabilities, devices, trackerTypes] = await Promise.all([
    prisma.automationCapability.findMany({
      where: { tenantId: auth.user.tenantId },
      select: { id: true, kind: true, title: true, state: true, deviceId: true, device: { select: { name: true } } }
    }),
    prisma.automationDevice.findMany({
      where: { tenantId: auth.user.tenantId },
      select: { id: true, name: true, health: true }
    }),
    prisma.trackerType.findMany({
      where: { tenantId: auth.user.tenantId, enabled: true },
      select: { id: true, title: true, color: true }
    })
  ]);
  const context = {
    capabilities: capabilities.map((capability) => ({
      id: capability.id,
      kind: capability.kind as "Camera" | "Switch" | "Voice",
      title: capability.title,
      deviceName: capability.device.name,
      deviceId: capability.deviceId,
      state: capability.state
    })),
    devices,
    trackers: trackerTypes,
    simulationOverrides: {
      deviceHealth: allowedStateOverrides(asRecord(body.simulationOverrides).deviceHealth, devices.map((device) => device.id)),
      capabilityState: allowedStateOverrides(asRecord(body.simulationOverrides).capabilityState, capabilities.map((capability) => capability.id))
    }
  };
  const triggerType = typeof body.triggerType === "string" ? body.triggerType : "session_started";
  const validation = validateAutomationRulePayload({
    name: typeof body.name === "string" ? body.name : "Simulation",
    mode: typeof body.mode === "string" ? body.mode : "ONCE",
    triggerType,
    triggerJson: body.trigger,
    conditionJson: body.conditions,
    timingJson: body.timing,
    actionJson: body.actions
  }, context.capabilities, context.devices, context.trackers);
  if (!validation.ok) return NextResponse.json({ ok: false, error: "validation_failed", messages: validation.errors }, { status: 422 });
  const result = simulateAutomationRule({
    triggerType,
    triggerJson: body.trigger,
    conditionJson: body.conditions,
    timingJson: body.timing,
    actionJson: body.actions,
    startAt: typeof body.startAt === "string" ? new Date(body.startAt) : undefined,
    scrubMinute: Number.isFinite(Number(body.scrubMinute)) ? Number(body.scrubMinute) : undefined,
    controllerActionMinute: body.controllerActionMinute === null
      ? null
      : Number.isFinite(Number(body.controllerActionMinute))
        ? Number(body.controllerActionMinute)
        : undefined
  }, context);
  return NextResponse.json({ ok: true, simulation: result });
}
