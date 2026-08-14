import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { serializeAutomationSession } from "@/lib/external-automation-serializers";
import { currentAutomationSession, startAutomationSession } from "@/lib/session-automation";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers");
  if (blocked) return blocked;
  const url = new URL(request.url);
  const session = await currentAutomationSession(auth.user, url.searchParams.get("trackerTypeId"));
  return NextResponse.json({ ok: true, item: session ? serializeAutomationSession(request, session) : null });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers");
  if (blocked) return blocked;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  try {
    const result = await startAutomationSession({
      user: auth.user,
      templateId: typeof body.templateId === "string" ? body.templateId : null,
      trackerTypeId: typeof body.trackerTypeId === "string" ? body.trackerTypeId : null,
      trackerKeyOrTitle: typeof body.tracker === "string" ? body.tracker : typeof body.trackerKeyOrTitle === "string" ? body.trackerKeyOrTitle : null,
      title: typeof body.title === "string" ? body.title : null,
      notes: typeof body.notes === "string" ? body.notes : null,
      source: "API",
      role: "OWNER",
      idempotencyKey: request.headers.get("Idempotency-Key") || (typeof body.idempotencyKey === "string" ? body.idempotencyKey : null),
      metadata: body.metadata
    });
    return NextResponse.json({
      ok: true,
      ...result,
      session: result.session ? serializeAutomationSession(request, result.session) : null
    }, { status: result.created ? 201 : 200 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "automation_start_failed" }, { status: 400 });
  }
}
