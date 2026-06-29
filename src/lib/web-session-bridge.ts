import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { env } from "@/lib/env";

type WebSessionBridgePayload = {
  userId: string;
  tenantId?: string | null;
  redirectTo: string;
  exp: number;
  nonce: string;
};

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(value: string) {
  return createHmac("sha256", env.jwtSecret).update(value).digest("base64url");
}

function safeRedirectPath(value?: string | null) {
  const path = String(value || "/").trim();
  if (!path || path.startsWith("//") || /^https?:\/\//i.test(path)) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export function createWebSessionBridgeToken(input: { userId: string; tenantId?: string | null; redirectTo?: string | null; ttlSeconds?: number }) {
  const payload: WebSessionBridgePayload = {
    userId: input.userId,
    tenantId: input.tenantId || null,
    redirectTo: safeRedirectPath(input.redirectTo),
    exp: Date.now() + Math.max(30, Math.min(300, input.ttlSeconds || 120)) * 1000,
    nonce: randomUUID()
  };
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifyWebSessionBridgeToken(token?: string | null): WebSessionBridgePayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  const given = Buffer.from(signature);
  const signed = Buffer.from(expected);
  if (given.length !== signed.length || !timingSafeEqual(given, signed)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as WebSessionBridgePayload;
    if (!payload.userId || !payload.exp || payload.exp < Date.now()) return null;
    return { ...payload, redirectTo: safeRedirectPath(payload.redirectTo) };
  } catch {
    return null;
  }
}
