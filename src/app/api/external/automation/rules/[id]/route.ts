import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { validateAutomationRulePayload } from "@/lib/automation-rule-model";
import { prisma } from "@/lib/prisma";
import { describeAutomationRule, recordAutomationEvent } from "@/lib/session-automation";

export const runtime = "nodejs";

function jsonObject(value: unknown): Prisma.InputJsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.InputJsonObject : {};
}

function jsonArray(value: unknown): Prisma.InputJsonArray {
  return Array.isArray(value) ? value as Prisma.InputJsonArray : [];
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "scheduledRules");
  if (blocked) return blocked;
  const rule = await prisma.automationRule.findFirst({
    where: { id: params.id, tenantId: auth.user.tenantId || "" },
    include: { versions: { orderBy: { version: "desc" } }, actions: { orderBy: { createdAt: "desc" }, take: 20 }, events: { orderBy: { createdAt: "desc" }, take: 50 } }
  });
  if (!rule) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, item: rule });
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "scheduledRules");
  if (blocked) return blocked;
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 });
  const current = await prisma.automationRule.findFirst({ where: { id: params.id, tenantId: auth.user.tenantId } });
  if (!current) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const next = {
    name: typeof body.name === "string" ? body.name.trim() : current.name,
    description: typeof body.description === "string" ? body.description : current.description,
    active: typeof body.active === "boolean" ? body.active : current.active,
    mode: typeof body.mode === "string" ? body.mode : current.mode,
    triggerType: typeof body.triggerType === "string" ? body.triggerType.trim() : current.triggerType,
    triggerJson: jsonObject(body.trigger ?? current.triggerJson),
    conditionJson: jsonArray(body.conditions ?? current.conditionJson),
    timingJson: jsonObject(body.timing ?? current.timingJson),
    actionJson: jsonArray(body.actions ?? current.actionJson)
  };
  const capabilities = await prisma.automationCapability.findMany({
    where: { tenantId: auth.user.tenantId },
    select: { id: true, kind: true, title: true, device: { select: { name: true } } }
  });
  const validation = validateAutomationRulePayload(next, capabilities.map((capability) => ({
    id: capability.id,
    kind: capability.kind as "Camera" | "Switch" | "Voice",
    title: capability.title,
    deviceName: capability.device.name
  })));
  if (!validation.ok) return NextResponse.json({ ok: false, error: "validation_failed", messages: validation.errors }, { status: 422 });
  const descriptionText = describeAutomationRule(next);
  const version = current.currentVersion + 1;
  const rule = await prisma.automationRule.update({
    where: { id: current.id },
    data: {
      ...next,
      descriptionText,
      currentVersion: version,
      versions: {
        create: {
          tenantId: auth.user.tenantId,
          version,
          name: next.name,
          mode: next.mode,
          triggerType: next.triggerType,
          triggerJson: next.triggerJson,
          conditionJson: next.conditionJson,
          timingJson: next.timingJson,
          actionJson: next.actionJson,
          descriptionText
        }
      }
    },
    include: { versions: { orderBy: { version: "desc" }, take: 5 } }
  });
  await recordAutomationEvent({ tenantId: auth.user.tenantId, ruleId: rule.id, actorId: auth.user.id, type: "rule_updated", title: `Regel geändert: ${rule.name}`, source: "API", role: "OWNER", details: { version, descriptionText } });
  return NextResponse.json({ ok: true, item: rule });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "scheduledRules");
  if (blocked) return blocked;
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 });
  const rule = await prisma.automationRule.findFirst({ where: { id: params.id, tenantId: auth.user.tenantId } });
  if (!rule) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  await prisma.automationRule.delete({ where: { id: rule.id } });
  await recordAutomationEvent({ tenantId: auth.user.tenantId, actorId: auth.user.id, type: "rule_deleted", title: `Regel gelöscht: ${rule.name}`, source: "API", role: "OWNER", details: { ruleId: rule.id } });
  return NextResponse.json({ ok: true });
}
