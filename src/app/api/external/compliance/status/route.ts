import { NextRequest, NextResponse } from "next/server";
import { complianceStatusForUser } from "@/lib/compliance/legal";
import { requireApiUser } from "@/lib/external-api";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, { allowUnaccepted: true });
  if ("response" in auth) return auth.response;
  const compliance = await complianceStatusForUser(auth.user.id, auth.user.tenantId);
  return NextResponse.json({ ok: true, compliance });
}
