import { createHmac, randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { getTenantByHost, normalizeHostname } from "@/lib/tenancy";

const PAIRING_LIFETIME_MS = 10 * 60_000;

export function pairingSecretHash(secret: string) {
  return createHmac("sha256", env.encryptionKey).update(`automation-pairing:${secret}`).digest("hex");
}

export function createPairingSecret() {
  return `ppair_${randomBytes(32).toString("base64url")}`;
}

export function requestPublicOrigin(request: Request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim() || url.host;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const protocol = forwardedProto || url.protocol.replace(":", "");
  if (!host || !["http", "https"].includes(protocol)) throw new Error("invalid_public_origin");
  if (process.env.NODE_ENV === "production" && protocol !== "https") throw new Error("https_required");
  return `${protocol}://${host}`;
}

export async function tenantForPairingRequest(request: Request) {
  const origin = requestPublicOrigin(request);
  const hostname = normalizeHostname(origin);
  const tenant = await getTenantByHost(hostname);
  if (!tenant) throw new Error("unknown_tenant_domain");
  return { tenant, origin, hostname };
}

export async function createAutomationBridgePairing(input: {
  request: Request;
  installationId: string;
  installationName?: string | null;
}) {
  const { tenant, origin, hostname } = await tenantForPairingRequest(input.request);
  const pollSecret = createPairingSecret();
  const expiresAt = new Date(Date.now() + PAIRING_LIFETIME_MS);
  await prisma.automationBridgePairing.updateMany({
    where: { tenantId: tenant.id, installationId: input.installationId, status: "PENDING" },
    data: { status: "CANCELLED" }
  });
  const pairing = await prisma.automationBridgePairing.create({
    data: {
      tenantId: tenant.id,
      installationId: input.installationId,
      installationName: input.installationName?.trim().slice(0, 120) || null,
      requestedHostname: hostname,
      requestedOrigin: origin,
      pollSecretHash: pairingSecretHash(pollSecret),
      expiresAt
    }
  });
  return {
    pairing,
    pollSecret,
    verificationUriComplete: `${origin}/settings/automation/pair?request=${encodeURIComponent(pairing.id)}`
  };
}

export async function automationBridgePairingForPoll(id: string, secret: string) {
  const pairing = await prisma.automationBridgePairing.findFirst({
    where: { id, pollSecretHash: pairingSecretHash(secret) },
    include: { tenant: { include: { domains: true, features: true } }, trackerType: true }
  });
  if (!pairing) return null;
  if (pairing.expiresAt <= new Date() && pairing.status !== "CONSUMED") {
    await prisma.$transaction([
      prisma.automationBridgePairing.updateMany({ where: { id: pairing.id, status: { in: ["PENDING", "APPROVED"] } }, data: { status: "EXPIRED", credentialEnc: null, mqttPasswordEnc: null } }),
      ...(pairing.apiTokenId ? [prisma.apiToken.updateMany({ where: { id: pairing.apiTokenId }, data: { active: false } })] : [])
    ]);
    return { ...pairing, status: "EXPIRED", credentialEnc: null, mqttPasswordEnc: null };
  }
  return pairing;
}

export function pairingCredential(value?: string | null) {
  return value ? decryptSecret(value) : "";
}

export function encryptedPairingCredential(value: string): string {
  const encrypted = encryptSecret(value);
  if (!encrypted) throw new Error("credential_encryption_failed");
  return encrypted;
}

export function extendPairingExpiry() {
  return new Date(Date.now() + PAIRING_LIFETIME_MS);
}
