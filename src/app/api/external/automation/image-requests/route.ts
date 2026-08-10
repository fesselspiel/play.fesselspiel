import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";
import { createAutomationImageRequest } from "@/lib/session-automation";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers");
  if (blocked) return blocked;
  const url = new URL(request.url);
  const items = await prisma.automationImageRequest.findMany({
    where: {
      tenantId: auth.user.tenantId || "",
      ...(url.searchParams.get("sessionId") ? { sessionId: url.searchParams.get("sessionId") || "" } : {})
    },
    include: { file: true, session: true, device: true, capability: true },
    orderBy: { requestedAt: "desc" },
    take: 100
  });
  return NextResponse.json({ ok: true, items });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers");
  if (blocked) return blocked;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionId) return NextResponse.json({ ok: false, error: "session_required" }, { status: 400 });
  try {
    const item = await createAutomationImageRequest({
      user: auth.user,
      sessionId,
      deviceId: typeof body.deviceId === "string" ? body.deviceId : null,
      capabilityId: typeof body.capabilityId === "string" ? body.capabilityId : null,
      reason: typeof body.reason === "string" ? body.reason : null
    });
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "image_request_failed" }, { status: 400 });
  }
}
