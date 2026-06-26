 "use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { CopyLink } from "@/components/copy-link";
import { Badge, Button, Field, inputClass, selectClass } from "@/components/ui";
import { apiNativeToolCatalog, ApiNativeTool, RequestMethod } from "@/lib/api-native-tool-catalog";
import { CheckCircle2, FileDown, RotateCcw, Search } from "lucide-react";

const apiTokenStorageKey = "fspiel:api-console:token";

type ToolId = string;

type RawRequestMethod = RequestMethod;

type RawPresetId = string;

type RawRequestContentType = "application/json" | "application/x-www-form-urlencoded" | "multipart/form-data";

type RawRequestBodyPreset = {
  method: RawRequestMethod;
  path: string;
  queryText: string;
  bodyText: string;
  contentType?: RawRequestContentType;
};

type RawRequestState = {
  method: RawRequestMethod;
  path: string;
  queryText: string;
  bodyText: string;
  contentType: RawRequestContentType;
  selectedPreset: RawPresetId;
  uploadFile: File | null;
};

type RawResultState = {
  status: string;
  body: string;
  durationMs?: number;
  requestUrl?: string;
  requestBody?: string;
  requestContentType?: string;
  curl?: string;
};

type ResultState = {
  running: boolean;
  status: string;
  body: string;
  requestUrl?: string;
  json?: boolean;
  durationMs?: number;
  openUrl?: string;
  curl?: string;
  requestContentType?: string;
  requestBody?: string;
};

type HistoryEntry = {
  id: string;
  createdAt: string;
  toolId: ToolId;
  method: RequestMethod;
  status: string;
  url: string;
  durationMs?: number;
  success: boolean;
};

type ApiNativeTokenHint = {
  id: string;
  name: string;
  tokenLastSix: string;
};

type ApiNativeConsoleProps = {
  apiTokens: ApiNativeTokenHint[];
};

type ToolState = {
  token: string;
  playReadyState: string;
  playReadyExpiresMinutes: string;
  playReadyHours: string;
  playReadyMinutes: string;
  trackerQuotaTracker: string;
  trackerStartKey: string;
  trackerStartNote: string;
  trackerStartDate: string;
  trackerStartDateTime: string;
  trackerStartAllDay: boolean;
  trackerStopKey: string;
  trackerStopNote: string;
  invitesMode: "usage" | "create";
  invitesName: string;
  invitesEmail: string;
  invitesSendEmail: boolean;
  invitesBcc: string;
  mediaQ: string;
  mediaKind: string;
  mediaCursor: string;
  mediaLimit: string;
  mediaAlbumId: string;
  mediaIncludeAlbums: boolean;
  imagesSource: string;
  imagesQ: string;
  imagesLimit: string;
  fileId: string;
  mediaUploadTitle: string;
  mediaUploadVisibility: string;
  mediaUploadAlbumId: string;
  mediaUploadFile?: File | null;
  dynamicPathParams: Record<ToolId, Record<string, string>>;
  dynamicQueryText: Record<ToolId, string>;
  dynamicBodyText: Record<ToolId, string>;
};

type ToolInitMap = Record<ToolId, string>;

const defaultToolState: ToolState = {
  token: "",
  playReadyState: "",
  playReadyExpiresMinutes: "",
  playReadyHours: "",
  playReadyMinutes: "",
  trackerQuotaTracker: "",
  trackerStartKey: "",
  trackerStartNote: "",
  trackerStartDate: "",
  trackerStartDateTime: "",
  trackerStartAllDay: false,
  trackerStopKey: "",
  trackerStopNote: "",
  invitesMode: "usage",
  invitesName: "",
  invitesEmail: "",
  invitesSendEmail: false,
  invitesBcc: "",
  mediaQ: "",
  mediaKind: "IMAGE",
  mediaCursor: "",
  mediaLimit: "50",
  mediaAlbumId: "",
  mediaIncludeAlbums: true,
  imagesSource: "all",
  imagesQ: "",
  imagesLimit: "12",
  fileId: "",
  mediaUploadTitle: "",
  mediaUploadVisibility: "PRIVATE",
  mediaUploadAlbumId: "",
  mediaUploadFile: null,
  dynamicPathParams: {},
  dynamicQueryText: {},
  dynamicBodyText: {}
};

type ToolBase = ApiNativeTool;

const tokenQueryKey = "token";
const rawRequestMethods: RequestMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const initialResultForTool: ResultState = { running: false, status: "", body: "" };
const initialRawRequestState = { method: "GET" as RequestMethod, path: "/api/external/status", queryText: "", bodyText: "" };

function getQueryTemplateFromPath(path: string) {
  const [, queryTemplate] = path.split("?");
  const values = new URLSearchParams(queryTemplate || "");
  values.delete(tokenQueryKey);
  return [...values.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function emptyResultsState(): Record<ToolId, ResultState> {
  return Object.fromEntries(apiNativeToolCatalog.map((tool) => [tool.id, initialResultForTool])) as Record<ToolId, ResultState>;
}

function buildRawPresets(tools: readonly ApiNativeTool[]): RawRequestBodyPreset[] {
  return tools
    .map((tool) => {
      const supportedMethods = tool.methods?.length ? tool.methods : [tool.method];
      return supportedMethods.map((method) => ({
        method,
        path: tool.path,
        queryText: getQueryTemplateFromPath(tool.path),
        bodyText: method === "GET" ? "" : ""
      }));
    })
    .flat()
    .map((entry) => {
      const contentType: RawRequestContentType = entry.method === "GET" ? "application/json" : "application/x-www-form-urlencoded";
      return { ...entry, contentType };
    })
    .filter((entry, index, all) =>
      all.findIndex((other) => other.method === entry.method && other.path === entry.path) === index
    );
}

function toResultText(value: unknown) {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function formatBytes(value: string | null | undefined) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const units = ["B", "KB", "MB", "GB"];
  let amount = bytes;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index++;
  }
  return `${index === 0 ? amount : amount.toFixed(1)} ${units[index]}`;
}

function parseBooleanText(value: boolean) {
  return value ? "true" : "false";
}

function extractPathVariables(path: string) {
  return Array.from(path.matchAll(/\{([^}]+)\}/g)).map((match) => match[1]);
}

function splitInputLines(value: string) {
  return value
    .split(/[\n&]/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function normalizeInputValue(value: string) {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  const numberValue = Number(trimmed);
  if (Number.isFinite(numberValue) && trimmed !== "") return numberValue;
  return trimmed;
}

function parseKeyValueInput(value: string) {
  const result = new URLSearchParams();
  for (const line of splitInputLines(value)) {
    const match = line.match(/^([^=:]+?)\s*(?:=|:)\s*(.+)$/);
    if (!match) continue;
    const key = match[1].trim();
    const raw = match[2].trim();
    if (!key) continue;
    const next = raw.replace(/^"(.*)"$/s, "$1").replace(/^'(.*)'$/s, "$1");
    result.set(key, String(normalizeInputValue(next)));
  }
  return result;
}

function parseJsonOrKeyValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return JSON.parse(trimmed);
    }
  } catch {
    // Fall through to key/value parser.
  }

  const parsed = parseKeyValueInput(trimmed);
  const output: Record<string, string> = {};
  for (const [key, item] of parsed.entries()) {
    output[key] = item;
  }
  if (!Object.keys(output).length) {
    throw new Error("Ungültiges Body-/Query-Format. Erwartet: key=value oder gültiges JSON.");
  }
  return output;
}

