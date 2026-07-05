import { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicFeaturePage } from "@/components/public-feature-site";
import { currentSessionContext } from "@/lib/auth";
import { featureBySlug, publicFeatures } from "@/lib/public-features";
import { mergePublicFeatures, publicContentOverrides } from "@/lib/public-content";
import { currentTenant, primaryTenantDomain } from "@/lib/tenancy";

export function generateStaticParams() {
  return publicFeatures.map((feature) => ({ slug: feature.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const tenant = await currentTenant();
  const overrides = await publicContentOverrides(tenant?.id);
  const feature = mergePublicFeatures(overrides).find((item) => item.slug === params.slug) || featureBySlug(params.slug);
  if (!feature) return {};
  return {
    title: `${feature.title} · ${tenant?.name || "Playplaner"}`,
    description: feature.summary
  };
}

export default async function FeaturePage({ params }: { params: { slug: string } }) {
  const tenant = await currentTenant();
  const { actor } = await currentSessionContext();
  const overrides = await publicContentOverrides(tenant?.id);
  const features = mergePublicFeatures(overrides);
  const feature = features.find((item) => item.slug === params.slug);
  if (!feature) notFound();
  const tenantName = tenant?.name || "Playplaner";
  const tenantDomain = tenant ? primaryTenantDomain(tenant) : "playplaner.com";
  return <PublicFeaturePage feature={feature} features={features} tenantName={tenantName} tenantDomain={tenantDomain} editable={actor?.role === "ADMIN" || actor?.role === "SUPER_ADMIN"} />;
}
