const int = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const trimSlash = (value) => String(value || "").replace(/\/+$/, "");

export const config = {
  port: int(process.env.MCP_PORT, 8090),
  serverName: process.env.MCP_SERVER_NAME || "Playplaner MCP",
  serverVersion: process.env.MCP_SERVER_VERSION || "0.1.0",
  publicBaseUrl: trimSlash(process.env.MCP_PUBLIC_BASE_URL || "https://playplaner.com"),
  portalBaseUrl: trimSlash(process.env.MCP_PORTAL_BASE_URL || "http://app:8097"),
  requestTimeoutMs: int(process.env.MCP_REQUEST_TIMEOUT_MS, 30000),
  maxBodyBytes: int(process.env.MCP_MAX_BODY_BYTES, 512000)
};

export function protectedResourceUrl() {
  return `${config.publicBaseUrl}/.well-known/oauth-protected-resource`;
}
