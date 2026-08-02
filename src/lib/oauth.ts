import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { env } from "@/lib/env";

export const OAUTH_SCOPES = [
  "read:portal",
  "write:portal",
  "read:catalog",
  "write:catalog",
  "read:chat",
  "write:chat",
  "read:trackers",
  "write:trackers",
  "read:media",
  "write:media",
  "read:wiki",
  "write:wiki",
  "read:admin",
  "write:admin"
];

export function oauthIssuer(request?: Request) {
  if (request) {
    const url = new URL(request.url);
    return `${url.protocol}//${url.host}`;
  }
  return env.appUrl.replace(/\/+$/, "");
}

export function createOAuthClientId() {
  return `ppc_${randomBytes(24).toString("base64url")}`;
}

export function createOAuthCode() {
  return `poc_${randomBytes(32).toString("base64url")}`;
}

export function hashOAuthCode(code: string) {
  return createHmac("sha256", env.jwtSecret).update(code).digest("hex");
}

export function pkceS256(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function safeEqualText(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function normalizeRedirectUris(value: unknown) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item) => String(item || "").trim())
    .filter((item) => {
      try {
        const url = new URL(item);
        return url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
      } catch {
        return false;
      }
    })
    .slice(0, 20);
}
