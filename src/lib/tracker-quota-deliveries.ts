import type { ScheduledRule } from "@prisma/client";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { trackerQuotaStatusForUser } from "@/lib/tracker-quotas";

export const TRACKER_QUOTA_TEXT_ACTION = "TRACKER_QUOTA_TEXT";

type QuotaStatus = Awaited<ReturnType<typeof trackerQuotaStatusForUser>>[number];
type DeliveryOwner = { id: string; tenantId?: string | null };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function sentenceDuration(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  const parts = [];
  if (hours > 0) parts.push(hours === 1 ? "1 Stunde" : `${hours} Stunden`);
  if (remainder > 0) parts.push(remainder === 1 ? "1 Minute" : `${remainder} Minuten`);
  return parts.length ? parts.join(" und ") : "0 Minuten";
}

function durationStatus(progress: QuotaStatus["daily"]) {
  return progress.complete ? "Kontingent erreicht" : `Noch ${sentenceDuration(progress.remaining)} zu tun`;
}

function dayStatus(progress: QuotaStatus["monthlyDays"]) {
  if (progress.complete) return "Ziel erreicht";
  return progress.remaining === 1 ? "Noch 1 aktiver Tag" : `Noch ${progress.remaining} aktive Tage`;
}

function durationVariables(prefix: string, progress: QuotaStatus["daily"]) {
  return {
    [prefix]: durationStatus(progress),
    [`${prefix}_erfasst`]: sentenceDuration(progress.done),
    [`${prefix}_ziel`]: sentenceDuration(progress.required),
    [`${prefix}_offen`]: sentenceDuration(progress.remaining),
    [`${prefix}_erfasst_minuten`]: String(progress.done),
    [`${prefix}_ziel_minuten`]: String(progress.required),
    [`${prefix}_offen_minuten`]: String(progress.remaining)
  };
}

export function trackerQuotaTextVariables(status: QuotaStatus, now = new Date(), timezone = "Europe/Berlin") {
  const formattedDate = new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeZone: timezone }).format(now);
  return {
    tracker: status.tracker.title,
    datum: formattedDate,
    ...durationVariables("heute", status.daily),
    ...durationVariables("woche", status.weekly),
    ...durationVariables("monat", status.monthlyMinutes),
    aktive_tage: dayStatus(status.monthlyDays),
    aktive_tage_erreicht: String(status.monthlyDays.done),
    aktive_tage_ziel: String(status.monthlyDays.required),
    aktive_tage_offen: String(status.monthlyDays.remaining)
  };
}

export function renderTrackerQuotaText(template: string, status: QuotaStatus, now = new Date(), timezone = "Europe/Berlin") {
  const variables = trackerQuotaTextVariables(status, now, timezone);
  return Object.entries(variables).reduce(
    (output, [key, value]) => output.replaceAll(`{{${key}}}`, value),
    template
  );
}

function blockedIPv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224;
}

function blockedAddress(address: string) {
  const normalized = address.toLowerCase();
  if (isIP(normalized) === 4) return blockedIPv4(normalized);
  if (isIP(normalized) !== 6) return true;
  if (normalized.startsWith("::ffff:")) return blockedIPv4(normalized.slice("::ffff:".length));
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") ||
    normalized.startsWith("fd") || /^fe[89ab]/.test(normalized) || normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:");
}

export async function validateTrackerQuotaDeliveryUrl(raw: string) {
  if (raw.length > 2048) throw new Error("target_url_too_long");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("target_url_invalid");
  }
  if (url.protocol !== "https:") throw new Error("target_url_requires_https");
  if (url.username || url.password) throw new Error("target_url_credentials_forbidden");
  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("target_url_private_host");
  }
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true }).catch(() => []);
  if (!addresses.length || addresses.some((entry) => blockedAddress(entry.address))) throw new Error("target_url_private_host");
  return url;
}

export function trackerQuotaDeliveryHeaderName(value: string) {
  const name = value.trim();
  const blocked = new Set(["host", "content-length", "cookie", "set-cookie", "connection", "transfer-encoding"]);
  if (!/^[A-Za-z0-9-]{1,64}$/.test(name) || blocked.has(name.toLowerCase())) return "";
  return name;
}

export async function findTrackerQuotaDeliveryRule(ownerId: string, tenantId: string, trackerKey: string) {
  const rules = await prisma.scheduledRule.findMany({
    where: { ownerId, tenantId, actionType: TRACKER_QUOTA_TEXT_ACTION },
    orderBy: { updatedAt: "desc" }
  });
  return rules.find((rule) => stringValue(asRecord(rule.actionJson).trackerKey) === trackerKey) || null;
}

