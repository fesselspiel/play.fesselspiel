import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { featureEnabled } from "@/lib/features";
import { publicCapabilitySummary } from "@/lib/capabilities";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;

  return NextResponse.json({
    ok: true,
    tenantId: auth.user.tenantId,
    user: {
      id: auth.user.id,
      username: auth.user.username,
      name: auth.user.profile?.displayName || auth.user.name || auth.user.email
    },
    capabilities: publicCapabilitySummary(auth.user.tenant?.features, featureEnabled)
  });
}
