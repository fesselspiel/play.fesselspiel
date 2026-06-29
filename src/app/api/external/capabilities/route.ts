import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { publicCapabilitySummaryForTenant } from "@/lib/capability-runtime";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;

  const capabilities = await publicCapabilitySummaryForTenant(auth.user.tenantId, auth.user.tenant?.features);

  return NextResponse.json({
    ok: true,
    tenantId: auth.user.tenantId,
    user: {
      id: auth.user.id,
      username: auth.user.username,
      name: auth.user.profile?.displayName || auth.user.name || auth.user.email
    },
    capabilities
  });
}
