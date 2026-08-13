import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, { allowUnaccepted: true });
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "scheduledRules");
  if (blocked) return blocked;
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const now = new Date();
  const bridge = await prisma.automationBridge.upsert({
    where: { tenantId: auth.user.tenantId },
    update: {
      enabled: true,
      health: typeof body.health === "string" ? body.health : "ONLINE",
      heartbeatAt: now,
      metadataJson: body.metadata && typeof body.metadata === "object" ? body.metadata as never : undefined
    },
    create: {
      tenantId: auth.user.tenantId,
      enabled: true,
      health: typeof body.health === "string" ? body.health : "ONLINE",
      heartbeatAt: now,
      metadataJson: body.metadata && typeof body.metadata === "object" ? body.metadata as never : {}
    }
  });
  return NextResponse.json({ ok: true, item: bridge });
}
