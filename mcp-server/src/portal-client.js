import { config } from "./config.js";

const INTERNAL_URL_PATTERN = /\bhttps?:\/\/(?:app|localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?/gi;

export class PortalError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "PortalError";
    this.status = status;
    this.body = body;
  }
}

export function bearerFromRequest(request) {
  const authorization = request.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

export function buildPublicUrl(path) {
  const safePath = String(path || "/").startsWith("/") ? path : `/${path}`;
  return `${config.publicBaseUrl}${safePath}`;
}

export function assertSafeExternalPath(path) {
  const value = String(path || "");
  if (!/^\/api\/external\/[a-zA-Z0-9/_?=&.%:{}-]*$/.test(value)) {
    throw new PortalError("Nur relative Playplaner-API-Pfade unter /api/external/... sind erlaubt.", 400, {
      error: { code: "invalid_api_path" }
    });
  }
  if (value.includes("..") || value.includes("//") || value.includes("\\") || /^[a-z]+:/i.test(value)) {
    throw new PortalError("Unsicherer API-Pfad wurde abgelehnt.", 400, { error: { code: "unsafe_api_path" } });
  }
  return value;
}

export function fillPath(template, params = {}) {
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    const value = params[key];
    if (value === undefined || value === null || String(value).trim() === "") {
      throw new PortalError(`Pfadparameter ${key} fehlt.`, 400, { error: { code: "missing_path_param", param: key } });
    }
    return encodeURIComponent(String(value));
  });
}

export function appendQuery(path, query = {}) {
  const entries = Object.entries(query || {}).filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (!entries.length) return path;
  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
    } else {
      params.set(key, String(value));
    }
  }
  return `${path}${path.includes("?") ? "&" : "?"}${params}`;
}

function sanitize(value) {
  if (typeof value === "string") return value.replace(INTERNAL_URL_PATTERN, config.publicBaseUrl);
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitize(item)]));
  }
  return value;
}

export async function portalJson(path, { token, method = "GET", query, body } = {}) {
  const safePath = appendQuery(assertSafeExternalPath(path), query);
  const url = `${config.portalBaseUrl}${safePath}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const response = await fetch(url, {
      method,
      redirect: "manual",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : { ok: response.ok, text: await response.text().catch(() => "") };
    if (!response.ok) {
      throw new PortalError(data?.error?.message || data?.error || `Playplaner API antwortete mit HTTP ${response.status}`, response.status, sanitize(data));
    }
    return sanitize(data);
  } catch (error) {
    if (error.name === "AbortError") {
      throw new PortalError("Playplaner API Timeout.", 504, { error: { code: "portal_timeout" } });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function validateToken(token) {
  if (!token) return null;
  return portalJson("/api/external/capabilities", { token });
}
