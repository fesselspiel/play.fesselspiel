import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";
import { createAutomationRule } from "@/lib/session-automation";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "scheduledRules");
  if (blocked) return blocked;
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 });
  const rules = await prisma.automationRule.findMany({
    where: { tenantId: auth.user.tenantId },
    include: { versions: { orderBy: { version: "desc" }, take: 5 } },
    orderBy: { updatedAt: "desc" }
  });
  return NextResponse.json({ ok: true, items: rules });
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
    actionJson: body.actions
  });
  return NextResponse.json({ ok: true, item: rule }, { status: 201 });
}
