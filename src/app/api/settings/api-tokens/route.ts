import { NextRequest, NextResponse } from "next/server";
import { createApiToken } from "@/lib/api-tokens";
import { currentUser } from "@/lib/auth";
import { featureEnabled } from "@/lib/features";
import { consumeRateLimit, requestClientAddress, requestHostScope } from "@/lib/security-rate-limit";
import { currentTenant } from "@/lib/tenancy";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const tenant = await currentTenant();
  if (!featureEnabled(tenant.features, "externalApi")) return NextResponse.json({ error: "feature_disabled" }, { status: 403 });
  const rate = await consumeRateLimit(
    { scope: "api-token-create", limit: 10, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
    `${requestHostScope(request)}:${user.id}:${requestClientAddress(request)}`
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Zu viele Tokens in kurzer Zeit. Bitte versuche es später erneut.", retryAfterSeconds: rate.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }
  const body = await request.json().catch(() => ({})) as { name?: unknown };
  const name = String(body.name || "").trim();
  if (!name || name.length > 80) return NextResponse.json({ error: "invalid_name", message: "Bitte einen Namen mit höchstens 80 Zeichen angeben." }, { status: 400 });
  const { token, record } = await createApiToken(user.id, name);
  return NextResponse.json({ ok: true, token, tokenLastSix: record.tokenLastSix }, { headers: { "Cache-Control": "no-store" } });
}
