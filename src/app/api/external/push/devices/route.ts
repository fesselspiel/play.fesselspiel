import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requestValues, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const platforms = new Set(["ios", "android"]);
const environments = new Set(["sandbox", "production"]);

function cleanIosDeviceToken(value: string) {
  return value.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
}

function cleanDeviceToken(platform: string, value: string) {
  const raw = String(value || "").trim();
  return platform === "ios" ? cleanIosDeviceToken(raw) : raw;
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  const values = await requestValues(request);
  const platform = String(values.get("platform") || "ios").toLowerCase();
  const environment = String(values.get("environment") || "production").toLowerCase();
  if (!platforms.has(platform)) return NextResponse.json({ ok: false, error: "unsupported_platform" }, { status: 400 });
  if (!environments.has(environment)) return NextResponse.json({ ok: false, error: "unsupported_environment" }, { status: 400 });
  const deviceToken = cleanDeviceToken(platform, String(values.get("deviceToken") || ""));
  if (deviceToken.length < (platform === "ios" ? 32 : 16)) return NextResponse.json({ ok: false, error: "invalid_device_token" }, { status: 400 });
  const device = await prisma.nativePushDevice.upsert({
    where: { platform_deviceToken: { platform, deviceToken } },
    update: {
      tenantId: auth.user.tenantId || null,
      userId: auth.user.id,
      environment,
      deviceName: String(values.get("deviceName") || "").trim() || null,
      appVersion: String(values.get("appVersion") || "").trim() || null,
      lastSeenAt: new Date(),
      disabledAt: null
    },
    create: {
      tenantId: auth.user.tenantId || null,
      userId: auth.user.id,
      platform,
      deviceToken,
      environment,
      deviceName: String(values.get("deviceName") || "").trim() || null,
      appVersion: String(values.get("appVersion") || "").trim() || null
    }
  });
  return NextResponse.json({ ok: true, device: { id: device.id, platform: device.platform, environment: device.environment } });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const values = await requestValues(request);
  const platform = String(values.get("platform") || "ios").toLowerCase();
  if (!platforms.has(platform)) return NextResponse.json({ ok: false, error: "unsupported_platform" }, { status: 400 });
  const deviceToken = cleanDeviceToken(platform, String(values.get("deviceToken") || ""));
  if (!deviceToken) return NextResponse.json({ ok: false, error: "invalid_device_token" }, { status: 400 });
  await prisma.nativePushDevice.updateMany({
    where: { userId: auth.user.id, platform, deviceToken },
    data: { disabledAt: new Date() }
  });
  return NextResponse.json({ ok: true });
}
