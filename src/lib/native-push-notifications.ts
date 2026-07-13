import { sign } from "crypto";
import { connect } from "http2";
import type { AuditLog, NativePushDevice, Prisma } from "@prisma/client";
import { decryptSecret } from "@/lib/crypto";
import { actionLabel, notificationActionAliases } from "@/lib/notification-actions";
import { prisma } from "@/lib/prisma";
import { blockedUserIds } from "@/lib/compliance/ugc";

type AuditForPush = Pick<AuditLog, "id" | "actorId" | "action" | "title" | "href" | "entityType" | "entityId" | "details">;
type ApnsConfig = {
  teamId: string;
  keyId: string;
  bundleId: string;
  privateKey: string;
};
type FcmConfig = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};
type PushConfig = {
  apns: ApnsConfig | null;
  fcm: FcmConfig | null;
};
type TestPushInput = {
  tenantId: string;
  actorId: string;
  targetUserIds: string[];
  deviceIds?: string[];
  title?: string;
  body?: string;
  sound?: string;
  action?: string;
  href?: string;
  targetScreen?: string;
  targetId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
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

type NativePushRule = Awaited<ReturnType<typeof findRulesForAudit>>[number];

export const nativePushSounds = [
  { value: "playplaner_chime.caf", label: "Chime - Standard" },
  { value: "playplaner_ping.caf", label: "Ping - Spielampel" },
  { value: "playplaner_spark.caf", label: "Spark - Likes und Favoriten" },
  { value: "playplaner_pulse.caf", label: "Pulse - Spielplan, Events und Aufträge" },
  { value: "playplaner_alert.caf", label: "Alert - Fehler" }
] as const;

function normalizeSound(value?: string | null) {
  return nativePushSounds.some((sound) => sound.value === value) ? value! : "playplaner_chime.caf";
}

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function apnsHost(environment: string) {
  return environment === "sandbox" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
}

function apnsJwt(config: ApnsConfig) {
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
    if (audit.href.startsWith("/chat")) return "chat";
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
  if (!settings?.enabled) return null;
  const privateKey = settings.privateKeyEnc ? decryptSecret(settings.privateKeyEnc).replace(/\\n/g, "\n") : "";
  const apns = settings.teamId && settings.keyId && settings.bundleId && privateKey
    ? {
        teamId: settings.teamId,
        keyId: settings.keyId,
        bundleId: settings.bundleId,
        privateKey
      }
    : null;
  let fcm: FcmConfig | null = null;
  if (settings.fcmProjectId && settings.fcmServiceAccountJsonEnc) {
    const raw = decryptSecret(settings.fcmServiceAccountJsonEnc);
    try {
      const serviceAccount = JSON.parse(raw) as { project_id?: string; client_email?: string; private_key?: string };
      const fcmPrivateKey = String(serviceAccount.private_key || "").replace(/\\n/g, "\n");
      const clientEmail = String(serviceAccount.client_email || "").trim();
      if (settings.fcmProjectId && clientEmail && fcmPrivateKey) {
        fcm = {
          projectId: settings.fcmProjectId,
          clientEmail,
          privateKey: fcmPrivateKey
        };
      }
    } catch {
      fcm = null;
    }
  }
  if (!apns && !fcm) return null;
  return {
    apns,
    fcm
  };
}

function payloadForAudit(audit: AuditForPush) {
  return payloadForAuditMessage(audit, actionLabel(audit.action), audit.title);
}

function discretePushText(action: string) {
  if (isChatPushAction(action)) return { title: "Playplaner", body: "Du hast eine neue Nachricht." };
  if (action.startsWith("activity_") || action.startsWith("self_bondage_order_") || action.startsWith("session_")) {
    return { title: "Playplaner", body: "Eine gemeinsame Planung wurde aktualisiert." };
  }
  return { title: "Playplaner", body: "In Playplaner gibt es eine neue Aktivitaet." };
}

function payloadForAuditMessage(audit: AuditForPush, title: string, body: string, soundOverride?: string | null, previewMode = "DISCREET") {
  const target = targetForAudit(audit);
  const sound = soundOverride ? normalizeSound(soundOverride) : soundForAction(audit.action);
  const mode = previewMode === "FULL" ? "FULL" : previewMode === "TITLE" ? "TITLE" : "DISCREET";
  const discrete = discretePushText(audit.action);
  const alert = mode === "FULL"
    ? { title, body }
    : mode === "TITLE"
      ? { title: actionLabel(audit.action), body: discrete.body }
      : discrete;
  return {
    aps: {
      alert,
      sound
    },
    type: pushTypeForAction(audit.action),
    target,
    auditId: audit.id,
    eventId: audit.entityType === "event" || audit.action.startsWith("event_") ? audit.entityId : null,
    threadId: stringDetail(auditDetails(audit), ["threadId", "telegramThreadId", "messageThreadId"]),
    circleId: stringDetail(auditDetails(audit), ["circleId"]),
    circleName: stringDetail(auditDetails(audit), ["circleName"]),
    imageUrl: null,
    sound,
    action: audit.action,
    entityType: audit.entityType,
    entityId: audit.entityId,
    href: audit.href
  };
}

function payloadForTest(input: Required<Pick<TestPushInput, "title" | "body">> & Pick<TestPushInput, "tenantId" | "actorId" | "sound" | "action" | "href" | "targetScreen" | "targetId" | "entityType" | "entityId">) {
  const sound = normalizeSound(input.sound);
  const href = input.href || "/settings/push";
  const entityType = input.entityType || "tenant";
  const entityId = input.entityId || input.tenantId;
  return {
    aps: {
      alert: {
        title: input.title,
        body: input.body
      },
      sound
    },
    type: pushTypeForAction(input.action || "native_push_test"),
    target: {
      screen: input.targetScreen || "setup",
      id: input.targetId ?? entityId,
      href
    },
    eventId: null,
    threadId: null,
    imageUrl: null,
    sound,
    action: input.action || "native_push_test",
    entityType,
    entityId,
    href,
    actorId: input.actorId
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unbekannter Fehler");
}

function payloadJson(payload: unknown) {
  return payload === undefined ? undefined : payload as Prisma.InputJsonValue;
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
  delivery: { auditId?: string | null; action: string; payload?: unknown },
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
      error: message.slice(0, 1000),
      payload: payloadJson(delivery.payload)
    }
  });
}

