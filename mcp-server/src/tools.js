import { connectorById, connectorCatalog, connectorSummary } from "./connectors.js";
import { externalApiEndpointCatalog } from "./api-endpoints.js";
import { appendQuery, buildPublicUrl, fillPath, portalJson } from "./portal-client.js";
import { jsonResult, textResult } from "./format.js";

const API_METHODS = ["GET", "POST", "PATCH", "DELETE"];

function toolNameForEndpoint(method, apiPath) {
  const suffix = apiPath
    .replace(/^\/api\//, "")
    .replace(/\{([a-zA-Z0-9_]+)\}/g, "$1")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return `api_${method.toLowerCase()}_${suffix}`.slice(0, 96);
}

function pathParamNames(apiPath) {
  return [...String(apiPath).matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]);
}

function endpointToolSchema(endpoint, method) {
  const params = pathParamNames(endpoint.path);
  const properties = {
    query: {
      type: "object",
      additionalProperties: true,
      description: "Optionale Query-Parameter. Werte werden URL-kodiert."
    }
  };
  const required = [];
  if (params.length) {
    properties.pathParams = {
      type: "object",
      properties: Object.fromEntries(params.map((param) => [param, { type: "string" }])),
      required: params,
      additionalProperties: false,
      description: `Pfadparameter: ${params.join(", ")}.`
    };
    required.push("pathParams");
  }
  if (method !== "GET") {
    properties.body = {
      type: "object",
      additionalProperties: true,
      description: "JSON-Body fuer schreibende API-Aufrufe."
    };
  }
  return { type: "object", properties, required, additionalProperties: false };
}

function endpointDescription(endpoint, method) {
  const action = {
    GET: "liest",
    POST: "erstellt oder loest eine Aktion aus",
    PATCH: "aendert",
    DELETE: "loescht oder deaktiviert"
  }[method] || "ruft auf";
  const params = pathParamNames(endpoint.path);
  return `${endpoint.category}: ${action} ${endpoint.title} ueber ${endpoint.path}.${params.length ? ` Benoetigt Pfadparameter: ${params.join(", ")}.` : ""} Die Playplaner-API prueft Token, Rolle, Seite, Feature und Berechtigungen.`;
}

const generatedEndpointTools = externalApiEndpointCatalog.flatMap((endpoint) =>
  endpoint.methods
    .filter((method) => API_METHODS.includes(method))
    .map((method) => ({
      name: toolNameForEndpoint(method, endpoint.path),
      description: endpointDescription(endpoint, method),
      inputSchema: endpointToolSchema(endpoint, method),
      endpoint,
      method
    }))
);

