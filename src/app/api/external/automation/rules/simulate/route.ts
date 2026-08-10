import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { simulateAutomationRule } from "@/lib/session-automation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "scheduledRules");
  if (blocked) return blocked;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const result = simulateAutomationRule({
    triggerType: typeof body.triggerType === "string" ? body.triggerType : "manual_test",
    conditionJson: body.conditions,
    timingJson: body.timing,
    actionJson: body.actions,
    startAt: typeof body.startAt === "string" ? new Date(body.startAt) : undefined,
    scrubMinute: Number.isFinite(Number(body.scrubMinute)) ? Number(body.scrubMinute) : undefined
  });
  return NextResponse.json({ ok: true, simulation: result });
}