async function writeFailedDeliveries(
  devices: NativePushDevice[],
  delivery: { auditId?: string | null; action: string; payload?: unknown },
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

function fcmJwt(config: FcmConfig, issuedAtSeconds?: number) {
  const now = issuedAtSeconds || Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: config.clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }));
  const data = `${header}.${claims}`;
  const signature = sign("RSA-SHA256", Buffer.from(data), config.privateKey);
  return `${data}.${base64url(signature)}`;
}

async function fcmAccessToken(config: FcmConfig) {
  async function requestToken(jwt: string) {
    return fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt
      })
    });
  }

  let response = await requestToken(fcmJwt(config));
  let payload = await response.json().catch(() => ({})) as { access_token?: string; error?: string; error_description?: string };
  if (!response.ok && payload.error === "invalid_grant") {
    const googleDate = response.headers.get("date");
    const googleTime = googleDate ? Math.floor(new Date(googleDate).getTime() / 1000) : 0;
    if (googleTime > 0) {
      response = await requestToken(fcmJwt(config, googleTime));
      payload = await response.json().catch(() => ({})) as { access_token?: string; error?: string; error_description?: string };
    }
  }
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || `FCM OAuth HTTP ${response.status}`);
  }
  return payload.access_token;
}

function stringPayloadValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function fcmMessageFromPayload(deviceToken: string, payload: unknown) {
  const data = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const aps = data.aps && typeof data.aps === "object" && !Array.isArray(data.aps) ? data.aps as { alert?: { title?: string; body?: string }; sound?: string } : {};
  const alert = aps.alert || {};
  const notification = {
    title: String(alert.title || "Playplaner"),
    body: String(alert.body || "")
  };
  return {
    message: {
      token: deviceToken,
      notification,
      data: Object.fromEntries(Object.entries(data)
        .filter(([key]) => key !== "aps")
        .map(([key, value]) => [key, stringPayloadValue(value)])),
      android: {
        notification: {
          channel_id: "playplaner_events",
          sound: String(data.sound || aps.sound || "default").replace(/\\.caf$/i, "")
        }
      }
    }
  };
}

