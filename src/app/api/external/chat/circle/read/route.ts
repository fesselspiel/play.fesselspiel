import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, dateFromValue, requireApiUser } from "@/lib/external-api";
import { markCircleChatRead, requireCircleChatScope } from "@/lib/circle-chat";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "circleChat");
  if (blocked) return blocked;
  const scope = await requireCircleChatScope(auth.user).catch(() => null);
  if (!scope) return NextResponse.json({ ok: false, error: "Kein Zirkel für den Chat zugeordnet" }, { status: 403 });
  const payload = await request.json().catch(() => ({})) as {
    messageIds?: unknown;
    upToMessageId?: unknown;
    upToCreatedAt?: unknown;
  };
  const messageIds = Array.isArray(payload.messageIds)
    ? payload.messageIds.map((id) => String(id)).filter(Boolean).slice(0, 200)
    : undefined;
  const result = await markCircleChatRead({
    tenantId: scope.tenantId,
    circleId: scope.circleId,
    userId: auth.user.id,
    messageIds,
    upToMessageId: typeof payload.upToMessageId === "string" ? payload.upToMessageId : null,
    upToCreatedAt: typeof payload.upToCreatedAt === "string" ? dateFromValue(payload.upToCreatedAt) : null
  });
  return NextResponse.json({ ok: true, count: result.count, readAt: result.readAt.toISOString() });
}
