import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { serializeAutomationAction, serializeAutomationSession } from "@/lib/external-automation-serializers";
import { requestAutomationEnd } from "@/lib/session-automation";

export const runtime = "nodejs";

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers");
  if (blocked) return blocked;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  try {
    const result = await requestAutomationEnd({
      user: auth.user,
      sessionId: params.id,
      timing: body.timing,
      source: "API",
      role: "OWNER",
      override: body.override === true,
      reason: typeof body.reason === "string" ? body.reason : null
    });
    return NextResponse.json({
      ok: true,
      ...result,
      session: result.session ? serializeAutomationSession(request, result.session) : null,
      action: result.action ? serializeAutomationAction(result.action) : null
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "automation_end_failed" }, { status: 400 });
  }
}
