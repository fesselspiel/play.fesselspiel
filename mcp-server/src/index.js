import http from "node:http";
import { config, protectedResourceUrl } from "./config.js";
import { bearerFromRequest, validateToken } from "./portal-client.js";
import { callTool, listTools } from "./tools.js";
import { errorResult } from "./format.js";

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers
  });
  response.end(JSON.stringify(body, null, 2));
}

function sendMcpUnauthorized(response) {
  sendJson(
    response,
    401,
    {
      error: {
        code: "unauthorized",
        message: "Bearer Token aus Playplaner fehlt oder ist ungültig."
      }
    },
    { "www-authenticate": `Bearer resource_metadata="${protectedResourceUrl()}"` }
  );
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > config.maxBodyBytes) {
      const error = new Error("Request body too large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id, code, message, data) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

async function handleMcp(request, response) {
  const token = bearerFromRequest(request);
  if (!token) return sendMcpUnauthorized(response);
  const me = await validateToken(token).catch(() => null);
  if (!me?.ok) return sendMcpUnauthorized(response);

  let rpc;
  try {
    rpc = await readBody(request);
  } catch (error) {
    return sendJson(response, error.status || 400, rpcError(null, -32700, "Ungültiger JSON-RPC-Body."));
  }

  const method = rpc?.method;
  const id = rpc?.id ?? null;
  try {
    if (method === "initialize") {
      return sendJson(response, 200, rpcResult(id, {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: config.serverName, version: config.serverVersion },
        instructions: "Dieser MCP-Server kapselt Playplaner ausschließlich über die bestehenden /api/external-Endpunkte. Nutze list_connectors für verfügbare Fachkonnektoren und call_connector oder dedizierte Tools für Aktionen."
      }));
    }
    if (method === "ping") return sendJson(response, 200, rpcResult(id, {}));
    if (method === "tools/list") return sendJson(response, 200, rpcResult(id, { tools: listTools() }));
    if (method === "tools/call") {
      const name = rpc?.params?.name;
      const args = rpc?.params?.arguments || {};
      const result = await callTool(name, args, {
        token,
        me,
        publicBaseUrl: config.publicBaseUrl
      });
      return sendJson(response, 200, rpcResult(id, result));
    }
    return sendJson(response, 200, rpcError(id, -32601, `Methode ${method || "(leer)"} ist nicht implementiert.`));
  } catch (error) {
    return sendJson(response, 200, rpcResult(id, errorResult(error)));
  }
}

async function handleHealth(response) {
  const startedAt = new Date().toISOString();
  try {
    const health = await fetch(`${config.portalBaseUrl}/api/external/status`, { redirect: "manual" });
    sendJson(response, 200, {
      ok: true,
      server: { name: config.serverName, version: config.serverVersion },
      publicBaseUrl: config.publicBaseUrl,
      portalBaseUrlReachable: health.status === 401 || health.status === 428 || health.status === 200,
      portalStatus: health.status,
      checkedAt: startedAt
    });
  } catch (error) {
    sendJson(response, 503, {
      ok: false,
      server: { name: config.serverName, version: config.serverVersion },
      error: "portal_unreachable",
      message: error.message,
      checkedAt: startedAt
    });
  }
}

function handleProtectedResource(response) {
  sendJson(response, 200, {
    resource: `${config.publicBaseUrl}/mcp`,
    authorization_servers: [config.publicBaseUrl],
    bearer_methods_supported: ["header"],
    resource_documentation: `${config.publicBaseUrl}/settings/api`
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (request.method === "GET" && url.pathname === "/health") return handleHealth(response);
    if (request.method === "GET" && url.pathname === "/.well-known/oauth-protected-resource") return handleProtectedResource(response);
    if (url.pathname === "/mcp" && request.method === "DELETE") {
      response.writeHead(204);
      return response.end();
    }
    if (url.pathname === "/mcp" && request.method === "GET") {
      return sendJson(response, 405, { error: { code: "method_not_allowed", message: "Nutze POST /mcp." } }, { allow: "POST, DELETE" });
    }
    if (url.pathname === "/mcp" && request.method === "POST") return handleMcp(request, response);
    return sendJson(response, 404, { error: { code: "not_found" } });
  } catch (error) {
    return sendJson(response, 500, { error: { code: "mcp_internal_error", message: error.message } });
  }
});

server.listen(config.port, "0.0.0.0", () => {
  console.log(`${config.serverName} listening on ${config.port}`);
});
