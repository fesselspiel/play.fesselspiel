import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createApiToken } from "@/lib/api-tokens";
import { login } from "@/lib/auth";
import { logAction, userDisplayName } from "@/lib/audit";
import { publicCapabilitySummaryForTenant } from "@/lib/capability-runtime";
import { featureEnabled } from "@/lib/features";
import { currentTenant, primaryTenantDomain } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { complianceStatusForUser } from "@/lib/compliance/legal";

export const runtime = "nodejs";

const MobileLoginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
  deviceName: z.string().trim().max(80).optional(),
  remember: z.boolean().optional()
});

export async function POST(request: NextRequest) {
  const parsed = MobileLoginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });

  const result = await login(parsed.data.identifier, parsed.data.password, Boolean(parsed.data.remember));
  if (!result) {
    await logAction({
      action: "api_mobile_login_failed",
      title: `App-Login fehlgeschlagen: ${parsed.data.identifier}`,
      details: { identifier: parsed.data.identifier, deviceName: parsed.data.deviceName || null }
    });
    return NextResponse.json({ ok: false, error: "login_failed" }, { status: 401 });
  }

  const tenant = await currentTenant();
  if (!featureEnabled(tenant?.features, "externalApi")) {
    return NextResponse.json({ ok: false, error: "feature_disabled", feature: "externalApi" }, { status: 403 });
  }

  const tokenName = parsed.data.deviceName ? `Mobile App: ${parsed.data.deviceName}` : "Mobile App";
  const { token, record } = await createApiToken(result.user.id, tokenName);
  await prisma.user.update({ where: { id: result.user.id }, data: { lastLoginAt: new Date() } });
  await logAction({
    actorId: result.user.id,
    action: "api_mobile_login",
    entityType: "apiToken",
    entityId: record.id,
    title: `${userDisplayName(result.user)} hat sich in der App angemeldet`,
    details: {
      deviceName: parsed.data.deviceName || null,
      tokenLastSix: record.tokenLastSix
    },
    href: "/settings/api"
  });

  const capabilities = await publicCapabilitySummaryForTenant(tenant.id, tenant.features);
  const compliance = await complianceStatusForUser(result.user.id, tenant.id);

  return NextResponse.json({
    ok: true,
    token,
    tokenType: "Bearer",
    tokenLastSix: record.tokenLastSix,
    user: {
      id: result.user.id,
      username: result.user.username,
      email: result.user.email,
      name: userDisplayName(result.user)
    },
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      domain: primaryTenantDomain(tenant)
    },
    capabilities,
    compliance
  });
}
