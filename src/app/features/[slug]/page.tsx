import { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicFeaturePage } from "@/components/public-feature-site";
import { featureBySlug, publicFeatures } from "@/lib/public-features";
import { currentTenant, primaryTenantDomain } from "@/lib/tenancy";

export function generateStaticParams() {
  return publicFeatures.map((feature) => ({ slug: feature.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const feature = featureBySlug(params.slug);
  if (!feature) return {};
  const tenant = await currentTenant();
  return {
    title: `${feature.title} · ${tenant?.name || "Playplaner"}`,
    description: feature.summary
  };
}

export default async function FeaturePage({ params }: { params: { slug: string } }) {
  const feature = featureBySlug(params.slug);
  if (!feature) notFound();
  const tenant = await currentTenant();
  const tenantName = tenant?.name || "Playplaner";
  const tenantDomain = tenant ? primaryTenantDomain(tenant) : "playplaner.com";
  return <PublicFeaturePage feature={feature} tenantName={tenantName} tenantDomain={tenantDomain} />;
}
