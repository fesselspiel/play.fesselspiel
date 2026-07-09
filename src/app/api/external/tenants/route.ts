import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";
import { primaryTenantDomain } from "@/lib/tenancy";

export const runtime = "nodejs";

function canManage(user: { role?: string | null }) {
  return user.role === "ADMIN" || user.role === "SUPER_ADMIN";
}

function item(tenant: any, currentTenantId?: string | null) {
  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    headline: tenant.headline,
    description: tenant.description,
    status: tenant.status,
    primaryColor: tenant.primaryColor,
    domain: primaryTenantDomain(tenant),
    domains: tenant.domains.map((domain: any) => ({ id: domain.id, hostname: domain.hostname, primary: domain.primary, active: domain.active })),
    features: tenant.features.map((feature: any) => ({ key: feature.key, enabled: feature.enabled })),
    current: tenant.id === currentTenantId,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString()
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  const where = auth.user.role === "SUPER_ADMIN"
    ? {}
    : { memberships: { some: { userId: auth.user.id, active: true } } };
  const tenants = await prisma.tenant.findMany({ where, include: { domains: true, features: true }, orderBy: { name: "asc" } });
  return NextResponse.json({ ok: true, count: tenants.length, items: tenants.map((tenant) => item(tenant, auth.user.tenantId)), tenants: tenants.map((tenant) => item(tenant, auth.user.tenantId)) });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  if (!canManage(auth.user)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const slug = String(body.slug || body.name || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  const name = String(body.name || slug || "").trim();
  if (!slug || !name) return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
  const tenant = await prisma.tenant.create({
    data: {
      slug,
      name,
      headline: String(body.headline || "").trim() || null,
      description: String(body.description || "").trim() || null,
      domains: body.domain ? { create: { hostname: String(body.domain).trim().toLowerCase(), primary: true, active: true } } : undefined,
      memberships: { create: { userId: auth.user.id, role: auth.user.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN", active: true } }
    },
    include: { domains: true, features: true }
  });
  return NextResponse.json({ ok: true, item: item(tenant, auth.user.tenantId), tenant: item(tenant, auth.user.tenantId) }, { status: 201 });
}