async function sendFcmHttp(input: { config: FcmConfig; accessToken: string; deviceToken: string; payload: unknown }) {
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(input.config.projectId)}/messages:send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(fcmMessageFromPayload(input.deviceToken, input.payload))
  });
  const body = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    messageId: response.ok ? (() => {
      try {
        const parsed = JSON.parse(body) as { name?: string };
        return parsed.name || null;
      } catch {
        return null;
      }
    })() : null,
    body: body || null
  };
}

async function sendToDevice(
  device: NativePushDevice,
  delivery: { auditId?: string | null; action: string; payload: unknown },
  config: ApnsConfig,
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
        error: errorText,
        payload: payloadJson(delivery.payload)
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

async function sendToAndroidDevice(
  device: NativePushDevice,
  delivery: { auditId?: string | null; action: string; payload: unknown },
  config: FcmConfig,
  accessToken: string
) {
  try {
    const response = await sendFcmHttp({
      config,
      accessToken,
      deviceToken: device.deviceToken,
      payload: delivery.payload
    });
    const rawError = response.ok ? null : response.body?.slice(0, 1000) || null;
    await prisma.nativePushDelivery.create({
      data: {
        tenantId: device.tenantId,
        userId: device.userId,
        deviceId: device.id,
        auditId: delivery.auditId,
        action: delivery.action,
        status: response.ok ? "SENT" : "FAILED",
        apnsId: response.messageId,
        statusCode: response.status,
        error: rawError,
        payload: payloadJson(delivery.payload)
      }
    });
    if (response.status === 404 || response.status === 400) {
      const reason = rawError || "";
      if (reason.includes("UNREGISTERED") || reason.includes("registration-token-not-registered") || reason.includes("INVALID_ARGUMENT")) {
        await prisma.nativePushDevice.update({ where: { id: device.id }, data: { disabledAt: new Date() } });
      }
    }
    return response.ok;
  } catch (error) {
    await writeFailedDelivery(device, delivery, `FCM-Transportfehler: ${errorMessage(error)}`);
    return false;
  }
}

async function sendToNativeDevices(
  devices: NativePushDevice[],
  delivery: { auditId?: string | null; action: string; payload: unknown },
  config: PushConfig
) {
  const iosDevices = devices.filter((device) => device.platform === "ios");
  const androidDevices = devices.filter((device) => device.platform === "android");
  const results: boolean[] = [];

  if (iosDevices.length) {
    if (!config.apns) {
      await writeFailedDeliveries(iosDevices, delivery, "APNs-Konfiguration fehlt.");
      results.push(...iosDevices.map(() => false));
    } else {
      let authorization = "";
      try {
        authorization = `bearer ${apnsJwt(config.apns)}`;
      } catch (error) {
        await writeFailedDeliveries(iosDevices, delivery, `Provider-Token konnte nicht erzeugt werden: ${errorMessage(error)}`);
        results.push(...iosDevices.map(() => false));
      }
      if (authorization) {
        const iosResults = await Promise.allSettled(iosDevices.map((device) => sendToDevice(device, delivery, config.apns!, authorization)));
        iosResults.forEach((result) => {
          if (result.status === "rejected") console.error("native push failed", result.reason);
          results.push(result.status === "fulfilled" && result.value);
        });
      }
    }
  }

  if (androidDevices.length) {
    if (!config.fcm) {
      await writeFailedDeliveries(androidDevices, delivery, "FCM-Konfiguration fehlt.");
      results.push(...androidDevices.map(() => false));
    } else {
      let accessToken = "";
      try {
        accessToken = await fcmAccessToken(config.fcm);
      } catch (error) {
        await writeFailedDeliveries(androidDevices, delivery, `FCM Access Token konnte nicht erzeugt werden: ${errorMessage(error)}`);
        results.push(...androidDevices.map(() => false));
      }
      if (accessToken) {
        const androidResults = await Promise.allSettled(androidDevices.map((device) => sendToAndroidDevice(device, delivery, config.fcm!, accessToken)));
        androidResults.forEach((result) => {
          if (result.status === "rejected") console.error("native push failed", result.reason);
          results.push(result.status === "fulfilled" && result.value);
        });
      }
    }
  }

  return {
    sent: results.filter(Boolean).length,
    failed: results.filter((value) => !value).length,
    devices: devices.length
  };
}

function actorName(actor?: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null } | null) {
  return actor?.profile?.displayName || actor?.name || actor?.username || actor?.email || "System";
}

