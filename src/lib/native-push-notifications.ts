import { sign } from "crypto";
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
  return {
    aps: {
      alert: {
        title: actionLabel(audit.action),
        body: audit.title
      },
      sound: "default"
    },
    auditId: audit.id,
    action: audit.action,
    entityType: audit.entityType,
    entityId: audit.entityId,
    href: audit.href
  };
}

function payloadForTest(input: Required<Pick<TestPushInput, "title" | "body">> & Pick<TestPushInput, "tenantId" | "actorId">) {
  return {
    aps: {
      alert: {
        title: input.title,
        body: input.body
      },
      sound: "default"
    },
    action: "native_push_test",
    entityType: "tenant",
    entityId: input.tenantId,
    href: "/settings/push",
    actorId: input.actorId
  };
}

async function sendToDevice(
  device: NativePushDevice,
  delivery: { auditId?: string | null; action: string; payload: unknown },
  config: PushConfig,
  authorization: string
) {
  const response = await fetch(`${apnsHost(device.environment)}/3/device/${device.deviceToken}`, {
    method: "POST",
    headers: {
      authorization,
      "apns-topic": config.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json"
    },
    body: JSON.stringify(delivery.payload)
  });
  const apnsId = response.headers.get("apns-id");
  const errorText = response.ok ? null : (await response.text().catch(() => "")).slice(0, 1000);
  await prisma.nativePushDelivery.create({
    data: {
      tenantId: device.tenantId,
      userId: device.userId,
      deviceId: device.id,
      auditId: delivery.auditId,
      action: delivery.action,
      status: response.ok ? "SENT" : "FAILED",
      apnsId,
      statusCode: response.status,
      error: errorText
    }
  });
  if (response.status === 400 || response.status === 410) {
    const reason = errorText || "";
    if (reason.includes("BadDeviceToken") || reason.includes("Unregistered") || reason.includes("DeviceTokenNotForTopic")) {
      await prisma.nativePushDevice.update({ where: { id: device.id }, data: { disabledAt: new Date() } });
    }
  }
  return response.ok;
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
  const authorization = `bearer ${apnsJwt(config)}`;
  const delivery = { auditId: audit.id, action: audit.action, payload: payloadForAudit(audit) };
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
  const authorization = `bearer ${apnsJwt(config)}`;
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
  const results = await Promise.allSettled(devices.map((device) => sendToDevice(device, delivery, config, authorization)));
  return {
    sent: results.filter((result) => result.status === "fulfilled" && result.value).length,
    failed: results.filter((result) => result.status === "rejected" || (result.status === "fulfilled" && !result.value)).length,
    devices: devices.length,
    error: null
  };
}
