import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "scheduledRules");
  if (blocked) return blocked;
  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 100)));
  const sessionId = url.searchParams.get("sessionId");
  const type = url.searchParams.get("type");
  const events = await prisma.automationEvent.findMany({
    where: {
      tenantId: auth.user.tenantId || "",
      ...(sessionId ? { sessionId } : {}),
      ...(type ? { type } : {})
    },
    include: { actor: { select: { id: true, name: true, username: true, profile: { select: { displayName: true } } } }, device: true, capability: true },
    orderBy: { createdAt: "desc" },
    take: limit
  });
  return NextResponse.json({ ok: true, items: events });
}
