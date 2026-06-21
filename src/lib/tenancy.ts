import { headers } from "next/headers";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const DEFAULT_TENANT_SLUG = "playplaner";
export const DEFAULT_TENANT_NAME = "Playplaner";
export const DEFAULT_TENANT_DOMAINS = ["playplaner.com", "play.fesselspiel.com"];

export type TenantContext = Awaited<ReturnType<typeof getTenantByHost>>;

export function normalizeHostname(value?: string | null) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
}

export function requestHostname() {
  const headerList = headers();
  return normalizeHostname(headerList.get("x-forwarded-host") || headerList.get("host") || "");
}

export function requestTenantSlug() {
  return (headers().get("x-playplaner-tenant-slug") || "").trim().toLowerCase();
}

export async function ensureDefaultTenant() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: DEFAULT_TENANT_SLUG },
    update: {},
    create: {
      slug: DEFAULT_TENANT_SLUG,
      name: DEFAULT_TENANT_NAME,
      headline: "Private Planung für Paare und Kreise",
      description: "Geschützte Seite für Planung, Bilder, Tracker und Telegram."
    }
  });
  await Promise.all(
    DEFAULT_TENANT_DOMAINS.map((hostname, index) =>
      prisma.tenantDomain.upsert({
        where: { hostname },
        update: { tenantId: tenant.id, active: true, primary: index === 0 },
        create: { tenantId: tenant.id, hostname, active: true, primary: index === 0 }
      })
    )
  );
  return tenant;
}

export async function getTenantByHost(hostname: string) {
  const normalized = normalizeHostname(hostname);
  const domain = normalized
    ? await prisma.tenantDomain.findFirst({
        where: { hostname: normalized, active: true },
        include: { tenant: { include: { domains: true, features: true } } }
      })
    : null;
  if (domain?.tenant) return domain.tenant;
  if (process.env.NODE_ENV !== "production") {
    const tenant = await ensureDefaultTenant();
    return prisma.tenant.findUnique({ where: { id: tenant.id }, include: { domains: true, features: true } });
  }
  return null;
}

export async function currentTenant() {
  const slug = requestTenantSlug();
  if (slug) {
    const tenantBySlug = await prisma.tenant.findUnique({ where: { slug }, include: { domains: true, features: true } });
    if (tenantBySlug) return tenantBySlug;
  }
  const tenant = await getTenantByHost(requestHostname());
  if (tenant) return tenant;
  const fallback = await ensureDefaultTenant();
  const defaultTenant = await prisma.tenant.findUnique({ where: { id: fallback.id }, include: { domains: true, features: true } });
  if (!defaultTenant) throw new Error("Default tenant could not be loaded");
  return defaultTenant;
}

export function primaryTenantDomain(tenant: NonNullable<TenantContext>) {
  return tenant.domains.find((domain) => domain.primary && domain.active)?.hostname || tenant.domains.find((domain) => domain.active)?.hostname || normalizeHostname(env.appUrl);
}

export function tenantUrl(path: string, tenant: NonNullable<TenantContext>) {
  const hostname = primaryTenantDomain(tenant);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `https://${hostname}${normalizedPath}`;
}

export async function tenantScope() {
  const tenant = await currentTenant();
  return { tenantId: tenant.id };
}
