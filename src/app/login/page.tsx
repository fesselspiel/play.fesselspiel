import { PublicLandingPage } from "@/components/public-feature-site";
import { currentTenant, primaryTenantDomain } from "@/lib/tenancy";

export default async function LoginPage({ searchParams }: { searchParams?: { confirmed?: string; reset?: string; next?: string } }) {
  const tenant = await currentTenant();
  const tenantName = tenant?.name || "Playplaner";
  const tenantDomain = tenant ? primaryTenantDomain(tenant) : "playplaner.com";
  return (
    <PublicLandingPage
      tenantName={tenantName}
      tenantDomain={tenantDomain}
      confirmed={searchParams?.confirmed}
      reset={searchParams?.reset}
      returnTo={searchParams?.next}
    />
  );
}
