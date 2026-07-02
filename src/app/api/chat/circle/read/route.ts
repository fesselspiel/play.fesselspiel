import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { markCircleChatRead, requireCircleChatScope } from "@/lib/circle-chat";
import { featureEnabled } from "@/lib/feature-utils";
import { dateFromValue } from "@/lib/external-api";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Nicht angemeldet" }, { status: 401 });
  if (!featureEnabled(user.tenant?.features, "circleChat")) return NextResponse.json({ ok: false, error: "Feature deaktiviert" }, { status: 403 });
  const scope = await requireCircleChatScope(user).catch(() => null);
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
    userId: user.id,
    messageIds,
    upToMessageId: typeof payload.upToMessageId === "string" ? payload.upToMessageId : null,
    upToCreatedAt: typeof payload.upToCreatedAt === "string" ? dateFromValue(payload.upToCreatedAt) : null
  });
  return NextResponse.json({ ok: true, count: result.count, readAt: result.readAt.toISOString() });
}