function parseRawBody(value: string, contentType: RawRequestContentType) {
  if (contentType === "application/json") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return JSON.parse(trimmed);
    }
    return parseJsonOrKeyValue(trimmed);
  }
  if (contentType === "application/x-www-form-urlencoded") {
    return parseJsonOrKeyValue(value);
  }
  return value.trim() ? parseJsonOrKeyValue(value) : null;
}

function rawUrlFromInput(baseUrl: string, path: string) {
  const trimmed = path.trim();
  if (!trimmed) throw new Error("Pfad ist leer.");
  if (/^https?:\/\//i.test(trimmed)) {
    return new URL(trimmed);
  }
  if (!trimmed.startsWith("/")) {
    throw new Error("Pfad muss mit / beginnen oder eine absolute URL sein.");
  }
  return new URL(`${baseUrl}${trimmed}`);
}

function buildRawCurl(url: URL, method: RawRequestMethod, token: string, requestBody: string, contentType?: string) {
  const tokenHeader = token ? ` -H ${JSON.stringify("Authorization: Bearer <API_TOKEN>")}` : "";
  const contentTypeHeader = contentType ? ` -H ${JSON.stringify(`content-type: ${contentType}`)}` : "";
  const payload = requestBody ? ` ${requestBody}` : "";
  return `curl -X ${method} ${JSON.stringify(url.toString())}${tokenHeader}${contentTypeHeader}${payload}`.replace(/\s+/g, " ").trim();
}

function setStringParam(target: Record<string, string>, key: string, value: string | undefined | null) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return;
  target[key] = trimmed;
}

function setQueryParam(target: URLSearchParams, key: string, value: string | undefined | null) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return;
  target.set(key, trimmed);
}

function toImageSource(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "bondagesystem") return "bondage-system";
  return normalized;
}

function formatRequestBody(values: Record<string, string>, mediaFile?: File | null) {
  if (mediaFile) {
    const fields = Object.entries(values)
      .map(([key, value]) => `-F ${JSON.stringify(`${key}=${value}`)}`)
      .join(" ");
    const upload = `-F ${JSON.stringify(`file=@${mediaFile.name || "file.bin"}`)}`;
    return `${upload} ${fields}`.trim();
  }
  const entries = Object.entries(values);
  if (!entries.length) return "";
  return `-H ${JSON.stringify("Content-Type: application/json")} --data ${JSON.stringify(JSON.stringify(values))}`;
}

