import http from "node:http";
import { config } from "./config.js";
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

function publicBaseUrlFromRequest(request) {
  const rawHost = request.headers["x-forwarded-host"] || request.headers.host || new URL(config.publicBaseUrl).host;
  const rawProto = request.headers["x-forwarded-proto"] || new URL(config.publicBaseUrl).protocol.replace(/:$/, "") || "https";
  const host = Array.isArray(rawHost) ? rawHost[0] : rawHost;
  const proto = Array.isArray(rawProto) ? rawProto[0] : rawProto;
  return `${proto}://${host}`;
}

function sendMcpUnauthorized(request, response) {
  const baseUrl = publicBaseUrlFromRequest(request);
  sendJson(
    response,
    401,
    {
      error: {
        code: "unauthorized",
        message: "Bearer Token aus Playplaner fehlt oder ist ungültig."
      }
    },
    { "www-authenticate": `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"` }
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

function isNotification(rpc) {
  return rpc && typeof rpc === "object" && !Array.isArray(rpc) && rpc.id === undefined && typeof rpc.method === "string";
}

async function handleRpcMessage(rpc, context) {
  if (!rpc || typeof rpc !== "object" || Array.isArray(rpc)) {
    return rpcError(null, -32600, "Ungueltige JSON-RPC-Anfrage.");
  }
  const method = rpc.method;
  const id = rpc.id ?? null;
  const notification = isNotification(rpc);

  if (method === "notifications/initialized" || method === "initialized") return notification ? null : rpcResult(id, {});
  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: config.serverName, version: config.serverVersion },
      instructions: "Dieser MCP-Server kapselt Playplaner ausschliesslich ueber die bestehenden /api/external-Endpunkte. Nutze list_connectors fuer verfuegbare Fachkonnektoren und call_connector oder dedizierte Tools fuer Aktionen."
    });
  }
  if (method === "ping") return rpcResult(id, {});
  if (method === "tools/list") return rpcResult(id, { tools: listTools() });
  if (method === "tools/call") {
    const name = rpc?.params?.name;
    const args = rpc?.params?.arguments || {};
    const result = await callTool(name, args, context);
    return rpcResult(id, result);
  }
  return notification ? null : rpcError(id, -32601, `Methode ${method || "(leer)"} ist nicht implementiert.`);
}

async function handleMcp(request, response) {
  const token = bearerFromRequest(request);
  if (!token) return sendMcpUnauthorized(request, response);
  const me = await validateToken(token).catch(() => null);
  if (!me?.ok) return sendMcpUnauthorized(request, response);

  let rpc;
  try {
    rpc = await readBody(request);
  } catch (error) {
    return sendJson(response, error.status || 400, rpcError(null, -32700, "Ungültiger JSON-RPC-Body."));
  }

  const context = {
    token,
    me,
    publicBaseUrl: publicBaseUrlFromRequest(request)
  };
  try {
    if (Array.isArray(rpc)) {
      if (!rpc.length) return sendJson(response, 400, rpcError(null, -32600, "Leere JSON-RPC-Batches sind nicht erlaubt."));
      const results = [];
      for (const item of rpc) {
        const result = await handleRpcMessage(item, context);
        if (result) results.push(result);
      }
      if (!results.length) {
        response.writeHead(202, { "cache-control": "no-store" });
        return response.end();
      }
      return sendJson(response, 200, results);
    }

    const result = await handleRpcMessage(rpc, context);
    if (!result) {
      response.writeHead(202, { "cache-control": "no-store" });
      return response.end();
    }
    return sendJson(response, 200, result);
  } catch (error) {
    return sendJson(response, 200, rpcResult(rpc?.id ?? null, errorResult(error)));
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

function handleProtectedResource(request, response) {
  const baseUrl = publicBaseUrlFromRequest(request);
  sendJson(response, 200, {
    resource: `${baseUrl}/mcp`,
    authorization_servers: [baseUrl],
    scopes_supported: oauthScopes(),
    bearer_methods_supported: ["header"],
    resource_documentation: `${baseUrl}/settings/api`
  });
}

function oauthScopes() {
  return [
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
}

function handleAuthorizationServer(request, response) {
  const baseUrl = publicBaseUrlFromRequest(request);
  sendJson(response, 200, {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    registration_endpoint: `${baseUrl}/oauth/register`,
    revocation_endpoint: `${baseUrl}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    client_id_metadata_document_supported: true,
    scopes_supported: oauthScopes()
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (request.method === "GET" && url.pathname === "/health") return handleHealth(response);
    if (request.method === "GET" && url.pathname === "/.well-known/oauth-protected-resource") return handleProtectedResource(request, response);
    if (request.method === "GET" && url.pathname === "/.well-known/oauth-authorization-server") return handleAuthorizationServer(request, response);
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
