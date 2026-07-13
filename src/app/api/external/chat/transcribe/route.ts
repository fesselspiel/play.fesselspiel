import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { decryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { requireCircleChatScope } from "@/lib/circle-chat";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function openAiKeyForUser(user: { id: string; tenantId?: string | null }) {
  const [userSettings, tenantSettings] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId: user.id }, select: { openAiApiKeyEnc: true } }),
    user.tenantId
      ? prisma.tenantTelegramSettings.findFirst({
          where: { tenantId: user.tenantId, active: true, openAiApiKeyEnc: { not: null } },
          orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
          select: { openAiApiKeyEnc: true }
        })
      : null
  ]);
  return decryptSecret(userSettings?.openAiApiKeyEnc) || decryptSecret(tenantSettings?.openAiApiKeyEnc) || env.openAiApiKey;
}

function text(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "circleChat");
  if (blocked) return blocked;

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ ok: false, error: "invalid_multipart", message: "multipart/form-data erwartet" }, { status: 400 });
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return NextResponse.json({ ok: false, error: "file_required", message: "Audiodatei fehlt" }, { status: 400 });
  const circleId = text(formData.get("circleId")) || null;
  if (circleId) {
    const scope = await requireCircleChatScope(auth.user, circleId).catch(() => null);
    if (!scope) return NextResponse.json({ ok: false, error: "circle_forbidden", message: "Kein Zugriff auf diesen Zirkel" }, { status: 403 });
  }

  const apiKey = await openAiKeyForUser(auth.user);
  if (!apiKey) return NextResponse.json({ ok: false, error: "openai_key_missing", message: "OpenAI API-Key fehlt" }, { status: 400 });

  try {
    const audio = new File([await file.arrayBuffer()], file.name || "chat-audio.m4a", { type: file.type || "audio/mp4" });
    const client = new OpenAI({ apiKey });
    const result = await client.audio.transcriptions.create({
      file: audio,
      model: env.openAiTranscriptionModel
    });
    const transcript = String(result.text || "").trim();
    if (!transcript) return NextResponse.json({ ok: false, error: "empty_transcription", message: "Die Transkription war leer" }, { status: 422 });
    return NextResponse.json({ ok: true, transcript, text: transcript, language: null });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: "transcription_failed",
      message: "Audio konnte nicht transkribiert werden",
      detail: error instanceof Error ? error.message : String(error)
    }, { status: 502 });
  }
}
