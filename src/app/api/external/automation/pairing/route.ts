import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAutomationBridgePairing } from "@/lib/automation-bridge-pairing";
import { consumeRateLimit, requestClientAddress, requestHostScope } from "@/lib/security-rate-limit";

export const runtime = "nodejs";

const StartSchema = z.object({
  installationId: z.string().trim().min(8).max(160),
  installationName: z.string().trim().max(120).optional()
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = StartSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_pairing_request" }, { status: 400 });
  const rate = await consumeRateLimit(
    { scope: "automation-bridge-pairing-start", limit: 10, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
    `${requestHostScope(request)}:${requestClientAddress(request)}:${parsed.data.installationId}`
  );
  if (!rate.allowed) return NextResponse.json({ ok: false, error: "rate_limited", retryAfterSeconds: rate.retryAfterSeconds }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  try {
    const result = await createAutomationBridgePairing({ request, ...parsed.data });
    return NextResponse.json({
      ok: true,
      requestId: result.pairing.id,
      pollSecret: result.pollSecret,
      verificationUriComplete: result.verificationUriComplete,
      expiresAt: result.pairing.expiresAt.toISOString(),
      intervalSeconds: 2
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "pairing_start_failed";
    return NextResponse.json({ ok: false, error: code }, { status: code === "unknown_tenant_domain" ? 404 : 400 });
  }
}
