import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const SettingsSchema = z.object({
  notificationPreviewMode: z.enum(["DISCREET", "TITLE", "FULL"])
});

function serialize(mode?: string | null, showSensitiveMedia = false) {
  return {
    notificationPreviewMode: mode === "FULL" ? "FULL" : mode === "TITLE" ? "TITLE" : "DISCREET",
    showSensitiveMedia
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const settings = await prisma.userSettings.findUnique({
    where: { userId: auth.user.id },
    select: { notificationPreviewMode: true, showSensitiveMedia: true }
  });
  return NextResponse.json({ ok: true, settings: serialize(settings?.notificationPreviewMode, settings?.showSensitiveMedia) });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const parsed = SettingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_preview_mode" }, { status: 400 });
  const settings = await prisma.userSettings.upsert({
    where: { userId: auth.user.id },
    update: { notificationPreviewMode: parsed.data.notificationPreviewMode },
    create: { userId: auth.user.id, notificationPreviewMode: parsed.data.notificationPreviewMode },
    select: { notificationPreviewMode: true, showSensitiveMedia: true }
  });
  return NextResponse.json({ ok: true, settings: serialize(settings.notificationPreviewMode, settings.showSensitiveMedia) });
}
