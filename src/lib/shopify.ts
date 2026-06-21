import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { normalizeHostname } from "@/lib/tenancy";
import { normalizeSlug, uniqueSlug, uniqueSlugForUpdate } from "@/lib/slug";

type ShopifyNode = {
  id: string;
  title: string;
  handle: string;
  description?: string;
  descriptionHtml?: string;
  vendor?: string;
  tags?: string[];
  onlineStoreUrl?: string | null;
  featuredImage?: { url?: string | null } | null;
};

type ShopifyResponse = {
  data?: {
    products?: {
      edges?: { node: ShopifyNode }[];
    };
  };
  errors?: { message: string }[];
};

export function normalizeShopDomain(value: string) {
  const host = normalizeHostname(value);
  if (!host) return "";
  return host.endsWith(".myshopify.com") ? host : host;
}

function productUrl(shopDomain: string, handle: string, onlineStoreUrl?: string | null) {
  if (onlineStoreUrl) return onlineStoreUrl;
  return handle ? `https://${shopDomain}/products/${handle}` : `https://${shopDomain}`;
}

function productId(value: string) {
  return value.split("/").pop() || value;
}

export function tokenPreview(value?: string | null) {
  const token = decryptSecret(value);
  return token ? token.slice(-6) : "";
}

export async function syncShopifyProducts(tenantId: string) {
  const integration = await prisma.shopifyIntegration.findUnique({ where: { tenantId } });
  if (!integration?.enabled) throw new Error("Shopify ist nicht eingerichtet oder deaktiviert.");
  const token = decryptSecret(integration.accessTokenEnc);
  if (!token) throw new Error("Shopify Access Token fehlt.");
  const tag = integration.productTag.trim();
  if (!tag) throw new Error("Shopify Tag-Filter fehlt.");
  const shopDomain = normalizeShopDomain(integration.shopDomain);
  const response = await fetch(`https://${shopDomain}/admin/api/2026-01/graphql.json`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-access-token": token
    },
    body: JSON.stringify({
      query: `
        query ProductsByTag($query: String!) {
          products(first: 100, query: $query) {
            edges {
              node {
                id
                title
                handle
                description
                descriptionHtml
                vendor
                tags
                onlineStoreUrl
                featuredImage { url }
              }
            }
          }
        }
      `,
      variables: { query: `tag:'${tag.replace(/'/g, "\\'")}'` }
    })
  });
  if (!response.ok) throw new Error(`Shopify antwortet mit HTTP ${response.status}.`);
  const payload = (await response.json()) as ShopifyResponse;
  if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join("; "));
  const nodes = payload.data?.products?.edges?.map((edge) => edge.node) || [];
  const seenIds: string[] = [];
  for (const node of nodes) {
    const externalId = productId(node.id);
    seenIds.push(externalId);
    const existing = await prisma.shopifyProduct.findUnique({ where: { tenantId_shopifyProductId: { tenantId, shopifyProductId: externalId } } });
    const baseSlug = normalizeSlug(node.handle || node.title, node.title);
    const slug = existing ? await uniqueSlugForUpdate("shopifyProduct", baseSlug, existing.id, tenantId) : await uniqueSlug("shopifyProduct", baseSlug, tenantId);
    const product = await prisma.shopifyProduct.upsert({
      where: { tenantId_shopifyProductId: { tenantId, shopifyProductId: externalId } },
      update: {
        title: node.title,
        slug,
        handle: node.handle,
        description: node.description || node.descriptionHtml || "",
        imageUrl: node.featuredImage?.url || "",
        productUrl: productUrl(shopDomain, node.handle, node.onlineStoreUrl),
        vendor: node.vendor || "",
        tags: node.tags || [],
        inTagFilter: true,
        lastSyncedAt: new Date()
      },
      create: {
        tenantId,
        shopifyProductId: externalId,
        title: node.title,
        slug,
        handle: node.handle,
        description: node.description || node.descriptionHtml || "",
        imageUrl: node.featuredImage?.url || "",
        productUrl: productUrl(shopDomain, node.handle, node.onlineStoreUrl),
        vendor: node.vendor || "",
        tags: node.tags || [],
        inTagFilter: true,
        lastSyncedAt: new Date()
      }
    });
    await prisma.bondageSystemItem.upsert({
      where: { shopifyProductId: product.id },
      update: {},
      create: {
        tenantId,
        shopifyProductId: product.id,
        visible: false,
        visibility: "PRIVATE"
      }
    });
  }
  await prisma.shopifyProduct.updateMany({
    where: { tenantId, shopifyProductId: { notIn: seenIds } },
    data: { inTagFilter: false }
  });
  await prisma.shopifyIntegration.update({
    where: { tenantId },
    data: {
      lastSyncAt: new Date(),
      lastSyncStatus: "OK",
      lastSyncMessage: `${nodes.length} Produkte eingelesen.`
    }
  });
  return { count: nodes.length };
}
