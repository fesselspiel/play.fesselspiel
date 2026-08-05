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

export const DEFAULT_MCP_SCOPES = OAUTH_SCOPES;

export function oauthIssuer(request?: Request) {
  if (request) {
    const url = new URL(request.url);
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
    const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(/:$/, "") || "https";
    return `${proto}://${host}`;
  }
  return env.appUrl.replace(/\/+$/, "");
}

export function oauthResource(request?: Request) {
  return `${oauthIssuer(request)}/mcp`;
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

export function normalizeScopes(scope?: string | null) {
  const requested = String(scope || "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const accepted = requested.filter((item) => OAUTH_SCOPES.includes(item));
  return accepted.length ? [...new Set(accepted)] : DEFAULT_MCP_SCOPES;
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

export function isChatGptClientUrl(clientId: string) {
  try {
    const url = new URL(clientId);
    return ["chatgpt.com", "chat.openai.com"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function isAllowedChatGptRedirect(redirectUri: string) {
  try {
    const url = new URL(redirectUri);
    return url.protocol === "https:" && ["chatgpt.com", "chat.openai.com"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function clientDisplayName(clientName: string | null | undefined, clientId: string) {
  if (clientName) return clientName;
  if (isChatGptClientUrl(clientId)) return "ChatGPT";
  return clientId;
}

export function isValidOAuthResource(resource: string | null | undefined, request: Request) {
  const value = String(resource || "").trim();
  return !value || value === oauthResource(request);
}
