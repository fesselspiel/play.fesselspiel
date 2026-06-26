import { sign } from "crypto";
import type { AuditLog, NativePushDevice } from "@prisma/client";
import { env } from "@/lib/env";
import { actionLabel } from "@/lib/notification-actions";
import { prisma } from "@/lib/prisma";

type AuditForPush = Pick<AuditLog, "id" | "actorId" | "action" | "title" | "href" | "entityType" | "entityId" | "details">;

const pushableActions = new Set([
  "event_created",
  "event_updated",
  "event_deleted",
  "event_checkin_created"
]);

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function apnsConfigured() {
  return Boolean(env.apnsTeamId && env.apnsKeyId && env.apnsBundleId && env.apnsPrivateKey);
}

function apnsHost(environment: string) {
  return environment === "sandbox" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
}

function apnsJwt() {
  const header = base64url(JSON.stringify({ alg: "ES256", kid: env.apnsKeyId }));
  const claims = base64url(JSON.stringify({ iss: env.apnsTeamId, iat: Math.floor(Date.now() / 1000) }));
  const data = `${header}.${claims}`;
  const signature = sign("sha256", Buffer.from(data), {
    key: env.apnsPrivateKey,
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

async function sendToDevice(device: NativePushDevice, audit: AuditForPush, authorization: string) {
  const response = await fetch(`${apnsHost(device.environment)}/3/device/${device.deviceToken}`, {
    method: "POST",
    headers: {
      authorization,
      "apns-topic": env.apnsBundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json"
    },
    body: JSON.stringify(payloadForAudit(audit))
  });
  const apnsId = response.headers.get("apns-id");
  const errorText = response.ok ? null : (await response.text().catch(() => "")).slice(0, 1000);
  await prisma.nativePushDelivery.create({
    data: {
      tenantId: device.tenantId,
      userId: device.userId,
      deviceId: device.id,
      auditId: audit.id,
      action: audit.action,
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
}

export async function dispatchNativePushNotifications(audit: AuditLog) {
  if (!pushableActions.has(audit.action) || !apnsConfigured()) return;
  const users = await targetUserIds(audit);
  if (!users.length) return;
  const devices = await prisma.nativePushDevice.findMany({
    where: {
      userId: { in: users },
      platform: "ios",
      disabledAt: null
    }
  });
  if (!devices.length) return;
  const authorization = `bearer ${apnsJwt()}`;
  const results = await Promise.allSettled(devices.map((device) => sendToDevice(device, audit, authorization)));
  results.forEach((result) => {
    if (result.status === "rejected") console.error("native push failed", result.reason);
  });
}
