import { sign } from "crypto";
import { connect } from "http2";
import type { AuditLog, NativePushDevice } from "@prisma/client";
import { decryptSecret } from "@/lib/crypto";
import { actionLabel } from "@/lib/notification-actions";
import { prisma } from "@/lib/prisma";

type AuditForPush = Pick<AuditLog, "id" | "actorId" | "action" | "title" | "href" | "entityType" | "entityId" | "details">;
type PushConfig = {
  teamId: string;
  keyId: string;
  bundleId: string;
  privateKey: string;
};
type TestPushInput = {
  tenantId: string;
  actorId: string;
  targetUserIds: string[];
  title?: string;
  body?: string;
};
type ApnsResponse = {
  ok: boolean;
  status: number;
  apnsId: string | null;
  body: string | null;
};
type NativePushTarget = {
  screen: string;
  id: string | null;
  href: string | null;
};

const pushableActions = new Set([
  "event_created",
  "event_updated",
  "event_deleted",
  "event_checkin_created"
]);

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function apnsHost(environment: string) {
  return environment === "sandbox" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
}

function apnsJwt(config: PushConfig) {
  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = base64url(JSON.stringify({ iss: config.teamId, iat: Math.floor(Date.now() / 1000) }));
  const data = `${header}.${claims}`;
  const signature = sign("sha256", Buffer.from(data), {
    key: config.privateKey,
    dsaEncoding: "ieee-p1363"
  });
  return `${data}.${base64url(signature)}`;
}

function tenantIdFromDetails(audit: AuditForPush) {
  const details = audit.details && typeof audit.details === "object" && !Array.isArray(audit.details)
    ? audit.details as Record<string, unknown>
    : {};
  const tenantId = details.tenantId;
  return typeof tenantId === "string" && tenantId ? tenantId : null;
}

function auditDetails(audit: AuditForPush) {
  return audit.details && typeof audit.details === "object" && !Array.isArray(audit.details)
    ? audit.details as Record<string, unknown>
    : {};
}