function renderTemplate(template: string, audit: AuditForPush, actor: Parameters<typeof actorName>[0] | null) {
  const detailsObject = auditDetails(audit);
  const details = audit.details ? JSON.stringify(audit.details) : "";
  const message = stringDetail(detailsObject, ["text", "message", "body"]) || "";
  const values: Record<string, string> = {
    title: audit.title,
    actor: actorName(actor),
    action: audit.action,
    event: actionLabel(audit.action),
    entityType: audit.entityType || "",
    entityId: audit.entityId || "",
    url: audit.href || "",
    message,
    details
  };
  return template.replace(/\{([a-zA-Z]+)\}/g, (match, key) => values[key] ?? match).trim();
}

function chatMessagePreview(audit: AuditForPush) {
  const details = auditDetails(audit);
  const text = stringDetail(details, ["text", "message", "body"]);
  if (text) return text.length > 140 ? `${text.slice(0, 137)}...` : text;
  const mimeType = stringDetail(details, ["fileMimeType", "mimeType"]);
  if (mimeType?.startsWith("image/")) return "Bild gesendet";
  if (mimeType?.startsWith("video/")) return "Video gesendet";
  if (details.hasFile) return "Datei gesendet";
  return audit.title;
}

function isChatPushAction(action: string) {
  return action === "circle_chat_message_created" || action === "circle_chat_message_created_api";
}

function isLegacyChatPushTemplate(rule: Pick<NativePushRule, "titleTemplate" | "bodyTemplate">) {
  return rule.titleTemplate === "Neue Chat-Nachricht" && rule.bodyTemplate === "{title}";
}

async function findRulesForAudit(audit: AuditForPush, tenantId: string) {
  return prisma.nativePushNotificationRule.findMany({
    where: { tenantId, action: { in: notificationActionAliases(audit.action) }, active: true },
    include: {
      targetUser: { include: { profile: true } },
      targetCircle: true
    }
  });
}

async function userIdsForRule(rule: NativePushRule, audit: AuditForPush, actorId: string | null) {
  const details = auditDetails(audit);
  const excludeActorFromTargets = details.excludeActorFromTargets === true;
  let ids: string[] = [];
  if (rule.targetAll) {
    const memberships = await prisma.tenantMembership.findMany({
      where: { tenantId: rule.tenantId, active: true, user: { active: true } },
      select: { userId: true }
    });
    ids = memberships.map((membership) => membership.userId);
  } else if (rule.targetCircleId) {
    const memberships = await prisma.tenantMembership.findMany({
      where: { tenantId: rule.tenantId, circleId: rule.targetCircleId, active: true, user: { active: true } },
      select: { userId: true }
    });
    ids = memberships.map((membership) => membership.userId);
  } else if (rule.targetUserId) {
    const membership = await prisma.tenantMembership.findFirst({
      where: { tenantId: rule.tenantId, userId: rule.targetUserId, active: true, user: { active: true } },
      select: { userId: true }
    });
    ids = membership ? [membership.userId] : [];
  }
  let filtered = Array.from(new Set(ids.filter((id) => !(excludeActorFromTargets && actorId && id === actorId))));
  if (actorId) {
    const excludedByBlock = new Set(await blockedUserIds(actorId, rule.tenantId));
    filtered = filtered.filter((id) => !excludedByBlock.has(id));
  }
  return filtered;
}

