import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

const runtimeDir = process.env.MQTT_CONFIG_PATH || "/app/mosquitto-config";

export function mqttTopicBase(tenantSlugOrId: string) {
  return `playplaner/v1/${tenantSlugOrId.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

export function generateMqttPassword() {
  return `ppmq_${randomBytes(32).toString("base64url")}`;
}

export async function writeMosquittoRuntimeFiles() {
  const bridges = await prisma.automationBridge.findMany({
    where: { enabled: true, mqttUsername: { not: null }, mqttPasswordEnc: { not: null } },
    include: { tenant: { select: { id: true, slug: true } } }
  });
  const passwordLines = bridges
    .filter((bridge) => bridge.mqttUsername && bridge.mqttPasswordEnc)
    .map((bridge) => `${bridge.mqttUsername}:${decryptSecret(bridge.mqttPasswordEnc)}`);
  const aclLines = bridges.flatMap((bridge) => {
    const username = bridge.mqttUsername || "";
    const base = bridge.mqttBaseTopic || mqttTopicBase(bridge.tenant.slug || bridge.tenant.id);
    if (!username) return [];
    return [
      `user ${username}`,
      `topic readwrite ${base}/#`,
      `topic readwrite playplaner/v1/${bridge.tenant.id}/#`,
      ""
    ];
  });
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(join(runtimeDir, "passwords.raw"), passwordLines.join("\n") + (passwordLines.length ? "\n" : ""), { mode: 0o600 });
  await writeFile(join(runtimeDir, "acl"), aclLines.join("\n"), { mode: 0o600 });
  return { bridgeCount: bridges.length, passwordFile: join(runtimeDir, "passwords"), aclFile: join(runtimeDir, "acl") };
}

export async function rotateMqttCredentials(input: {
  tenantId: string;
  tenantSlug?: string | null;
  username?: string | null;
  password?: string | null;
  baseTopic?: string | null;
}) {
  const username = input.username?.trim() || `playplaner_${input.tenantSlug || input.tenantId}`.replace(/[^a-zA-Z0-9_-]+/g, "_");
  const password = input.password || generateMqttPassword();
  const baseTopic = input.baseTopic?.trim() || mqttTopicBase(input.tenantSlug || input.tenantId);
  const bridge = await prisma.automationBridge.upsert({
    where: { tenantId: input.tenantId },
    update: {
      enabled: true,
      mqttBaseTopic: baseTopic,
      mqttClientId: username,
      mqttUsername: username,
      mqttPasswordEnc: encryptSecret(password),
      mqttAclJson: {
        topics: [`${baseTopic}/#`, `playplaner/v1/${input.tenantId}/#`],
        generatedAt: new Date().toISOString()
      }
    },
    create: {
      tenantId: input.tenantId,
      enabled: true,
      mqttBaseTopic: baseTopic,
      mqttClientId: username,
      mqttUsername: username,
      mqttPasswordEnc: encryptSecret(password),
      mqttAclJson: {
        topics: [`${baseTopic}/#`, `playplaner/v1/${input.tenantId}/#`],
        generatedAt: new Date().toISOString()
      }
    }
  });
  await writeMosquittoRuntimeFiles();
  return { bridge, password };
}
