import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { finishAutomationBridgeCommand } from "@/lib/session-automation";

export const runtime = "nodejs";

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request, { allowUnaccepted: true });
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "scheduledRules");
  if (blocked) return blocked;
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  try {
    const item = await finishAutomationBridgeCommand({
      tenantId: auth.user.tenantId,
      actionId: params.id,
      success: body.success !== false && body.status !== "FAILED",
      result: body.result,
      error: typeof body.error === "string" ? body.error : null,
      deviceState: body.deviceState,
      capabilityState: typeof body.capabilityState === "string" ? body.capabilityState : null,
      capabilityStateJson: body.capabilityStateJson
    });
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "bridge_result_failed" }, { status: 400 });
  }
}