function targetLabel(rule: Pick<NativePushRule, "targetAll" | "targetUser" | "targetCircle">) {
  if (rule.targetAll) return "Alle auf dieser Seite";
  if (rule.targetUser) return actorName(rule.targetUser);
  if (rule.targetCircle) return `Kreis ${rule.targetCircle.name}`;
  return "Kein Ziel";
}

async function writeRuleAudit(input: {
  actorId: string | null;
  rule: NativePushRule;
  audit: AuditForPush;
  title: string;
  body: string;
  sent: number;
  failed: number;
  devices: number;
}) {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.failed ? "native_push_notification_failed" : "native_push_notification_sent",
      entityType: "nativePushNotificationRule",
      entityId: input.rule.id,
      title: `${input.failed ? "Push-Benachrichtigung fehlgeschlagen" : "Push-Benachrichtigung gesendet"}: ${actionLabel(input.audit.action)}`,
      href: "/settings/push#notifications",
      details: {
        sourceAction: input.audit.action,
        sourceActionLabel: actionLabel(input.audit.action),
        sourceTitle: input.audit.title,
        sourceHref: input.audit.href || null,
        target: targetLabel(input.rule),
        targetAll: input.rule.targetAll,
        targetUserId: input.rule.targetUserId,
      targetCircleId: input.rule.targetCircleId,
      sent: input.sent,
      failed: input.failed,
      devices: input.devices,
      pushTitle: input.title,
      pushBody: input.body,
      sound: input.rule.sound
      }
    }
  });
}

export async function dispatchNativePushNotifications(audit: AuditLog) {
  const tenantId = await tenantIdForAudit(audit);
  if (!tenantId) return;
  const rules = await findRulesForAudit(audit, tenantId);
  if (!rules.length) return;
  const config = await pushConfigForTenant(tenantId);
  if (!config) return;
  const actor = audit.actorId
    ? await prisma.user.findUnique({ where: { id: audit.actorId }, include: { profile: true } })
    : null;
  for (const rule of rules) {
    const userIds = await userIdsForRule(rule, audit, audit.actorId);
    if (!userIds.length) continue;
    const devices = await prisma.nativePushDevice.findMany({
      where: {
        tenantId,
        userId: { in: userIds },
        disabledAt: null
      },
      include: { user: { select: { settings: { select: { notificationPreviewMode: true } } } } }
    });
    if (!devices.length) continue;
    const useChatDefault = isChatPushAction(audit.action) && isLegacyChatPushTemplate(rule);
    const title = useChatDefault ? actorName(actor) : renderTemplate(rule.titleTemplate, audit, actor) || actionLabel(audit.action);
    const body = useChatDefault ? chatMessagePreview(audit) : renderTemplate(rule.bodyTemplate, audit, actor) || audit.title;
    const groups = new Map<string, typeof devices>();
    for (const device of devices) {
      const mode = device.user.settings?.notificationPreviewMode || "DISCREET";
      groups.set(mode, [...(groups.get(mode) || []), device]);
    }
    let result = { sent: 0, failed: 0, devices: 0 };
    for (const [mode, targetDevices] of groups) {
      const delivery = { auditId: audit.id, action: audit.action, payload: payloadForAuditMessage(audit, title, body, rule.sound, mode) };
      const partial = await sendToNativeDevices(targetDevices, delivery, config);
      result = {
        sent: result.sent + partial.sent,
        failed: result.failed + partial.failed,
        devices: result.devices + partial.devices
      };
    }
    await writeRuleAudit({
      actorId: audit.actorId,
      rule,
      audit,
      title,
      body,
      sent: result.sent,
      failed: result.failed,
      devices: result.devices
    });
  }
}

