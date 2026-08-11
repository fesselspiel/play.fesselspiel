import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { automationRuleFlow, automationRuleSummary, validateAutomationRulePayload } from "@/lib/automation-rule-model";
import { prisma } from "@/lib/prisma";
import { createAutomationRule } from "@/lib/session-automation";

export const runtime = "nodejs";

async function automationRuleContext(tenantId: string) {
  const [capabilities, devices, trackerTypes] = await Promise.all([
    prisma.automationCapability.findMany({
      where: { tenantId },
      select: { id: true, kind: true, title: true, state: true, deviceId: true, device: { select: { name: true } } }
    }),
    prisma.automationDevice.findMany({
      where: { tenantId },
      select: { id: true, name: true, health: true }
    }),
    prisma.trackerType.findMany({
      where: { tenantId, enabled: true },
      select: { id: true, title: true, color: true }
    })
  ]);
  return {
    capabilities: capabilities.map((capability) => ({
      id: capability.id,
      kind: capability.kind as "Camera" | "Switch" | "Voice",
      title: capability.title,
      deviceName: capability.device.name,
      deviceId: capability.deviceId,
      state: capability.state
    })),
    devices,
    trackers: trackerTypes
  };
}

function decorateRule(rule: {
  triggerType: string;
  triggerJson?: unknown;
  conditionJson?: unknown;
  timingJson?: unknown;
  actionJson?: unknown;
}, context: Awaited<ReturnType<typeof automationRuleContext>>) {
  return {
    ...rule,
    summary: automationRuleSummary(rule, context),
    flow: automationRuleFlow(rule, context)
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "scheduledRules");
  if (blocked) return blocked;
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 });
  const [rules, context] = await Promise.all([
    prisma.automationRule.findMany({
      where: { tenantId: auth.user.tenantId },
      include: { versions: { orderBy: { version: "desc" }, take: 5 } },
      orderBy: { updatedAt: "desc" }
    }),
    automationRuleContext(auth.user.tenantId)
  ]);
  return NextResponse.json({ ok: true, items: rules.map((rule) => decorateRule(rule, context)) });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "scheduledRules");
  if (blocked) return blocked;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const triggerType = typeof body.triggerType === "string" ? body.triggerType.trim() : "";
  if (!name || !triggerType) return NextResponse.json({ ok: false, error: "name_and_trigger_required" }, { status: 400 });
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 });
  const context = await automationRuleContext(auth.user.tenantId);
  const validation = validateAutomationRulePayload({
    name,
    mode: typeof body.mode === "string" ? body.mode : "ONCE",
    triggerType,
    triggerJson: body.trigger,
    conditionJson: body.conditions,
    timingJson: body.timing,
    actionJson: body.actions
  }, context.capabilities, context.devices, context.trackers);
  if (!validation.ok) return NextResponse.json({ ok: false, error: "validation_failed", messages: validation.errors }, { status: 422 });
  const rule = await createAutomationRule({
    user: auth.user,
    name,
    description: typeof body.description === "string" ? body.description : null,
    active: body.active !== false,
    mode: typeof body.mode === "string" ? body.mode : "ONCE",
    triggerType,
    triggerJson: body.trigger,
    conditionJson: body.conditions,
    timingJson: body.timing,
    actionJson: body.actions,
    descriptionText: automationRuleSummary({ triggerType, triggerJson: body.trigger, conditionJson: body.conditions, timingJson: body.timing, actionJson: body.actions }, context)
  });
  return NextResponse.json({ ok: true, item: decorateRule(rule, context) }, { status: 201 });
}
