import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { encryptSecret } from "@/lib/crypto";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";
import { initialNextRun } from "@/lib/scheduled-rules";
import {
  findTrackerQuotaDeliveryRule,
  renderTrackerQuotaText,
  serializeTrackerQuotaDeliveryRule,
  TRACKER_QUOTA_TEXT_ACTION,
  trackerQuotaDeliveryHeaderName,
  validateTrackerQuotaDeliveryUrl
} from "@/lib/tracker-quota-deliveries";
import { trackerQuotaStatusForUser } from "@/lib/tracker-quotas";

export const runtime = "nodejs";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function timezoneValue(value: unknown) {
  const timezone = stringValue(value, "Europe/Berlin");
  try {
    new Intl.DateTimeFormat("de-DE", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return "Europe/Berlin";
  }
}

function scheduleValues(body: Record<string, unknown>) {
  const scheduleType = ["DAILY", "WEEKLY", "MONTHLY", "INTERVAL"].includes(stringValue(body.scheduleType).toUpperCase())
    ? stringValue(body.scheduleType).toUpperCase()
    : "DAILY";
  const daysOfWeek = Array.isArray(body.daysOfWeek)
    ? Array.from(new Set(body.daysOfWeek.map((value) => numberValue(value, -1)).filter((value) => value >= 0 && value <= 6))).sort()
    : [];
  return {
    scheduleType,
    timeOfDayMinutes: Math.min(1439, Math.max(0, numberValue(body.timeOfDayMinutes, 960))),
    daysOfWeek,
    dayOfMonth: Math.min(31, Math.max(1, numberValue(body.dayOfMonth, 1))),
    intervalMinutes: Math.min(525_600, Math.max(15, numberValue(body.intervalMinutes, 1440))),
    timezone: timezoneValue(body.timezone)
  };
}

async function context(request: NextRequest, trackerKey: string) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return { ok: false as const, response: auth.response };
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers", `tracker.${trackerKey}`);
  if (blocked) return { ok: false as const, response: blocked };
  if (!auth.user.tenantId) return { ok: false as const, response: NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 }) };
  const quota = (await trackerQuotaStatusForUser(auth.user)).find((entry) => entry.tracker.key === trackerKey);
  if (!quota) return { ok: false as const, response: NextResponse.json({ ok: false, error: "tracker_not_found" }, { status: 404 }) };
  return { ok: true as const, auth, quota, tenantId: auth.user.tenantId };
}

export async function GET(request: NextRequest, props: { params: Promise<{ trackerKey: string }> }) {
  const { trackerKey } = await props.params;
  const resolved = await context(request, trackerKey);
  if (!resolved.ok) return resolved.response;
  const rule = await findTrackerQuotaDeliveryRule(resolved.auth.user.id, resolved.tenantId, trackerKey);
  const item = serializeTrackerQuotaDeliveryRule(rule);
  const preview = item?.template ? renderTrackerQuotaText(item.template, resolved.quota, new Date(), item.timezone) : null;
  return NextResponse.json({ ok: true, item, preview });
}