const toolDefinitions = [
  {
    name: "portal_health",
    description: "Prüft den MCP-Server und die interne Playplaner-API.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (args, context) => {
      const status = await portalJson("/api/external/status", { token: context.token });
      return jsonResult("Playplaner ist erreichbar.", { ok: true, publicBaseUrl: context.publicBaseUrl, status });
    }
  },
  {
    name: "portal_me",
    description: "Zeigt den aktuellen API-Benutzer, die aktive Seite und verfügbare Fähigkeiten.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (args, context) => {
      const me = await portalJson("/api/external/capabilities", { token: context.token });
      return jsonResult("Aktueller Playplaner-Kontext.", me);
    }
  },
  {
    name: "list_connectors",
    description: "Listet die Playplaner-Connectoren, die dieser MCP-Server über die vorhandenen API-Endpunkte anbieten kann.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Optionaler Kategorienfilter, z. B. Katalog, Tracker, Chat." }
      },
      additionalProperties: false
    },
    handler: async ({ category } = {}) => {
      const normalized = String(category || "").trim().toLowerCase();
      const connectors = normalized
        ? connectorCatalog.filter((connector) => connector.category.toLowerCase() === normalized)
        : connectorCatalog;
      const grouped = normalized ? [{ category, connectors }] : connectorSummary();
      return jsonResult(`${connectors.length} Connectoren verfügbar.`, { connectors, grouped });
    }
  },
  {
    name: "call_connector",
    description: "Ruft einen bekannten Playplaner-Connector anhand seiner connectorId auf. Nutze zuerst list_connectors.",
    inputSchema: {
      type: "object",
      properties: {
        connectorId: { type: "string", description: "ID aus list_connectors, z. B. catalog.toys oder trackers.quotas." },
        method: { type: "string", enum: API_METHODS, description: "HTTP-Methode. Muss vom Connector unterstützt werden." },
        pathParams: { type: "object", additionalProperties: { type: "string" }, description: "Werte für {id} oder andere Pfadparameter." },
        query: { type: "object", additionalProperties: true, description: "Query-Parameter." },
        body: { type: "object", additionalProperties: true, description: "JSON-Body für POST/PATCH/DELETE." }
      },
      required: ["connectorId"],
      additionalProperties: false
    },
    handler: async ({ connectorId, method, pathParams, query, body }, context) => {
      const connector = connectorById(connectorId);
      if (!connector) throw new Error(`Unbekannter Connector: ${connectorId}`);
      const resolvedMethod = String(method || connector.methods[0] || "GET").toUpperCase();
      if (!connector.methods.includes(resolvedMethod)) {
        throw new Error(`${connectorId} unterstützt ${resolvedMethod} nicht. Erlaubt: ${connector.methods.join(", ")}`);
      }
      const path = fillPath(connector.path, pathParams);
      const result = await portalJson(path, { token: context.token, method: resolvedMethod, query, body });
      return jsonResult(`${connector.title} ausgeführt.`, {
        connector,
        request: { method: resolvedMethod, path: appendQuery(path, query) },
        result
      });
    }
  },
  {
    name: "get_portal_status",
    description: "Zeigt kompakt, was im Portal aktuell los ist: Ampel, Zähler, offene Tracker, Kontingente und letzte Einträge.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (args, context) => {
      const result = await portalJson("/api/external/status", { token: context.token });
      return jsonResult("Portalstatus.", result);
    }
  },
  {
    name: "search_all",
    description: "Sucht grob über zentrale Playplaner-Bereiche, indem mehrere vorhandene API-Endpunkte gelesen und clientseitig gefiltert werden.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Suchtext." },
        limit: { type: "number", description: "Maximale Trefferzahl, Standard 20." }
      },
      required: ["query"],
      additionalProperties: false
    },
    handler: async ({ query, limit = 20 }, context) => {
      const q = String(query || "").trim().toLowerCase();
      const endpoints = [
        ["Spielsachen", "/api/external/catalog/toys"],
        ["Szenen", "/api/external/catalog/positions"],
        ["Ideen", "/api/external/ideas"],
        ["Spielplanung", "/api/external/sessions"],
        ["Aufträge", "/api/external/orders"],
        ["Wiki", "/api/external/wiki"]
      ];
      const results = [];
      for (const [area, path] of endpoints) {
        try {
          const data = await portalJson(path, { token: context.token });
          const text = JSON.stringify(data).toLowerCase();
          if (!q || text.includes(q)) results.push({ area, path, data });
        } catch (error) {
          results.push({ area, path, error: error.body || error.message });
        }
        if (results.length >= limit) break;
      }
      return jsonResult(`${results.length} Bereiche mit Treffern oder prüfbaren Ergebnissen.`, { query, results });
    }
  },
  {
    name: "integration_api_request",
    description: "Kontrollierter Fallback für vorhandene Playplaner-API-Endpunkte unter /api/external/..., wenn noch kein dedizierter Connector existiert.",
    inputSchema: {
      type: "object",
      properties: {
        method: { type: "string", enum: API_METHODS },
        path: { type: "string", description: "Relativer Pfad unter /api/external/..., keine vollständige URL." },
        query: { type: "object", additionalProperties: true },
        body: { type: "object", additionalProperties: true }
      },
      required: ["method", "path"],
      additionalProperties: false
    },
    handler: async ({ method, path, query, body }, context) => {
      const resolvedMethod = String(method || "GET").toUpperCase();
      if (!API_METHODS.includes(resolvedMethod)) throw new Error(`Methode ${resolvedMethod} ist nicht erlaubt.`);
      const result = await portalJson(path, { token: context.token, method: resolvedMethod, query, body });
      return jsonResult("API-Endpunkt ausgeführt.", {
        request: { method: resolvedMethod, path: appendQuery(path, query) },
        result
      });
    }
  },
  {
    name: "public_link",
    description: "Erzeugt einen öffentlichen Playplaner-Link aus einem relativen App-Pfad.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relativer App-Pfad, z. B. /toys/example oder /sessions." }
      },
      required: ["path"],
      additionalProperties: false
    },
    handler: async ({ path }) => {
      if (!String(path || "").startsWith("/") || String(path).startsWith("//") || String(path).includes("..")) {
        throw new Error("Nur sichere relative Pfade sind erlaubt.");
      }
      return textResult(buildPublicUrl(path), { url: buildPublicUrl(path) });
    }
  }
];

export function listTools() {
  const baseTools = toolDefinitions.map(({ handler, inputSchema, ...tool }) => ({ ...tool, inputSchema }));
  const endpointTools = generatedEndpointTools.map(({ endpoint, method, ...tool }) => ({
    ...tool,
    annotations: {
      title: `${method} ${endpoint.path}`,
      readOnlyHint: method === "GET",
      destructiveHint: method === "DELETE"
    }
  }));
  return [...baseTools, ...endpointTools];
}

export async function callTool(name, args, context) {
  const tool = toolDefinitions.find((entry) => entry.name === name);
  if (tool) return tool.handler(args || {}, context);

  const endpointTool = generatedEndpointTools.find((entry) => entry.name === name);
  if (!endpointTool) throw new Error(`Unbekanntes Tool: ${name}`);
  const path = fillPath(endpointTool.endpoint.path, args?.pathParams);
  const result = await portalJson(path, {
    token: context.token,
    method: endpointTool.method,
    query: args?.query,
    body: endpointTool.method === "GET" ? undefined : args?.body
  });
  return jsonResult(`${endpointTool.method} ${endpointTool.endpoint.path} ausgefuehrt.`, {
    endpoint: {
      category: endpointTool.endpoint.category,
      title: endpointTool.endpoint.title,
      method: endpointTool.method,
      path: endpointTool.endpoint.path
    },
    request: { method: endpointTool.method, path: appendQuery(path, args?.query) },
    result
  });
}