export async function testNativePushNotificationRule(ruleId: string, actorId: string) {
  const rule = await prisma.nativePushNotificationRule.findUnique({
    where: { id: ruleId },
    include: { targetUser: { include: { profile: true } }, targetCircle: true }
  });
  if (!rule) return { sent: 0, failed: 0, devices: 0, error: "missing_rule" };
  const actor = await prisma.user.findUnique({ where: { id: actorId }, include: { profile: true } });
  const audit: AuditForPush = {
    id: `test-${rule.id}`,
    actorId,
    action: rule.action,
    title: `Test: ${actionLabel(rule.action)}`,
    href: "/settings/push#notifications",
    entityType: "nativePushNotificationRule",
    entityId: rule.id,
    details: { test: true }
  };
  const config = await pushConfigForTenant(rule.tenantId);
  if (!config) return { sent: 0, failed: 0, devices: 0, error: "missing_config" };
  const userIds = await userIdsForRule(rule, audit, actorId);
  if (!userIds.length) return { sent: 0, failed: 0, devices: 0, error: "missing_targets" };
  const devices = await prisma.nativePushDevice.findMany({ where: { tenantId: rule.tenantId, userId: { in: userIds }, disabledAt: null } });
  if (!devices.length) return { sent: 0, failed: 0, devices: 0, error: "missing_devices" };
  const title = renderTemplate(rule.titleTemplate, audit, actor) || actionLabel(rule.action);
  const body = renderTemplate(rule.bodyTemplate, audit, actor) || audit.title;
  const result = await sendToNativeDevices(devices, { auditId: null, action: rule.action, payload: payloadForAuditMessage(audit, title, body, rule.sound) }, config);
  return {
    sent: result.sent,
    failed: result.failed,
    devices: result.devices,
    error: null
  };
}

export async function sendNativeTestPush(input: TestPushInput) {
  const config = await pushConfigForTenant(input.tenantId);
  if (!config) return { sent: 0, failed: 0, devices: 0, error: "missing_config" };
  const uniqueUserIds = Array.from(new Set(input.targetUserIds.filter(Boolean)));
  if (!uniqueUserIds.length) return { sent: 0, failed: 0, devices: 0, error: "missing_targets" };
  const uniqueDeviceIds = Array.from(new Set((input.deviceIds || []).filter(Boolean)));
  const devices = await prisma.nativePushDevice.findMany({
    where: {
      tenantId: input.tenantId,
      userId: { in: uniqueUserIds },
      ...(uniqueDeviceIds.length ? { id: { in: uniqueDeviceIds } } : {}),
      disabledAt: null
    }
  });
  if (!devices.length) return { sent: 0, failed: 0, devices: 0, error: "missing_devices" };
  const startedAt = new Date();
  const delivery = {
    auditId: null,
    action: input.action || "native_push_test",
    payload: payloadForTest({
      tenantId: input.tenantId,
      actorId: input.actorId,
      title: input.title?.trim() || "Playplaner Test",
      body: input.body?.trim() || "Wenn du das siehst, ist native Push eingerichtet.",
      sound: input.sound,
      action: input.action,
      href: input.href,
      targetScreen: input.targetScreen,
      targetId: input.targetId,
      entityType: input.entityType,
      entityId: input.entityId
    })
  };
  const result = await sendToNativeDevices(devices, delivery, config);
  const attempts = await prisma.nativePushDelivery.findMany({
    where: {
      tenantId: input.tenantId,
      action: delivery.action,
      deviceId: { in: devices.map((device) => device.id) },
      createdAt: { gte: startedAt }
    },
    include: { device: true },
    orderBy: { createdAt: "asc" }
  });
  return {
    sent: result.sent,
    failed: result.failed,
    devices: result.devices,
    attempts: attempts.map((attempt) => ({
      id: attempt.id,
      deviceId: attempt.deviceId,
      environment: attempt.device?.environment || null,
      status: attempt.status,
      apnsId: attempt.apnsId,
      statusCode: attempt.statusCode,
      errorReason: attempt.error
    })),
    error: null
  };
}