function stringDetail(details: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = details[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function targetScreenForAudit(audit: AuditForPush) {
  const details = auditDetails(audit);
  const explicit = stringDetail(details, ["targetScreen", "screen", "nativeScreen"]);
  if (explicit) return explicit;
  if (audit.href) {
    if (audit.href.startsWith("/settings/push")) return "setup";
    if (audit.href.startsWith("/settings")) return "setup";
    if (audit.href.startsWith("/media")) return "media";
    if (audit.href.startsWith("/toys")) return "toys";
    if (audit.href.startsWith("/positions")) return "positions";
    if (audit.href.startsWith("/ideas")) return "ideas";
    if (audit.href.startsWith("/orders")) return "orders";
    if (audit.href.startsWith("/sessions")) return "trackers";
    if (audit.href.startsWith("/activities")) return "activities";
  }
  const entityType = (audit.entityType || "").toLowerCase();
  if (["media", "album", "image"].includes(entityType)) return "media";
  if (["toy", "shopifyproduct", "bondageproduct"].includes(entityType)) return "toys";
  if (["position", "scene"].includes(entityType)) return "positions";
  if (["idea"].includes(entityType)) return "ideas";
  if (["selfbondageorder", "order"].includes(entityType)) return "orders";
  if (["trackerentry", "trackertype", "session"].includes(entityType)) return "trackers";
  if (["activity", "event"].includes(entityType)) return "activities";
  if (audit.action.startsWith("play_ready_")) return "dashboard";
  return "dashboard";
}

function targetForAudit(audit: AuditForPush): NativePushTarget {
  const details = auditDetails(audit);
  return {
    screen: targetScreenForAudit(audit),
    id: stringDetail(details, ["targetId", "nativeId", "id"]) || audit.entityId || null,
    href: audit.href || null
  };
}

function pushTypeForAction(action: string) {
  if (action.startsWith("telegram_")) return "telegram";
  if (action.startsWith("email_")) return "email";
  if (action.startsWith("media_") || action.startsWith("album_")) return "media";
  if (action.startsWith("idea_")) return "idea";
  if (action.startsWith("self_bondage_order_")) return "order";
  if (action.startsWith("tracker_")) return "tracker";
  if (action.startsWith("play_ready_")) return "play_ready";
  if (action.startsWith("activity_") || action.startsWith("event_")) return "activity";
  if (action.includes("favorited")) return "favorite";
  return action;
}

function soundForAction(action: string) {
  if (action.includes("failed")) return "playplaner_alert.caf";
  if (action.includes("liked") || action.includes("favorited")) return "playplaner_spark.caf";
  if (action.startsWith("play_ready_")) return "playplaner_ping.caf";
  if (action.startsWith("self_bondage_order_") || action.startsWith("activity_") || action.startsWith("event_")) return "playplaner_pulse.caf";
  return "playplaner_chime.caf";
}

function imageUrlForAudit(audit: AuditForPush) {
  const details = auditDetails(audit);
  return stringDetail(details, [
    "imageUrl",
    "image",
    "thumbnailUrl",
    "coverImageUrl",
    "mediaUrl",
    "photoUrl"
  ]);
}

async function targetUserIds(audit: AuditForPush) {
  const tenantId = tenantIdFromDetails(audit);
  if (tenantId) {
    const memberships = await prisma.tenantMembership.findMany({
      where: { tenantId, active: true, user: { active: true } },
      select: { userId: true }
    });
    return memberships.map((membership) => membership.userId);
  }
  if (audit.actorId) return [audit.actorId];
  return [];
}

async function tenantIdForAudit(audit: AuditForPush) {
  const tenantId = tenantIdFromDetails(audit);
  if (tenantId) return tenantId;
  if (!audit.actorId) return null;
  const actor = await prisma.user.findUnique({ where: { id: audit.actorId }, select: { tenantId: true } });
  return actor?.tenantId || null;
}

async function pushConfigForTenant(tenantId: string): Promise<PushConfig | null> {
  const settings = await prisma.nativePushSettings.findUnique({ where: { tenantId } });
  if (!settings?.enabled || !settings.teamId || !settings.keyId || !settings.bundleId || !settings.privateKeyEnc) return null;
  const privateKey = decryptSecret(settings.privateKeyEnc).replace(/\\n/g, "\n");
  if (!privateKey) return null;
  return {
    teamId: settings.teamId,
    keyId: settings.keyId,
    bundleId: settings.bundleId,
    privateKey
  };
}

function payloadForAudit(audit: AuditForPush) {
  const target = targetForAudit(audit);
  const sound = soundForAction(audit.action);
  return {
    aps: {
      alert: {
        title: actionLabel(audit.action),
        body: audit.title
      },
      sound
    },
    type: pushTypeForAction(audit.action),
    target,
    auditId: audit.id,
    eventId: audit.entityType === "event" || audit.action.startsWith("event_") ? audit.entityId : null,
    threadId: stringDetail(auditDetails(audit), ["threadId", "telegramThreadId", "messageThreadId"]),
    imageUrl: imageUrlForAudit(audit),
    sound,
    action: audit.action,
    entityType: audit.entityType,
    entityId: audit.entityId,
    href: audit.href
  };
}

function payloadForTest(input: Required<Pick<TestPushInput, "title" | "body">> & Pick<TestPushInput, "tenantId" | "actorId">) {
  const sound = "playplaner_chime.caf";
  return {
    aps: {
      alert: {
        title: input.title,
        body: input.body
      },
      sound
    },
    type: "test",
    target: {
      screen: "setup",
      id: input.tenantId,
      href: "/settings/push"
    },
    eventId: null,
    threadId: null,
    imageUrl: null,
    sound,
    action: "native_push_test",
    entityType: "tenant",
    entityId: input.tenantId,
    href: "/settings/push",
    actorId: input.actorId
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unbekannter Fehler");
}

function readableApnsError(raw: string | null) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { reason?: string };
    if (parsed.reason) return `APNs-Fehler: ${parsed.reason}`;
  } catch {
    // APNs usually returns JSON, but keep raw transport text if it does not.
  }
  return raw;
}

async function writeFailedDelivery(
  device: NativePushDevice,
  delivery: { auditId?: string | null; action: string },
  message: string,
  statusCode?: number | null,
  apnsId?: string | null
) {
  await prisma.nativePushDelivery.create({
    data: {
      tenantId: device.tenantId,
      userId: device.userId,
      deviceId: device.id,
      auditId: delivery.auditId,
      action: delivery.action,
      status: "FAILED",
      apnsId: apnsId || null,
      statusCode: statusCode || null,
      error: message.slice(0, 1000)
    }
  });
}

async function writeFailedDeliveries(
  devices: NativePushDevice[],
  delivery: { auditId?: string | null; action: string },
  message: string
) {
  await Promise.allSettled(devices.map((device) => writeFailedDelivery(device, delivery, message)));
}

function headerValue(value: string | string[] | number | undefined) {
  if (Array.isArray(value)) return value[0] || null;
  if (value === undefined) return null;
  return String(value);
}

function sendApnsHttp2(input: { environment: string; deviceToken: string; authorization: string; bundleId: string; payload: unknown }) {
  return new Promise<ApnsResponse>((resolve, reject) => {
    const client = connect(apnsHost(input.environment));
    const chunks: Buffer[] = [];
    let settled = false;

    function finish(error?: Error, result?: ApnsResponse) {
      if (settled) return;
      settled = true;
      client.close();
      if (error) reject(error);
      else if (result) resolve(result);
      else reject(new Error("APNs-Verbindung ohne Ergebnis beendet"));
    }

    client.once("error", (error) => finish(error));

    const request = client.request({
      ":method": "POST",
      ":path": `/3/device/${input.deviceToken}`,
      authorization: input.authorization,
      "apns-topic": input.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json"
    });

    let status = 0;
    let apnsId: string | null = null;

    request.setEncoding("utf8");
    request.once("response", (headers) => {
      status = Number(headers[":status"] || 0);
      apnsId = headerValue(headers["apns-id"]);
    });
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.once("error", (error) => finish(error));
    request.once("end", () => {
      const body = Buffer.concat(chunks).toString("utf8").trim();
      finish(undefined, {
        ok: status >= 200 && status < 300,
        status,
        apnsId,
        body: body || null
      });
    });
    request.end(JSON.stringify(input.payload));
  });
}

async function sendToDevice(
  device: NativePushDevice,
  delivery: { auditId?: string | null; action: string; payload: unknown },
  config: PushConfig,
  authorization: string
) {
  try {
    const response = await sendApnsHttp2({
      environment: device.environment,
      deviceToken: device.deviceToken,
      authorization,
      bundleId: config.bundleId,
      payload: delivery.payload
    });
    const rawError = response.ok ? null : response.body?.slice(0, 1000) || null;
    const errorText = readableApnsError(rawError);
    await prisma.nativePushDelivery.create({
      data: {
        tenantId: device.tenantId,
        userId: device.userId,
        deviceId: device.id,
        auditId: delivery.auditId,
        action: delivery.action,
        status: response.ok ? "SENT" : "FAILED",
        apnsId: response.apnsId,
        statusCode: response.status,
        error: errorText
      }
    });
    if (response.status === 400 || response.status === 410) {
      const reason = rawError || "";
      if (reason.includes("BadDeviceToken") || reason.includes("Unregistered") || reason.includes("DeviceTokenNotForTopic")) {
        await prisma.nativePushDevice.update({ where: { id: device.id }, data: { disabledAt: new Date() } });
      }
    }
    return response.ok;
  } catch (error) {
    await writeFailedDelivery(device, delivery, `HTTP/2-Transportfehler vor APNs-Antwort: ${errorMessage(error)}`);
    return false;
  }
}

export async function dispatchNativePushNotifications(audit: AuditLog) {
  if (!pushableActions.has(audit.action)) return;
  const tenantId = await tenantIdForAudit(audit);
  if (!tenantId) return;
  const config = await pushConfigForTenant(tenantId);
  if (!config) return;
  const users = await targetUserIds(audit);
  if (!users.length) return;
  const devices = await prisma.nativePushDevice.findMany({
    where: {
      tenantId,
      userId: { in: users },
      platform: "ios",
      disabledAt: null
    }
  });
  if (!devices.length) return;
  const delivery = { auditId: audit.id, action: audit.action, payload: payloadForAudit(audit) };
  let authorization: string;
  try {
    authorization = `bearer ${apnsJwt(config)}`;
  } catch (error) {
    await writeFailedDeliveries(devices, delivery, `Provider-Token konnte nicht erzeugt werden: ${errorMessage(error)}`);
    return;
  }
  const results = await Promise.allSettled(devices.map((device) => sendToDevice(device, delivery, config, authorization)));
  results.forEach((result) => {
    if (result.status === "rejected") console.error("native push failed", result.reason);
  });
}

export async function sendNativeTestPush(input: TestPushInput) {
  const config = await pushConfigForTenant(input.tenantId);
  if (!config) return { sent: 0, failed: 0, devices: 0, error: "missing_config" };
  const uniqueUserIds = Array.from(new Set(input.targetUserIds.filter(Boolean)));
  if (!uniqueUserIds.length) return { sent: 0, failed: 0, devices: 0, error: "missing_targets" };
  const devices = await prisma.nativePushDevice.findMany({
    where: {
      tenantId: input.tenantId,
      userId: { in: uniqueUserIds },
      platform: "ios",
      disabledAt: null
    }
  });
  if (!devices.length) return { sent: 0, failed: 0, devices: 0, error: "missing_devices" };
  const delivery = {
    auditId: null,
    action: "native_push_test",
    payload: payloadForTest({
      tenantId: input.tenantId,
      actorId: input.actorId,
      title: input.title?.trim() || "Playplaner Test",
      body: input.body?.trim() || "Wenn du das siehst, ist native Push eingerichtet."
    })
  };
  let authorization: string;
  try {
    authorization = `bearer ${apnsJwt(config)}`;
  } catch (error) {
    await writeFailedDeliveries(devices, delivery, `Provider-Token konnte nicht erzeugt werden: ${errorMessage(error)}`);
    return { sent: 0, failed: devices.length, devices: devices.length, error: null };
  }
  const results = await Promise.allSettled(devices.map((device) => sendToDevice(device, delivery, config, authorization)));
  return {
    sent: results.filter((result) => result.status === "fulfilled" && result.value).length,
    failed: results.filter((result) => result.status === "rejected" || (result.status === "fulfilled" && !result.value)).length,
    devices: devices.length,
    error: null
  };
}