export function serializeTrackerQuotaDeliveryRule(rule: ScheduledRule | null) {
  if (!rule) return null;
  const action = asRecord(rule.actionJson);
  return {
    id: rule.id,
    active: rule.active,
    scheduleType: rule.scheduleType,
    timeOfDayMinutes: rule.timeOfDayMinutes,
    daysOfWeek: rule.daysOfWeek,
    dayOfMonth: rule.dayOfMonth,
    intervalMinutes: rule.intervalMinutes,
    timezone: rule.timezone,
    sendCondition: rule.conditionType === "TRACKER_QUOTA_OPEN" ? "OPEN" : rule.conditionType === "TRACKER_QUOTA_DONE" ? "DONE" : "ALWAYS",
    template: stringValue(action.template),
    url: stringValue(action.url),
    method: stringValue(action.method, "POST"),
    format: stringValue(action.format, "TEXT"),
    fieldName: stringValue(action.fieldName, "text"),
    authType: stringValue(action.authType, "NONE"),
    headerName: stringValue(action.headerName, "X-API-Key"),
    secretConfigured: Boolean(stringValue(action.authSecretEnc)),
    nextRunAt: rule.nextRunAt,
    lastRunAt: rule.lastRunAt,
    lastStatus: rule.lastStatus,
    lastMessage: rule.lastMessage
  };
}

export async function dispatchTrackerQuotaTextRule(rule: ScheduledRule, owner: DeliveryOwner, now = new Date()) {
  const action = asRecord(rule.actionJson);
  const trackerKey = stringValue(action.trackerKey);
  const status = (await trackerQuotaStatusForUser(owner, now)).find((entry) => entry.tracker.key === trackerKey);
  if (!status) return { status: "FAILED", message: "Tracker nicht gefunden", details: { trackerKey } };

  const template = stringValue(action.template).slice(0, 8000);
  const rendered = renderTrackerQuotaText(template, status, now, rule.timezone || "Europe/Berlin");
  const method = stringValue(action.method, "POST").toUpperCase();
  const format = stringValue(action.format, "TEXT").toUpperCase();
  const fieldName = stringValue(action.fieldName, "text").trim() || "text";
  if (!new Set(["GET", "POST", "PUT", "PATCH"]).has(method)) {
    return { status: "FAILED", message: "HTTP-Methode nicht erlaubt", details: { trackerKey } };
  }
  if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/.test(fieldName)) {
    return { status: "FAILED", message: "Feldname ungültig", details: { trackerKey } };
  }

  let target: URL;
  try {
    target = await validateTrackerQuotaDeliveryUrl(stringValue(action.url));
  } catch (error) {
    return { status: "FAILED", message: error instanceof Error ? error.message : "Zieladresse ungültig", details: { trackerKey } };
  }

  const headers: Record<string, string> = { Accept: "application/json, text/plain;q=0.9, */*;q=0.8" };
  const authType = stringValue(action.authType, "NONE").toUpperCase();
  const authSecret = decryptSecret(stringValue(action.authSecretEnc));
  if (authType === "BEARER" && authSecret) headers.Authorization = `Bearer ${authSecret}`;
  if (authType === "HEADER" && authSecret) {
    const headerName = trackerQuotaDeliveryHeaderName(stringValue(action.headerName, "X-API-Key"));
    if (!headerName) return { status: "FAILED", message: "Headername ungültig", details: { trackerKey } };
    headers[headerName] = authSecret;
  }

  let body: string | undefined;
  if (method === "GET" || format === "QUERY") {
    target.searchParams.set(fieldName, rendered);
  } else if (format === "JSON") {
    headers["Content-Type"] = "application/json; charset=utf-8";
    body = JSON.stringify({ [fieldName]: rendered });
  } else {
    headers["Content-Type"] = "text/plain; charset=utf-8";
    body = rendered;
  }

  try {
    const response = await fetch(target, {
      method,
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(10_000)
    });
    const details = { trackerKey, targetHost: target.host, method, statusCode: response.status, characters: rendered.length };
    if (response.ok) return { status: "SENT", message: `HTTP ${response.status}`, details };
    return { status: "FAILED", message: `HTTP ${response.status}`, details };
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError" ? "Zeitüberschreitung" : "Ziel nicht erreichbar";
    return { status: "FAILED", message, details: { trackerKey, targetHost: target.host, method } };
  }
}
