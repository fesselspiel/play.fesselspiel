import { NextRequest, NextResponse } from "next/server";
import { automationBridgePairingForPoll, pairingCredential } from "@/lib/automation-bridge-pairing";
import { prisma } from "@/lib/prisma";
import { primaryTenantDomain } from "@/lib/tenancy";

export const runtime = "nodejs";

function secretFromRequest(request: NextRequest) {
  return request.headers.get("authorization")?.match(/^Pairing\s+(.+)$/i)?.[1]?.trim() || "";
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const pairing = await automationBridgePairingForPoll(id, secretFromRequest(request));
  if (!pairing) return NextResponse.json({ ok: false, error: "invalid_pairing" }, { status: 401 });
  if (pairing.status === "PENDING") return NextResponse.json({ ok: true, status: "pending", expiresAt: pairing.expiresAt.toISOString() }, { status: 202, headers: { "Cache-Control": "no-store" } });
  if (pairing.status === "EXPIRED") return NextResponse.json({ ok: false, status: "expired", error: "pairing_expired" }, { status: 410 });
  if (pairing.status === "CANCELLED") return NextResponse.json({ ok: false, status: "cancelled", error: "pairing_cancelled" }, { status: 409 });
  if (pairing.status === "CONSUMED" || !pairing.credentialEnc || !pairing.tenant) {
    return NextResponse.json({ ok: false, status: "consumed", error: "pairing_already_consumed" }, { status: 409 });
  }
  const token = pairingCredential(pairing.credentialEnc);
  if (!token) return NextResponse.json({ ok: false, error: "pairing_credential_unavailable" }, { status: 500 });
  return NextResponse.json({
    ok: true,
    status: "approved",
    credential: { token, tokenType: "Bearer" },
    installationId: pairing.installationId,
    tenant: { id: pairing.tenant.id, slug: pairing.tenant.slug, name: pairing.tenant.name, domain: pairing.requestedHostname, primaryDomain: primaryTenantDomain(pairing.tenant) },
    tracker: pairing.trackerType ? { id: pairing.trackerType.id, key: pairing.trackerType.key, title: pairing.trackerType.title } : null,
    transport: { type: "HTTPS_POLLING" }
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const pairing = await automationBridgePairingForPoll(id, secretFromRequest(request));
  if (!pairing) return NextResponse.json({ ok: false, error: "invalid_pairing" }, { status: 401 });
  const consumed = await prisma.automationBridgePairing.updateMany({
    where: { id: pairing.id, status: "APPROVED", consumedAt: null },
    data: { status: "CONSUMED", consumedAt: new Date(), credentialEnc: null, mqttPasswordEnc: null }
  });
  if (consumed.count !== 1) return NextResponse.json({ ok: false, error: "pairing_not_approvable" }, { status: 409 });
  return NextResponse.json({ ok: true, status: "consumed" }, { headers: { "Cache-Control": "no-store" } });
}