async function save(request: NextRequest, trackerKey: string) {
  const resolved = await context(request, trackerKey);
  if (!resolved.ok) return resolved.response;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const template = typeof body.template === "string" ? body.template : "";
  if (!template.trim() || template.length > 8000) {
    return NextResponse.json({ ok: false, error: "template_required_or_too_long" }, { status: 422 });
  }
  const targetUrl = stringValue(body.url);
  try {
    await validateTrackerQuotaDeliveryUrl(targetUrl);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "target_url_invalid" }, { status: 422 });
  }

  const method = stringValue(body.method, "POST").toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH"].includes(method)) {
    return NextResponse.json({ ok: false, error: "method_not_allowed" }, { status: 422 });
  }
  const requestedFormat = stringValue(body.format, "TEXT").toUpperCase();
  const format = method === "GET" ? "QUERY" : requestedFormat;
  if (!["TEXT", "JSON", "QUERY"].includes(format)) {
    return NextResponse.json({ ok: false, error: "format_not_allowed" }, { status: 422 });
  }
  const fieldName = stringValue(body.fieldName, "text") || "text";
  if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/.test(fieldName)) {
    return NextResponse.json({ ok: false, error: "field_name_invalid" }, { status: 422 });
  }
  const authType = ["NONE", "BEARER", "HEADER"].includes(stringValue(body.authType, "NONE").toUpperCase())
    ? stringValue(body.authType, "NONE").toUpperCase()
    : "NONE";
  const headerName = stringValue(body.headerName, "X-API-Key") || "X-API-Key";
  if (authType === "HEADER" && !trackerQuotaDeliveryHeaderName(headerName)) {
    return NextResponse.json({ ok: false, error: "header_name_invalid" }, { status: 422 });
  }

  const current = await findTrackerQuotaDeliveryRule(resolved.auth.user.id, resolved.tenantId, trackerKey);
  const currentAction = asRecord(current?.actionJson);
  const providedSecret = typeof body.authSecret === "string" ? body.authSecret.trim() : "";
  const authSecretEnc = authType === "NONE"
    ? null
    : providedSecret
      ? encryptSecret(providedSecret)
      : typeof currentAction.authSecretEnc === "string" ? currentAction.authSecretEnc : null;
  if (authType !== "NONE" && !authSecretEnc) {
    return NextResponse.json({ ok: false, error: "auth_secret_required" }, { status: 422 });
  }

  const schedule = scheduleValues(body);
  const active = body.active !== false;
  const sendCondition = stringValue(body.sendCondition, "ALWAYS").toUpperCase();
  const conditionType = sendCondition === "OPEN" ? "TRACKER_QUOTA_OPEN" : sendCondition === "DONE" ? "TRACKER_QUOTA_DONE" : "ALWAYS";
  const actionJson = {
    kind: "playtracker_quota_text",
    trackerKey,
    template,
    url: targetUrl,
    method,
    format,
    fieldName,
    authType,
    headerName,
    authSecretEnc: authSecretEnc || ""
  } as Prisma.InputJsonObject;
  const data = {
    name: `PlayTracker API-Text: ${resolved.quota.tracker.title}`,
    active,
    ...schedule,
    conditionType,
    conditionJson: { trackerKey } as Prisma.InputJsonObject,
    actionType: TRACKER_QUOTA_TEXT_ACTION,
    actionJson,
    nextRunAt: active ? initialNextRun(schedule) : null
  };
  const rule = current
    ? await prisma.scheduledRule.update({ where: { id: current.id }, data })
    : await prisma.scheduledRule.create({ data: { tenantId: resolved.tenantId, ownerId: resolved.auth.user.id, ...data } });
  return NextResponse.json({ ok: true, item: serializeTrackerQuotaDeliveryRule(rule) });
}

export async function PUT(request: NextRequest, props: { params: Promise<{ trackerKey: string }> }) {
  const { trackerKey } = await props.params;
  return save(request, trackerKey);
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ trackerKey: string }> }) {
  const { trackerKey } = await props.params;
  return save(request, trackerKey);
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ trackerKey: string }> }) {
  const { trackerKey } = await props.params;
  const resolved = await context(request, trackerKey);
  if (!resolved.ok) return resolved.response;
  const rules = await prisma.scheduledRule.findMany({
    where: { ownerId: resolved.auth.user.id, tenantId: resolved.tenantId, actionType: TRACKER_QUOTA_TEXT_ACTION }
  });
  const ids = rules.filter((rule) => asRecord(rule.actionJson).trackerKey === trackerKey).map((rule) => rule.id);
  if (ids.length) await prisma.scheduledRule.deleteMany({ where: { id: { in: ids } } });
  return NextResponse.json({ ok: true });
}
