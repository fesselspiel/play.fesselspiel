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

async function tenantForUser(user: any, id: string) {
  return prisma.tenant.findFirst({
    where: user.role === "SUPER_ADMIN" ? { OR: [{ id }, { slug: id }] } : { OR: [{ id }, { slug: id }], memberships: { some: { userId: user.id, active: true } } },
    include: { domains: true, features: true }
  });
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  const tenant = await tenantForUser(auth.user, params.id);
  if (!tenant) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, item: item(tenant, auth.user.tenantId), tenant: item(tenant, auth.user.tenantId) });
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  if (!canManage(auth.user)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const existing = await tenantForUser(auth.user, params.id);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const tenant = await prisma.tenant.update({
    where: { id: existing.id },
    data: {
      ...(body.name !== undefined ? { name: String(body.name || existing.name).trim() } : {}),
      ...(body.headline !== undefined ? { headline: String(body.headline || "").trim() || null } : {}),
      ...(body.description !== undefined ? { description: String(body.description || "").trim() || null } : {}),
      ...(body.status !== undefined ? { status: String(body.status || existing.status).trim().toUpperCase() } : {}),
      ...(body.primaryColor !== undefined ? { primaryColor: String(body.primaryColor || existing.primaryColor).trim() } : {})
    },
    include: { domains: true, features: true }
  });
  if (body.domain) {
    const hostname = String(body.domain).trim().toLowerCase();
    await prisma.tenantDomain.upsert({
      where: { hostname },
      update: { tenantId: tenant.id, active: true },
      create: { tenantId: tenant.id, hostname, active: true, primary: !tenant.domains.some((domain) => domain.primary) }
    });
  }
  const refreshed = await prisma.tenant.findUnique({ where: { id: tenant.id }, include: { domains: true, features: true } });
  return NextResponse.json({ ok: true, item: item(refreshed, auth.user.tenantId), tenant: item(refreshed, auth.user.tenantId) });
}
