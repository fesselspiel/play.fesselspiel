import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { serializeAutomationAction } from "@/lib/external-automation-serializers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "scheduledRules");
  if (blocked) return blocked;
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 });

  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 100)));
  const sessionId = url.searchParams.get("sessionId");
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");
  const items = await prisma.automationAction.findMany({
    where: {
      tenantId: auth.user.tenantId,
      ...(sessionId ? { sessionId } : {}),
      ...(status ? { status } : {}),
      ...(type ? { type } : {})
    },
    include: {
      device: true,
      capability: { include: { device: { select: { name: true } } } }
    },
    orderBy: { createdAt: "desc" },
    take: limit
  });

  return NextResponse.json({
    ok: true,
    count: items.length,
    items: items.map(serializeAutomationAction)
  });
}
