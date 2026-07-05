import { PublicLandingPage } from "@/components/public-feature-site";
import { currentSessionContext } from "@/lib/auth";
import { landingContent, mergePublicFeatures, publicContentOverrides } from "@/lib/public-content";
import { currentTenant, primaryTenantDomain } from "@/lib/tenancy";

export default async function LoginPage({ searchParams }: { searchParams?: { confirmed?: string; reset?: string; next?: string } }) {
  const tenant = await currentTenant();
  const { actor } = await currentSessionContext();
  const overrides = await publicContentOverrides(tenant?.id);
  const tenantName = tenant?.name || "Playplaner";
  const tenantDomain = tenant ? primaryTenantDomain(tenant) : "playplaner.com";
  return (
    <PublicLandingPage
      tenantName={tenantName}
      tenantDomain={tenantDomain}
      confirmed={searchParams?.confirmed}
      reset={searchParams?.reset}
      returnTo={searchParams?.next}
      features={mergePublicFeatures(overrides)}
      content={landingContent(overrides)}
      editable={actor?.role === "ADMIN" || actor?.role === "SUPER_ADMIN"}
    />
  );
}
