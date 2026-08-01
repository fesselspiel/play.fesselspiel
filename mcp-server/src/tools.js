import { connectorById, connectorCatalog, connectorSummary } from "./connectors.js";
import { appendQuery, buildPublicUrl, fillPath, portalJson } from "./portal-client.js";
import { jsonResult, textResult } from "./format.js";

const API_METHODS = ["GET", "POST", "PATCH", "DELETE"];

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
  return toolDefinitions.map(({ handler, inputSchema, ...tool }) => ({ ...tool, inputSchema }));
}

export async function callTool(name, args, context) {
  const tool = toolDefinitions.find((entry) => entry.name === name);
  if (!tool) throw new Error(`Unbekanntes Tool: ${name}`);
  return tool.handler(args || {}, context);
}