function formatHistoryTime(dateIso: string) {
  const value = new Date(dateIso);
  if (Number.isNaN(value.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(value);
}

function requestStatusTone(status: string) {
  const start = status.toLowerCase();
  if (!status || start === "... läuft") return "neutral";
  const code = Number(start.split(" ")[0]);
  if (Number.isFinite(code) && code >= 200 && code < 300) return "green";
  return "red";
}

export function ApiNativeConsole({ apiTokens }: ApiNativeConsoleProps) {
  const queryTemplateByToolId = useMemo(
    () =>
      Object.fromEntries(
        apiNativeToolCatalog.map((tool) => [tool.id, getQueryTemplateFromPath(tool.path)])
      ) as ToolInitMap,
    []
  );
  const toolsById = useMemo(
    () => Object.fromEntries(apiNativeToolCatalog.map((entry) => [entry.id, entry])) as Record<ToolId, ToolBase>,
    []
  );
  const groupedTools = useMemo(() => {
    const groups = apiNativeToolCatalog.reduce((acc, tool) => {
      const category = tool.category || "Externe API";
      if (!acc[category]) acc[category] = [];
      acc[category]!.push(tool);
      return acc;
    }, {} as Record<string, ToolBase[]>);
    return Object.entries(groups)
      .map(([category, tools]) => [category, [...tools].sort((a, b) => a.title.localeCompare(b.title))] as [string, ToolBase[]])
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, []);
  const defaultMethods = useMemo(() =>
    Object.fromEntries(apiNativeToolCatalog.map((tool) => [tool.id, tool.methods?.[0] || tool.method])) as Record<ToolId, RequestMethod>,
    []
  );
  const rawPresets = useMemo(() => buildRawPresets(apiNativeToolCatalog), []);
  const [toolMethods, setToolMethods] = useState<Record<ToolId, RequestMethod>>(defaultMethods);
  const [state, setState] = useState<ToolState>(() => ({
    ...defaultToolState,
    dynamicQueryText: Object.fromEntries(
      apiNativeToolCatalog
        .filter((tool) => tool.source === "capability")
        .map((tool) => [tool.id, queryTemplateByToolId[tool.id] || ""])
    ) as Record<ToolId, string>
  }));
  const [results, setResults] = useState<Record<ToolId, ResultState>>(emptyResultsState());
  const [rawState, setRawState] = useState<RawRequestState>(() => ({
    ...initialRawRequestState,
    method: "GET",
    contentType: "application/json",
    selectedPreset: "",
    uploadFile: null
  }));
  const [rawResult, setRawResult] = useState<RawResultState | null>(null);
  const [toolFilter, setToolFilter] = useState("");
  const [runHistory, setRunHistory] = useState<HistoryEntry[]>([]);

  const baseUrl = useMemo(() => {
    if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
    return process.env.NEXT_PUBLIC_BASE_URL || "https://playplaner.com";
  }, []);

  const selectedToken = apiTokens[0]?.tokenLastSix ? `...${apiTokens[0].tokenLastSix}` : "";

  const filteredToolGroups = useMemo(() => {
    const query = toolFilter.trim().toLowerCase();
    if (!query) return groupedTools;
    return groupedTools
      .map(([group, tools]) => [
        group,
        tools.filter((tool) =>
          [tool.title, tool.description, tool.path, tool.id, tool.capability, tool.action]
            .join(" ")
            .toLowerCase()
            .includes(query)
        )
      ] as [string, ToolBase[]])
      .filter(([, tools]) => tools.length > 0);
  }, [toolFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(apiTokenStorageKey);
    if (saved) {
      setState((current) => ({ ...current, token: saved }));
    }
  }, []);

  function setMethod(toolId: ToolId, method: RequestMethod) {
    setToolMethods((current) => ({ ...current, [toolId]: method }));
    const isCapabilityTool = toolsById[toolId]?.source === "capability";
    if (isCapabilityTool && method === "GET") {
      setState((current) => ({
        ...current,
        dynamicQueryText: {
          ...current.dynamicQueryText,
          [toolId]: current.dynamicQueryText[toolId]?.trim() || queryTemplateByToolId[toolId] || ""
        }
      }));
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = state.token.trim();
    if (!token) return;
    window.localStorage.setItem(apiTokenStorageKey, token);
  }, [state.token]);

  function setField<K extends keyof ToolState>(field: K, value: ToolState[K]) {
    setState((current) => ({ ...current, [field]: value }));
  }

  function setRawField<K extends keyof Omit<RawRequestState, "uploadFile">>(field: K, value: RawRequestState[K]) {
    setRawState((current) => ({ ...current, [field]: value }));
  }

  function setRawUploadFile(file: File | null) {
    setRawState((current) => ({ ...current, uploadFile: file }));
  }

  function selectRawPreset(presetId: RawPresetId) {
    const preset = rawPresets.find((entry) => `${entry.method}:${entry.path}` === presetId);
    if (!preset) {
      setRawField("selectedPreset", presetId);
      return;
    }
    setRawState((current) => ({
      ...current,
      selectedPreset: presetId,
      method: preset.method,
      path: preset.path,
      queryText: preset.queryText || "",
      bodyText: preset.bodyText || "",
      contentType: preset.contentType || "application/json"
    }));
  }

  function clearRawResult() {
    setRawResult(null);
  }

  function resetRawState() {
    clearRawResult();
    setRawState((current) => ({
      ...current,
      method: "GET",
      selectedPreset: "",
      contentType: "application/json",
      path: "/api/external/status",
      queryText: "",
      bodyText: "",
      uploadFile: null
    }));
  }

  function setPathParam(toolId: ToolId, key: string, value: string) {
    setState((current) => ({
      ...current,
      dynamicPathParams: {
        ...current.dynamicPathParams,
        [toolId]: {
          ...(current.dynamicPathParams[toolId] || {}),
          [key]: value
        }
      }
    }));
  }

  function setQueryText(toolId: ToolId, value: string) {
    setState((current) => ({
      ...current,
      dynamicQueryText: {
        ...current.dynamicQueryText,
        [toolId]: value
      }
    }));
  }

  function setBodyText(toolId: ToolId, value: string) {
    setState((current) => ({
      ...current,
      dynamicBodyText: {
        ...current.dynamicBodyText,
        [toolId]: value
      }
    }));
  }

  function resetCapabilityInputs(toolId: ToolId) {
    setState((current) => ({
      ...current,
      dynamicPathParams: {
        ...current.dynamicPathParams,
        [toolId]: {}
      },
      dynamicQueryText: {
        ...current.dynamicQueryText,
        [toolId]: queryTemplateByToolId[toolId] || ""
      },
      dynamicBodyText: {
        ...current.dynamicBodyText,
        [toolId]: ""
      }
    }));
  }

  function setResult(id: ToolId, updater: Partial<ResultState>) {
    setResults((current) => ({ ...current, [id]: { ...(current[id] || initialResultForTool), ...updater } }));
  }

  function clearToken() {
    setField("token", "");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(apiTokenStorageKey);
    }
  }

  function clearResults() {
    setResults(emptyResultsState());
  }

  function clearHistory() {
    setRunHistory([]);
  }

  async function executeTool(toolId: ToolId, formEvent?: FormEvent<HTMLFormElement>) {
    if (formEvent) {
      formEvent.preventDefault();
    }
    const tool = toolsById[toolId];
    if (!tool) return;
    const method = toolMethods[toolId] ?? tool.method;
    const startedAt = new Date().toISOString();

    setResult(toolId, { running: true, status: "... läuft", body: "" });
    try {
      const token = state.token.trim();
      const start = typeof performance === "undefined" ? Date.now() : performance.now();
      const [toolPathWithoutQuery, toolQueryTemplate] = tool.path.split("?");
      const url = new URL(`${baseUrl}${toolPathWithoutQuery}`);
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      let init: RequestInit = { method, headers };
      const bodyValues: Record<string, string> = {};
      const uploadValues: Record<string, string> = {};
      const query = new URLSearchParams();
      if (toolQueryTemplate) {
        new URLSearchParams(toolQueryTemplate).forEach((value, key) => {
          if (key.toLowerCase() === "token") return;
          if (!value) return;
          query.set(key, value);
        });
      }
      if (token) query.set("token", token);

      if (tool.source === "capability") {
        const pathVariables = extractPathVariables(tool.path);
        let resolvedPath = toolPathWithoutQuery;
        for (const key of pathVariables) {
          const value = state.dynamicPathParams[tool.id]?.[key]?.trim();
          if (!value) {
            throw new Error(`Pfad-Parameter „${key}“ ist Pflicht für ${tool.path}`);
          }
          resolvedPath = resolvedPath.replace(`{${key}}`, encodeURIComponent(value));
        }
        url.pathname = resolvedPath;

        if (method === "GET") {
          const rawQuery = parseKeyValueInput(state.dynamicQueryText[tool.id] || "").entries();
          for (const [queryKey, queryValue] of rawQuery) {
            query.set(queryKey, queryValue);
          }
        } else {
          const bodyValue = parseJsonOrKeyValue(state.dynamicBodyText[tool.id] || "");
          if (bodyValue != null) {
            init = {
              ...init,
              method,
              headers: { ...headers, "content-type": "application/json" },
              body: JSON.stringify(bodyValue)
            };
          }
        }
      } else if (toolId === "status" || toolId === "capabilities") {
        // no parameters
      } else if (toolId === "playReady") {
        if (state.playReadyState) {
          if (method === "GET") setQueryParam(query, "state", state.playReadyState);
          else setStringParam(bodyValues, "state", state.playReadyState);
        }
        if (state.playReadyExpiresMinutes || state.playReadyHours || state.playReadyMinutes) {
          const effectiveHours = state.playReadyHours.trim();
          const effectiveMinutes = state.playReadyMinutes.trim();
          const effectiveExpiresMinutes = state.playReadyExpiresMinutes.trim();
          if (effectiveExpiresMinutes) {
            if (method === "GET") setQueryParam(query, "expiresMinutes", effectiveExpiresMinutes);
            else setStringParam(bodyValues, "expiresMinutes", effectiveExpiresMinutes);
          } else if (effectiveHours || effectiveMinutes) {
            if (method === "GET") {
              if (effectiveHours) setQueryParam(query, "hours", effectiveHours);
              if (effectiveMinutes) setQueryParam(query, "minutes", effectiveMinutes);
            } else {
              if (effectiveHours) setStringParam(bodyValues, "hours", effectiveHours);
              if (effectiveMinutes) setStringParam(bodyValues, "minutes", effectiveMinutes);
            }
          }
        }
      } else if (toolId === "trackersQuota") {
        if (method === "GET") setQueryParam(query, "trackerKey", state.trackerQuotaTracker);
        else setStringParam(bodyValues, "trackerKey", state.trackerQuotaTracker);
      } else if (toolId === "trackerStart") {
        if (!state.trackerStartKey.trim()) throw new Error("trackerKey ist Pflicht");
        const target = tool.path.replace("{trackerKey}", encodeURIComponent(state.trackerStartKey.trim()));
        url.pathname = target;
        if (method === "GET") {
          setQueryParam(query, "note", state.trackerStartNote);
          if (state.trackerStartAllDay) setQueryParam(query, "allDay", parseBooleanText(state.trackerStartAllDay));
          setQueryParam(query, "date", state.trackerStartDate);
          setQueryParam(query, "startTime", state.trackerStartDateTime);
        } else {
          setStringParam(bodyValues, "note", state.trackerStartNote);
          if (state.trackerStartAllDay) setStringParam(bodyValues, "allDay", parseBooleanText(state.trackerStartAllDay));
          setStringParam(bodyValues, "date", state.trackerStartDate);
          setStringParam(bodyValues, "startTime", state.trackerStartDateTime);
        }
      } else if (toolId === "trackerStop") {
        if (!state.trackerStopKey.trim()) throw new Error("trackerKey ist Pflicht");
        const target = tool.path.replace("{trackerKey}", encodeURIComponent(state.trackerStopKey.trim()));
        url.pathname = target;
        if (method === "GET") setQueryParam(query, "note", state.trackerStopNote);
        else setStringParam(bodyValues, "note", state.trackerStopNote);
      } else if (toolId === "invites") {
        if (state.invitesMode === "usage" && method === "POST") {
          throw new Error("invites-Usage kann aktuell nur per GET getestet werden.");
        }
        if (state.invitesMode === "create") {
          if (method === "GET") query.set("create", "1");
          else setStringParam(bodyValues, "create", "1");
          if (method === "GET") setQueryParam(query, "name", state.invitesName);
          else setStringParam(bodyValues, "name", state.invitesName);
          if (method === "GET") setQueryParam(query, "email", state.invitesEmail);
          else setStringParam(bodyValues, "email", state.invitesEmail);
          if (method === "GET") setQueryParam(query, "bcc", state.invitesBcc);
          else setStringParam(bodyValues, "bcc", state.invitesBcc);
          if (state.invitesSendEmail) {
            if (method === "GET") query.set("sendEmail", "1");
            else setStringParam(bodyValues, "sendEmail", "1");
          }
        }
      } else if (toolId === "mediaFeed") {
        if (method === "GET") {
          setQueryParam(query, "q", state.mediaQ);
          setQueryParam(query, "kind", state.mediaKind);
          setQueryParam(query, "cursor", state.mediaCursor);
          setQueryParam(query, "albumId", state.mediaAlbumId);
          setQueryParam(query, "limit", state.mediaLimit);
          setQueryParam(query, "includeAlbums", state.mediaIncludeAlbums ? "1" : "0");
        } else {
          setStringParam(bodyValues, "q", state.mediaQ);
          setStringParam(bodyValues, "kind", state.mediaKind);
          setStringParam(bodyValues, "cursor", state.mediaCursor);
          setStringParam(bodyValues, "albumId", state.mediaAlbumId);
          setStringParam(bodyValues, "limit", state.mediaLimit);
          setStringParam(bodyValues, "includeAlbums", state.mediaIncludeAlbums ? "1" : "0");
        }
      } else if (toolId === "imagesFeed") {
        if (method === "GET") {
          setQueryParam(query, "source", toImageSource(state.imagesSource));
          setQueryParam(query, "q", state.imagesQ);
          setQueryParam(query, "limit", state.imagesLimit);
        } else {
          setStringParam(bodyValues, "source", toImageSource(state.imagesSource));
          setStringParam(bodyValues, "q", state.imagesQ);
          setStringParam(bodyValues, "limit", state.imagesLimit);
        }
      } else if (toolId === "fileDownload") {
        if (!state.fileId.trim()) throw new Error("fileId ist Pflicht");
        url.pathname = tool.path.replace("{fileId}", encodeURIComponent(state.fileId.trim()));
      } else if (toolId === "mediaUpload") {
        const file = state.mediaUploadFile;
        if (!file) throw new Error("Eine Datei ist erforderlich");
        const form = new FormData();
        form.append("file", file);
        if (state.mediaUploadTitle.trim()) {
          const title = state.mediaUploadTitle.trim();
          form.append("title", title);
          uploadValues.title = title;
        }
        form.append("visibility", state.mediaUploadVisibility);
        uploadValues.visibility = state.mediaUploadVisibility;
        if (state.mediaUploadAlbumId.trim()) {
          const albumId = state.mediaUploadAlbumId.trim();
          form.append("albumId", albumId);
          uploadValues.albumId = albumId;
        }
        init = { method: "POST", body: form, headers };
      }

      if (method === "GET") {
        init = { ...init, method: "GET", headers };
      } else if (!init.body) {
        const payload = Object.keys(bodyValues);
        init = payload.length
          ? { ...init, method, headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(bodyValues) }
          : { ...init, method, headers };
      }

      if (query.size > 0) url.search = `?${query.toString()}`;
      const requestUrl = url.toString();
      const requestBody = method === "GET"
        ? ""
        : init.body instanceof FormData
          ? formatRequestBody(uploadValues, state.mediaUploadFile)
          : typeof init.body === "string"
            ? `--data ${JSON.stringify(init.body)}`
            : "";
      const requestHeaders = init.headers && !(init.headers instanceof Headers)
        ? Object.entries(init.headers as Record<string, string>)
        : [];
      const requestContentType = requestHeaders
        .find(([key]) => key.toLowerCase() === "content-type")?.[1] || "";
      const requestAuth = token ? "Authorization: Bearer <API_TOKEN>" : "";
      const curl = `curl -X ${method} ${JSON.stringify(requestUrl)}${requestAuth ? ` -H ${JSON.stringify(requestAuth)}` : " "}${requestContentType ? ` -H ${JSON.stringify(`content-type: ${requestContentType}`)} ` : ""}${requestBody ? ` ${requestBody}` : ""}`.replace(/\s+/g, " ").trim();

      const response = await fetch(url.toString(), init);
      const isJson = response.headers.get("content-type")?.includes("application/json");
      let body = "";
      let openUrl = "";
      if (toolId === "fileDownload" && response.ok && !isJson) {
        const sizeHint = formatBytes(response.headers.get("content-length"));
        const sizeText = sizeHint ? ` · ${sizeHint}` : "";
        body = `Datei geladen: ${response.status} ${response.statusText}${sizeText}`;
        openUrl = response.url;
      } else {
        const text = isJson
          ? await response
              .clone()
              .json()
              .then((value) => toResultText(value))
              .catch(async () => response.text())
          : await response.text();
        body = text || "";
      }
      const status = `${response.status} ${response.statusText}`;
      const durationMs = typeof performance === "undefined" ? undefined : Math.max(0, Math.round(performance.now() - start));
      setResult(toolId, {
        running: false,
        status,
        body,
        json: Boolean(isJson),
        requestUrl: url.toString(),
        requestContentType,
        requestBody,
        curl,
        openUrl: openUrl || undefined,
        durationMs
      });
      setRunHistory((current) => [
        {
          id: `${Date.now()}-${toolId}-${method}`,
          createdAt: startedAt,
          method,
          status,
          success: response.ok,
          url: requestUrl,
          toolId,
          durationMs
        },
        ...current
      ].slice(0, 20));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unbekannter Fehler";
      const status = "Fehler";
      setResult(toolId, {
        running: false,
        status,
        body: message,
        json: false,
        requestUrl: undefined,
        requestContentType: "",
        requestBody: undefined,
        curl: undefined,
      });
      setRunHistory((current) => [
        {
          id: `${Date.now()}-${toolId}-${method}`,
          createdAt: startedAt,
          method,
          status,
          success: false,
          url: "",
          toolId
        },
        ...current
      ].slice(0, 20));
    }
  }

  async function executeRawRequest(formEvent?: FormEvent<HTMLFormElement>) {
    if (formEvent) {
      formEvent.preventDefault();
    }
    const startedAt = new Date().toISOString();
    setRawResult((current) => ({ ...(current || { status: "", body: "" }), status: "... läuft", body: "" }));
    try {
      const token = state.token.trim();
      const url = rawUrlFromInput(baseUrl, rawState.path);
      const query = new URLSearchParams(url.search);
      const bodyValues = parseKeyValueInput(rawState.queryText || "");
      bodyValues.forEach((value, key) => {
        if (value === "") return;
        query.set(key, value);
      });
      if (token) query.set("token", token);
      if (query.size) {
        url.search = `?${query.toString()}`;
      } else {
        url.search = "";
      }
      const headers: HeadersInit = {};
      const method = rawState.method;
      let init: RequestInit = { method, headers };
      let requestBody = "";
      const requestContentType = rawState.contentType;
      const isMultipart = requestContentType === "multipart/form-data";
      if (method !== "GET") {
        if (isMultipart) {
          const parsed = parseJsonOrKeyValue(rawState.bodyText || "");
          const uploadValues: Record<string, string> = {};
          const form = new FormData();
          for (const [key, value] of Object.entries(parsed || {})) {
            form.append(key, String(value));
            uploadValues[key] = String(value);
          }
          if (rawState.uploadFile) {
            form.append("file", rawState.uploadFile);
          }
          init = { ...init, body: form };
          requestBody = formatRequestBody(uploadValues, rawState.uploadFile);
        } else {
          const parsed = parseRawBody(rawState.bodyText || "", requestContentType);
          if (parsed != null) {
            if (requestContentType === "application/x-www-form-urlencoded" && typeof parsed === "object" && parsed != null && !Array.isArray(parsed)) {
              const formValues = new URLSearchParams();
              for (const [entryKey, entryValue] of Object.entries(parsed)) {
                formValues.set(entryKey, String(entryValue));
              }
              const formBody = formValues.toString();
              requestBody = `--data ${JSON.stringify(formBody)}`;
              init = {
                ...init,
                method,
                headers: { ...headers, "content-type": requestContentType },
                body: formBody
              };
            } else {
              requestBody = `--data ${JSON.stringify(typeof parsed === "string" ? parsed : JSON.stringify(parsed))}`;
              init = {
                ...init,
                method,
                headers: {
                  ...headers,
                  "content-type": requestContentType
                },
                body: typeof parsed === "string" ? parsed : JSON.stringify(parsed)
              };
            }
          }
        }
      }
      const start = typeof performance === "undefined" ? Date.now() : performance.now();
      const response = await fetch(url.toString(), init);
      const isJson = response.headers.get("content-type")?.includes("application/json");
      const responseBody = isJson
        ? await response
            .clone()
            .json()
            .then((value) => toResultText(value))
            .catch(async () => response.text())
        : await response.text();
      const status = `${response.status} ${response.statusText}`;
      const durationMs = typeof performance === "undefined" ? undefined : Math.max(0, Math.round(performance.now() - start));
      const curl = buildRawCurl(url, method, token, requestBody, requestContentType);
      setRawResult({
        status,
        body: responseBody || "",
        requestUrl: url.toString(),
        requestBody,
        requestContentType,
        curl,
        durationMs
      });
      setRunHistory((current) => [
        {
          id: `${Date.now()}-raw-${method}`,
          createdAt: startedAt,
          method,
          status,
          success: response.ok,
          url: url.toString(),
          toolId: "raw-request",
          durationMs
        },
        ...current
      ].slice(0, 20));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unbekannter Fehler";
      setRawResult({
        status: "Fehler",
        body: message,
        requestUrl: rawState.path,
        requestBody: rawState.bodyText
      });
      setRunHistory((current) => [
        {
          id: `${Date.now()}-raw-${rawState.method}`,
          createdAt: startedAt,
          method: rawState.method,
          status: "Fehler",
          success: false,
          url: rawState.path,
          toolId: "raw-request"
        },
        ...current
      ].slice(0, 20));
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-graphite">
        Tip: Trage hier deinen API-Token ein (siehe Tokenverwaltung), dann kannst du alle API-Funktionen direkt testen.
      </p>
      {apiTokens.length ? (
        <p className="text-xs text-graphite">
          Letzte Tokens: {apiTokens.slice(0, 3).map((token) => token.name ? `${token.name} (...${token.tokenLastSix})` : `...${token.tokenLastSix}`).join(", ")}
          {apiTokens.length ? ` · zuletzt genutzt: ${selectedToken}` : null}
        </p>
      ) : null}

      <div className="space-y-2">
        <label className="block text-sm">
          <span className="mb-1 block text-graphite">Tools filtern</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-graphite" />
            <input
              type="search"
              className={`${inputClass} pl-10`}
              value={toolFilter}
              onChange={(event) => setToolFilter(event.currentTarget.value)}
              placeholder="Pfad, Titel, Beschreibung..."
            />
          </div>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={clearResults} className="shrink-0"><RotateCcw className="h-4 w-4" /> Ergebnisse zurücksetzen</Button>
          <Button type="button" variant="secondary" onClick={clearHistory} className="shrink-0"><RotateCcw className="h-4 w-4" /> Verlauf löschen</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-0 flex-1 text-sm">
          <span className="mb-1 block text-graphite">API-Token</span>
          <input
            type="text"
            className={inputClass}
            value={state.token}
            placeholder={apiTokens[0]?.name
              ? `Token für ${apiTokens[0]?.name} (...${apiTokens[0].tokenLastSix})`
              : "FSP_..."}
            onChange={(event) => setField("token", event.currentTarget.value)}
          />
        </label>
        <Button type="button" variant="secondary" onClick={clearToken} className="shrink-0">
          Token löschen
        </Button>
      </div>

      {!state.token ? <p className="text-xs text-redbrand">Kein Token gesetzt. Externe Calls schlagen ohne Token meistens mit 401 fehl.</p> : null}

      {runHistory.length ? (
        <div className="space-y-2 rounded-md border border-line bg-paper p-3">
          <p className="text-sm font-semibold text-ink">Letzte Requests</p>
          <div className="space-y-2 text-xs">
            {runHistory.slice(0, 6).map((entry) => (
              <div key={entry.id} className="rounded-md border border-line bg-surface p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex min-h-6 items-center gap-2">
                    <Badge tone={entry.success ? "green" : "red"}>{entry.method}</Badge>
                    <span className={`inline-flex min-h-6 items-center font-semibold ${entry.success ? "text-graphite" : "text-redbrand"}`}>{entry.status}</span>
                  </span>
                  <span className="text-[11px] text-graphite">{formatHistoryTime(entry.createdAt)} · {entry.durationMs ? `${entry.durationMs} ms` : "-"}</span>
                </div>
                <p className="mt-1 break-all text-[11px] text-graphite">{entry.url || `Tool ${entry.toolId}`}</p>
                <p className="text-[11px] text-graphite">{entry.toolId === "raw-request" ? "Roh-Request" : toolsById[entry.toolId]?.title || entry.toolId}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <section className="rounded-md border border-line bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">Roh-Request (beliebiger Endpoint)</h3>
          <span className="text-xs text-graphite">
            Schnellzugriff auf nicht-gelistete / neue Endpunkte
          </span>
        </div>
        <form onSubmit={(event) => { void executeRawRequest(event); }} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
            <Field label="Preset laden">
              <select
                className={selectClass}
                value={rawState.selectedPreset}
                onChange={(event) => selectRawPreset(event.currentTarget.value)}
              >
                <option value="">-- manuell --</option>
                {rawPresets.map((preset) => (
                  <option key={`${preset.method}:${preset.path}`} value={`${preset.method}:${preset.path}`}>
                    {preset.method} {preset.path}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-graphite">Methode</span>
                <select
                  className={selectClass}
                  value={rawState.method}
                  onChange={(event) => {
                    setRawField("method", event.currentTarget.value as RawRequestMethod);
                    setRawField("selectedPreset", "");
                  }}
                >
                  {rawRequestMethods.map((method) => (
                    <option key={method} value={method}>{method}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-graphite">Inhaltstyp</span>
                <select
                  className={selectClass}
                  value={rawState.contentType}
                  onChange={(event) => {
                    setRawField("contentType", event.currentTarget.value as RawRequestContentType);
                    setRawField("selectedPreset", "");
                  }}
                >
                  <option value="application/json">application/json</option>
                  <option value="application/x-www-form-urlencoded">application/x-www-form-urlencoded</option>
                  <option value="multipart/form-data">multipart/form-data</option>
                </select>
              </label>
            </div>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-graphite">Pfad</span>
              <input
                className={inputClass}
                value={rawState.path}
                onChange={(event) => {
                  setRawField("path", event.currentTarget.value);
                  setRawField("selectedPreset", "");
                }}
                placeholder="/api/external/status"
              />
          </label>
          <label className="block text-sm text-graphite">
            <span className="mb-1 block">Query-Parameter (key=value oder key: value)</span>
            <textarea
              className={`${inputClass} h-24 min-h-[6rem] w-full`}
              value={rawState.queryText}
              onChange={(event) => {
                setRawField("queryText", event.currentTarget.value);
                setRawField("selectedPreset", "");
              }}
              placeholder="z. B. token=... & state=green"
            />
          </label>
          <label className="block text-sm text-graphite">
            <span className="mb-1 block">{rawState.method === "GET" ? "Body nicht verfügbar" : "Body (JSON oder key=value)"} </span>
            <textarea
              className={`${inputClass} h-24 min-h-[6rem] w-full ${rawState.method === "GET" ? "opacity-60" : ""}`}
              value={rawState.bodyText}
              disabled={rawState.method === "GET"}
              onChange={(event) => {
                setRawField("bodyText", event.currentTarget.value);
                setRawField("selectedPreset", "");
              }}
              placeholder={rawState.contentType === "application/json" ? '{"ready":true,"state":"green"}' : "key=value"}
            />
          </label>
          {rawState.contentType === "multipart/form-data" ? (
            <label className="block text-sm text-graphite">
              <span className="mb-1 block">Datei</span>
              <input
                type="file"
                className="w-full rounded border border-line bg-surface p-2 text-sm text-ink"
                onChange={(event) => {
                  setRawUploadFile(event.currentTarget.files?.[0] || null);
                  setRawField("selectedPreset", "");
                }}
              />
            </label>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={rawResult?.status === "... läuft"}
              className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white transition hover:bg-redbrandHover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {rawResult?.status === "... läuft" ? "läuft..." : "Roh-Request ausführen"}
            </button>
            <Button type="button" variant="secondary" onClick={clearRawResult}>
              Ergebnis leeren
            </Button>
            <Button type="button" variant="secondary" onClick={() => resetRawState()} className="shrink-0">
              <RotateCcw className="h-4 w-4" /> Zurücksetzen
            </Button>
          </div>
        </form>
        {rawResult ? (
          <div className="mt-4 rounded border border-line bg-paper p-2 text-xs">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge tone={requestStatusTone(rawResult.status)}>{rawResult.status.startsWith("...") ? "..." : rawResult.status.split(" ")[0] || rawState.method}</Badge>
                <span>Antwort: {rawResult.status}</span>
              </div>
              <CopyLink value={rawResult.body} label="Antwort kopieren" />
            </div>
            {rawResult.requestUrl ? (
              <p className="mb-1 text-[11px] text-graphite">
                {rawState.method} {rawResult.requestUrl}
                {rawResult.durationMs ? ` · ${rawResult.durationMs} ms` : ""}
              </p>
            ) : null}
            {rawResult.requestBody ? (
              <p className="mb-1 text-[11px] text-graphite">
                Request-Payload: {rawResult.requestBody}
              </p>
            ) : null}
            {rawResult.requestContentType ? (
              <p className="mb-1 text-[11px] text-graphite">
                Content-Type: {rawResult.requestContentType}
              </p>
            ) : null}
            {rawResult.curl ? (
              <details className="mt-2 rounded border border-line bg-surface">
                <summary className="flex cursor-pointer list-none items-center gap-1 px-3 py-2 text-[11px] font-semibold [&::-webkit-details-marker]:hidden">
                  <CheckCircle2 className="h-3.5 w-3.5" /> cURL-Vorschlag
                </summary>
                <div className="space-y-2 p-3 pt-0">
                  <CopyLink value={rawResult.curl} label="curl kopieren" />
                  <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words text-[11px]">{rawResult.curl}</pre>
                </div>
              </details>
            ) : null}
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-[11px]">{rawResult.body || "—"}</pre>
          </div>
        ) : null}
      </section>

      <div className="space-y-4">
        {!filteredToolGroups.length ? (
          <p className="rounded-md border border-dashed border-line bg-paper p-3 text-sm text-graphite">Keine Tools für diese Suche gefunden.</p>
        ) : null}
        {filteredToolGroups.map(([group, tools]) => (
          <section key={group} className="rounded-md border border-line bg-paper p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">{group}</h3>
            <div className="space-y-3">
                  {tools.map((tool) => {
                    const result = results[tool.id] || initialResultForTool;
                    const supportedMethods = tool.methods && tool.methods.length > 0 ? tool.methods : [tool.method];
                    const selectedMethod = toolMethods[tool.id] || tool.method;
                    const isCapabilityTool = tool.source === "capability";
                    const capabilityPathParams = isCapabilityTool ? extractPathVariables(tool.path) : [];
                    const missingPathParams = isCapabilityTool
                      ? capabilityPathParams.filter((pathParam) => !state.dynamicPathParams[tool.id]?.[pathParam]?.trim())
                      : [];
                    const canRun = !result.running && !missingPathParams.length;
                    return (
                  <div key={tool.id} className="rounded-md border border-line bg-surface p-3">
                    <p className="mb-2 text-sm font-semibold text-ink">
                      {tool.title}
                      <span className="ml-2 inline-flex">
                        <Badge tone={selectedMethod === "GET" ? "green" : "neutral"}>
                          {selectedMethod}
                        </Badge>
                      </span>
                    </p>
                    <p className="mb-3 text-xs text-graphite">{tool.description}</p>
                    {isCapabilityTool ? (
                      <p className="mb-3 text-xs text-graphite">
                        Quelle: {tool.capability || "Externe API"} · {tool.action || "Request"}
                      </p>
                    ) : null}
                      {supportedMethods.length > 1 ? (
                        <div className="mb-3 flex items-center gap-2 text-xs text-graphite">
                          <label className="font-medium">Methode</label>
                          <select
                          className={selectClass}
                          value={selectedMethod}
                          onChange={(event) => setMethod(tool.id, event.currentTarget.value as RequestMethod)}
                        >
                          {supportedMethods.map((entry) => (
                            <option key={entry} value={entry}>
                              {entry}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    <form
                      onSubmit={(event) => {
                        void executeTool(tool.id, event);
                      }}
                      className="space-y-3"
                    >
                      {tool.id === "playReady" ? (
                        <>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="state">
                              <select
                                className={selectClass}
                                value={state.playReadyState}
                                onChange={(event) => setField("playReadyState", event.currentTarget.value)}
                              >
                                <option value="">Nur lesen</option>
                                <option value="green">green</option>
                                <option value="red">red</option>
                                <option value="toggle">toggle</option>
                              </select>
                            </Field>
                            <Field label="expiresMinutes (optional)">
                              <input
                                className={inputClass}
                                value={state.playReadyExpiresMinutes}
                                onChange={(event) => setField("playReadyExpiresMinutes", event.currentTarget.value)}
                                placeholder="z. B. 120"
                              />
                            </Field>
                            <Field label="oder Dauer: Stunden/Minuten">
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={12}
                                  className={inputClass}
                                  value={state.playReadyHours}
                                  onChange={(event) => setField("playReadyHours", event.currentTarget.value)}
                                  placeholder="h"
                                />
                                <input
                                  type="number"
                                  min={0}
                                  max={59}
                                  className={inputClass}
                                  value={state.playReadyMinutes}
                                  onChange={(event) => setField("playReadyMinutes", event.currentTarget.value)}
                                  placeholder="min"
                                />
                              </div>
                            </Field>
                          </div>
                        </>
                      ) : null}
                      {isCapabilityTool ? (
                        <div className="mb-2">
                          <button
                            type="button"
                            onClick={() => resetCapabilityInputs(tool.id)}
                            disabled={result.running}
                            className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Tool zurücksetzen
                          </button>
                        </div>
                      ) : null}

                      {tool.id === "trackerStart" ? (
                        <>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="trackerKey">
                              <input
                                required
                                className={inputClass}
                                value={state.trackerStartKey}
                                onChange={(event) => setField("trackerStartKey", event.currentTarget.value)}
                                placeholder="segufix"
                              />
                            </Field>
                            <Field label="Notiz">
                              <input
                                className={inputClass}
                                value={state.trackerStartNote}
                                onChange={(event) => setField("trackerStartNote", event.currentTarget.value)}
                                placeholder="Optional"
                              />
                            </Field>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="flex items-center gap-2 text-sm text-graphite">
                              <input
                                type="checkbox"
                                checked={state.trackerStartAllDay}
                                onChange={(event) => setField("trackerStartAllDay", event.currentTarget.checked)}
                              />
                              Ganzer Tag
                            </label>
                            <Field label="Startdatum">
                              <input
                                type="date"
                                className={inputClass}
                                value={state.trackerStartDate}
                                onChange={(event) => setField("trackerStartDate", event.currentTarget.value)}
                              />
                            </Field>
                          </div>
                          <Field label="Startzeit (optional)">
                            <input
                              type="datetime-local"
                              className={inputClass}
                              value={state.trackerStartDateTime}
                              onChange={(event) => setField("trackerStartDateTime", event.currentTarget.value)}
                            />
                          </Field>
                        </>
                      ) : null}

                      {tool.id === "trackerStop" ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="trackerKey">
                            <input
                              required
                              className={inputClass}
                              value={state.trackerStopKey}
                              onChange={(event) => setField("trackerStopKey", event.currentTarget.value)}
                              placeholder="segufix"
                            />
                          </Field>
                          <Field label="Notiz">
                            <input
                              className={inputClass}
                              value={state.trackerStopNote}
                              onChange={(event) => setField("trackerStopNote", event.currentTarget.value)}
                              placeholder="Optional"
                            />
                          </Field>
                        </div>
                      ) : null}

                      {tool.id === "invites" ? (
                        <>
                          <Field label="Modus">
                            <select
                              className={selectClass}
                              value={state.invitesMode}
                              onChange={(event) => setField("invitesMode", event.currentTarget.value as "usage" | "create")}
                            >
                              <option value="usage">Usage prüfen</option>
                              <option value="create">Einladung erzeugen</option>
                            </select>
                          </Field>
                          {state.invitesMode === "create" ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Field label="Name (optional)">
                                <input
                                  className={inputClass}
                                  value={state.invitesName}
                                  onChange={(event) => setField("invitesName", event.currentTarget.value)}
                                />
                              </Field>
                              <Field label="E-Mail (optional)">
                                <input
                                  type="email"
                                  className={inputClass}
                                  value={state.invitesEmail}
                                  onChange={(event) => setField("invitesEmail", event.currentTarget.value)}
                                />
                              </Field>
                              <label className="flex items-center gap-2 text-sm text-graphite">
                                <input
                                  type="checkbox"
                                  checked={state.invitesSendEmail}
                                  onChange={(event) => setField("invitesSendEmail", event.currentTarget.checked)}
                                />
                                E-Mail direkt senden
                              </label>
                              <Field label="BCC (optional)">
                                <input
                                  className={inputClass}
                                  value={state.invitesBcc}
                                  onChange={(event) => setField("invitesBcc", event.currentTarget.value)}
                                />
                              </Field>
                            </div>
                          ) : null}
                        </>
                      ) : null}

                      {tool.id === "mediaFeed" ? (
                        <>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="q (Suchbegriff)">
                              <input
                                className={inputClass}
                                value={state.mediaQ}
                                onChange={(event) => setField("mediaQ", event.currentTarget.value)}
                                placeholder="optional"
                              />
                            </Field>
                            <Field label="kind">
                              <select
                                className={selectClass}
                                value={state.mediaKind}
                                onChange={(event) => setField("mediaKind", event.currentTarget.value)}
                              >
                                <option value="ALL">ALLE</option>
                                <option value="IMAGE">Bilder</option>
                                <option value="VIDEO">Videos</option>
                              </select>
                            </Field>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-3">
                            <Field label="cursor">
                              <input
                                className={inputClass}
                                value={state.mediaCursor}
                                onChange={(event) => setField("mediaCursor", event.currentTarget.value)}
                              />
                            </Field>
                            <Field label="albumId">
                              <input
                                className={inputClass}
                                value={state.mediaAlbumId}
                                onChange={(event) => setField("mediaAlbumId", event.currentTarget.value)}
                              />
                            </Field>
                            <Field label="limit">
                              <input
                                type="number"
                                className={inputClass}
                                value={state.mediaLimit}
                                onChange={(event) => setField("mediaLimit", event.currentTarget.value)}
                                min={1}
                                max={100}
                              />
                            </Field>
                          </div>
                          <label className="flex items-center gap-2 text-sm text-graphite">
                            <input
                              type="checkbox"
                              checked={state.mediaIncludeAlbums}
                              onChange={(event) => setField("mediaIncludeAlbums", event.currentTarget.checked)}
                            />
                            includeAlbums (default: an)
                          </label>
                        </>
                      ) : null}

                      {tool.id === "imagesFeed" ? (
                        <div className="grid gap-3 sm:grid-cols-3">
                          <Field label="source">
                            <select
                              className={selectClass}
                              value={state.imagesSource}
                              onChange={(event) => setField("imagesSource", event.currentTarget.value)}
                            >
                              <option value="all">all</option>
                              <option value="media">media</option>
                              <option value="toys">toys</option>
                              <option value="positions">positions</option>
                              <option value="ideas">ideas</option>
                              <option value="bondageSystem">bondageSystem</option>
                              <option value="profiles">profiles</option>
                            </select>
                          </Field>
                          <Field label="q">
                            <input
                              className={inputClass}
                              value={state.imagesQ}
                              onChange={(event) => setField("imagesQ", event.currentTarget.value)}
                              placeholder="optional"
                            />
                          </Field>
                          <Field label="limit">
                            <input
                              type="number"
                              className={inputClass}
                              value={state.imagesLimit}
                              onChange={(event) => setField("imagesLimit", event.currentTarget.value)}
                              min={1}
                              max={200}
                            />
                          </Field>
                        </div>
                      ) : null}

                      {tool.id === "trackersQuota" ? (
                        <Field label="trackerKey (optional)">
                          <input
                            className={inputClass}
                            value={state.trackerQuotaTracker}
                            onChange={(event) => setField("trackerQuotaTracker", event.currentTarget.value)}
                            placeholder="z. B. segufix"
                          />
                        </Field>
                      ) : null}

                      {tool.id === "fileDownload" ? (
                        <Field label="fileId">
                          <input
                            required
                            className={inputClass}
                            value={state.fileId}
                            onChange={(event) => setField("fileId", event.currentTarget.value)}
                            placeholder="Datei-ID"
                          />
                        </Field>
                      ) : null}

                      {tool.id === "mediaUpload" ? (
                        <>
                          <Field label="Titel (optional)">
                            <input
                              className={inputClass}
                              value={state.mediaUploadTitle}
                              onChange={(event) => setField("mediaUploadTitle", event.currentTarget.value)}
                            />
                          </Field>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Sichtbarkeit">
                              <select
                                className={selectClass}
                                value={state.mediaUploadVisibility}
                                onChange={(event) => setField("mediaUploadVisibility", event.currentTarget.value)}
                              >
                                <option value="PRIVATE">Privat</option>
                                <option value="PARTNER">Zirkel</option>
                                <option value="SHARED">Geteilt</option>
                              </select>
                            </Field>
                            <Field label="albumId (optional)">
                              <input
                                className={inputClass}
                                value={state.mediaUploadAlbumId}
                                onChange={(event) => setField("mediaUploadAlbumId", event.currentTarget.value)}
                              />
                            </Field>
                          </div>
                          <label className="block text-sm text-graphite">
                            <span className="mb-1 block">Datei</span>
                            <input
                              type="file"
                              accept="image/*,video/*"
                              className="w-full rounded border border-line bg-surface p-2 text-sm text-ink"
                              onChange={(event) => setField("mediaUploadFile", event.currentTarget.files?.[0] || null)}
                            />
                          </label>
                        </>
                      ) : null}

                          {isCapabilityTool ? (
                            <>
                              {capabilityPathParams.length ? (
                                <div className="grid gap-3 sm:grid-cols-2">
                                  {capabilityPathParams.map((pathParam) => (
                                    <Field key={pathParam} label={`${pathParam} (Pfad)`}>
                                      <input
                                        className={inputClass}
                                        value={state.dynamicPathParams[tool.id]?.[pathParam] || ""}
                                        onChange={(event) => setPathParam(tool.id, pathParam, event.currentTarget.value)}
                                        placeholder={`Wert für ${pathParam}`}
                                        required
                                      />
                                    </Field>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-graphite">Keine Pflicht-Pfadparameter im Endpoint.</p>
                              )}
                              {missingPathParams.length ? (
                                <p className="text-xs text-redbrand">
                                  Es fehlen {missingPathParams.length} Pflichtwert{missingPathParams.length === 1 ? "" : "e"}:
                                  {" "}
                                  {missingPathParams.join(", ")}
                                </p>
                              ) : null}
                              {selectedMethod === "GET" ? (
                                <label className="block text-sm text-graphite">
                                  <span className="mb-1 block">Query-Parameter</span>
                                  <textarea
                                    className={`${inputClass} h-24 min-h-[6rem] w-full`}
                                    value={state.dynamicQueryText[tool.id] || queryTemplateByToolId[tool.id] || ""}
                                    onChange={(event) => setQueryText(tool.id, event.currentTarget.value)}
                                    placeholder="z. B. key=value oder key1=value1&key2=value2"
                                  />
                                </label>
                          ) : (
                            <label className="block text-sm text-graphite">
                              <span className="mb-1 block">Body (JSON oder key=value)</span>
                              <textarea
                                className={`${inputClass} h-24 min-h-[6rem] w-full`}
                                value={state.dynamicBodyText[tool.id] || ""}
                                onChange={(event) => setBodyText(tool.id, event.currentTarget.value)}
                                placeholder='z. B. {"key":"value"} oder note=Hallo&name=Max'
                              />
                            </label>
                          )}
                        </>
                      ) : null}

                      <button
                        type="submit"
                        disabled={!canRun}
                        className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white transition hover:bg-redbrandHover disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {result.running ? "läuft..." : `Ausführen (${selectedMethod})`}
                      </button>
                    </form>

                    {result.status ? (
                      <div className="mt-3 rounded border border-line bg-paper p-2 text-xs">
                        <div className="mb-2 flex items-center justify-between gap-2 font-medium text-ink">
                          <div className="flex items-center gap-2">
                            <Badge tone={requestStatusTone(result.status)}>{toolMethods[tool.id] || tool.method}</Badge>
                            <span>Antwort: {result.status}</span>
                          </div>
                          <CopyLink value={result.body} label="Antwort kopieren" />
                        </div>
                        {result.requestUrl ? (
                          <p className="mb-1 text-[11px] text-graphite">
                            {toolMethods[tool.id] || tool.method} {result.requestUrl}
                            {result.durationMs ? ` · ${result.durationMs} ms` : ""}
                          </p>
                        ) : null}
                        {result.requestBody ? (
                          <p className="mb-1 text-[11px] text-graphite">
                            Request-Payload: {result.requestBody}
                          </p>
                        ) : null}
                        {result.curl ? (
                          <details className="mt-2 rounded border border-line bg-surface">
                            <summary className="flex cursor-pointer list-none items-center gap-1 px-3 py-2 text-[11px] font-semibold [&::-webkit-details-marker]:hidden">
                              <FileDown className="h-3.5 w-3.5" /> cURL-Vorschlag
                            </summary>
                            <div className="space-y-2 p-3 pt-0">
                              <CopyLink value={result.curl} label="curl kopieren" />
                              <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words text-[11px]">{result.curl}</pre>
                            </div>
                          </details>
                        ) : null}
                        {result.openUrl ? (
                          <a
                            href={result.openUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mb-2 inline-flex min-h-8 items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-graphite hover:bg-paper hover:text-redbrand"
                          >
                            Datei öffnen
                          </a>
                        ) : null}
                        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-[11px]">{result.body || "—"}</pre>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
