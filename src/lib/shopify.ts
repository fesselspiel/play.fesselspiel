import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
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

type ShopifyTokenResponse = {
  access_token?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export function normalizeShopDomain(value: string) {
  const host = normalizeHostname(value);
  if (!host) return "";
  return host.endsWith(".myshopify.com") ? host : host;
}

export function normalizeShopifyApiVersion(value?: string | null) {
  const version = String(value || "").trim();
  if (/^\d{4}-\d{2}$/.test(version) || version === "unstable") return version;
  return "2026-04";
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

export function secretPreview(value?: string | null) {
  return tokenPreview(value);
}

function tokenStillValid(expiresAt?: Date | null) {
  return Boolean(expiresAt && expiresAt.getTime() > Date.now() + 5 * 60 * 1000);
}

async function getShopifyAccessToken(tenantId: string, options: { forceRefresh?: boolean } = {}) {
  const integration = await prisma.shopifyIntegration.findUnique({ where: { tenantId } });
  if (!integration?.enabled) throw new Error("Shopify ist nicht eingerichtet oder deaktiviert.");
  const cachedToken = decryptSecret(integration.accessTokenEnc);
  if (!options.forceRefresh && cachedToken && tokenStillValid(integration.accessTokenExpiresAt)) return { integration, token: cachedToken };

  const clientId = decryptSecret(integration.clientIdEnc);
  const clientSecret = decryptSecret(integration.clientSecretEnc);
  if (!clientId || !clientSecret) throw new Error("Shopify Client ID oder Client Secret fehlt.");
  const shopDomain = normalizeShopDomain(integration.shopDomain);
  if (!shopDomain) throw new Error("Shopify Shop-Domain fehlt.");

  const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret
    })
  });
  const payload = (await response.json().catch(() => ({}))) as ShopifyTokenResponse;
  if (!response.ok || !payload.access_token) {
    const message = payload.error_description || payload.error || `HTTP ${response.status}`;
    throw new Error(`Shopify Token konnte nicht erzeugt werden: ${message}`);
  }
  const expiresIn = Number(payload.expires_in || 86399);
  const accessTokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
  const updated = await prisma.shopifyIntegration.update({
    where: { tenantId },
    data: {
      accessTokenEnc: encryptSecret(payload.access_token),
      accessTokenExpiresAt,
      accessTokenScope: payload.scope || null
    }
  });
  return { integration: updated, token: payload.access_token };
}

export async function refreshShopifyAccessToken(tenantId: string) {
  const { integration } = await getShopifyAccessToken(tenantId, { forceRefresh: true });
  return {
    expiresAt: integration.accessTokenExpiresAt,
    scope: integration.accessTokenScope,
    tokenPreview: tokenPreview(integration.accessTokenEnc)
  };
}

function isProductAccessDenied(error: unknown) {
  return error instanceof Error && /access denied for products field/i.test(error.message);
}

async function fetchShopifyProductNodes(input: { shopDomain: string; tag: string; token: string; apiVersion: string }) {
  if (!input.tag) throw new Error("Shopify Tag-Filter fehlt.");
  const response = await fetch(`https://${input.shopDomain}/admin/api/${normalizeShopifyApiVersion(input.apiVersion)}/graphql.json`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-access-token": input.token
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
      variables: { query: `tag:'${input.tag.replace(/'/g, "\\'")}'` }
    })
  });
  if (!response.ok) throw new Error(`Shopify antwortet mit HTTP ${response.status}.`);
  const payload = (await response.json()) as ShopifyResponse;
  if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join("; "));
  return payload.data?.products?.edges?.map((edge) => edge.node) || [];
}

export async function syncShopifyProducts(tenantId: string) {
  let { integration, token } = await getShopifyAccessToken(tenantId);
  const tag = integration.productTag.trim();
  if (!tag) throw new Error("Shopify Tag-Filter fehlt.");
  const shopDomain = normalizeShopDomain(integration.shopDomain);
  const apiVersion = normalizeShopifyApiVersion(integration.apiVersion);
  let nodes: ShopifyNode[];
  try {
    nodes = await fetchShopifyProductNodes({ shopDomain, tag, token, apiVersion });
  } catch (error) {
    if (!isProductAccessDenied(error)) throw error;
    await prisma.shopifyIntegration.update({
      where: { tenantId },
      data: { accessTokenEnc: null, accessTokenExpiresAt: null, accessTokenScope: null }
    });
    ({ integration, token } = await getShopifyAccessToken(tenantId, { forceRefresh: true }));
    nodes = await fetchShopifyProductNodes({ shopDomain: normalizeShopDomain(integration.shopDomain), tag, token, apiVersion: normalizeShopifyApiVersion(integration.apiVersion) });
  }
  const seenIds: string[] = [];
  for (const node of nodes) {
    const externalId = productId(node.id);
    seenIds.push(externalId);
    const existing = await prisma.shopifyProduct.findUnique({ where: { tenantId_shopifyProductId: { tenantId, shopifyProductId: externalId } } });
    const baseSlug = normalizeSlug(node.handle || node.title, node.title);
    const slug = existing ? await uniqueSlugForUpdate("shopifyProduct", baseSlug, existing.id, tenantId) : await uniqueSlug("shopifyProduct", baseSlug, tenantId);
    const description = node.descriptionHtml || node.description || "";
    const product = await prisma.shopifyProduct.upsert({
      where: { tenantId_shopifyProductId: { tenantId, shopifyProductId: externalId } },
      update: {
        title: node.title,
        slug,
        handle: node.handle,
        description,
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
        description,
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
