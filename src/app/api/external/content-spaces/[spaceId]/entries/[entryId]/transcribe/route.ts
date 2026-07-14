import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import {
  canEditContentEntry,
  contentEntryAccess,
  LEGACY_IDEAS_SPACE_ID,
  LEGACY_WIKI_SPACE_ID,
  parseEntryId,
  serializeContentEntry
} from "@/lib/content-spaces";
import { decryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { createWikiRevision, wikiEditablePage } from "@/lib/wiki";

export const runtime = "nodejs";

function text(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

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

async function transcribe(file: File, apiKey: string) {
  const audio = new File([await file.arrayBuffer()], file.name || "audio.m4a", { type: file.type || "audio/mp4" });
  const client = new OpenAI({ apiKey });
  const result = await client.audio.transcriptions.create({ file: audio, model: env.openAiTranscriptionModel });
  return String(result.text || "").trim();
}

function mergedContent(existing: string, transcript: string, insertAt: string) {
  const separator = existing.trim() ? "\n\n" : "";
  return insertAt === "prepend" ? `${transcript}${separator}${existing}`.trim() : `${existing}${separator}${transcript}`.trim();
}

export async function POST(request: NextRequest, props: { params: Promise<{ spaceId: string; entryId: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ ok: false, error: "invalid_multipart", message: "multipart/form-data erwartet" }, { status: 400 });
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return NextResponse.json({ ok: false, error: "file_required", message: "Audiodatei fehlt" }, { status: 400 });
  const apiKey = await openAiKeyForUser(auth.user);
  if (!apiKey) return NextResponse.json({ ok: false, error: "openai_key_missing", message: "OpenAI API-Key fehlt" }, { status: 400 });

  let transcript = "";
  try {
    transcript = await transcribe(file, apiKey);
  } catch (error) {
    return NextResponse.json({ ok: false, error: "transcription_failed", message: "Audio konnte nicht transkribiert werden", detail: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
  if (!transcript) return NextResponse.json({ ok: false, error: "empty_transcription", message: "Die Transkription war leer" }, { status: 422 });
  const insertAt = text(formData.get("insertAt")) || "append";
  const keepAudio = text(formData.get("keepAudio")).toLowerCase() === "true";
  const parsed = parseEntryId(params.entryId);

  if (params.spaceId === LEGACY_WIKI_SPACE_ID || parsed.type === "wiki") {
    const existing = await wikiEditablePage(auth.user, parsed.id);
    if (!existing) return NextResponse.json({ ok: false, error: "not_found_or_readonly" }, { status: 404 });
    const page = await prisma.wikiPage.update({
      where: { id: existing.id },
      data: { content: mergedContent(existing.content, transcript, insertAt) },
      include: { owner: { include: { profile: true } }, images: { include: { file: true }, orderBy: { createdAt: "asc" } } }
    });
    if (keepAudio) {
      const asset = await saveUploadedFile(auth.user.id, file, auth.user.tenantId);
      if (asset) await prisma.wikiPageImage.create({ data: { pageId: page.id, fileId: asset.id, title: "Sprachaufnahme" } });
    }
    const refreshed = await prisma.wikiPage.findUniqueOrThrow({ where: { id: page.id }, include: { owner: { include: { profile: true } }, images: { include: { file: true }, orderBy: { createdAt: "asc" } } } });
    await createWikiRevision(page.id, auth.user.id, "transcribed_appended_content_space_api");
    await logAction({ actorId: auth.user.id, action: "content_entry_transcription_appended_api", entityType: "wikiPage", entityId: page.id, title: `Tagebucheintrag per Sprache ergänzt: ${page.title}`, href: serializeContentEntry(request, { legacyType: "wiki", page: refreshed }).href });
    return NextResponse.json({ ok: true, transcript, text: transcript, item: serializeContentEntry(request, { legacyType: "wiki", page: refreshed }) });
  }
  if (params.spaceId === LEGACY_IDEAS_SPACE_ID || parsed.type === "idea") {
    const existing = await prisma.activityPlan.findFirst({ where: { id: parsed.id, category: "IDEA_COLLECTION", ...(auth.user.tenantId ? { tenantId: auth.user.tenantId } : {}), ...(auth.user.role === "ADMIN" || auth.user.role === "SUPER_ADMIN" ? {} : { ownerId: auth.user.id }) } });
    if (!existing) return NextResponse.json({ ok: false, error: "not_found_or_readonly" }, { status: 404 });
    const idea = await prisma.activityPlan.update({
      where: { id: existing.id },
      data: { note: mergedContent(existing.note || "", transcript, insertAt) },
      include: { owner: { include: { profile: true } }, images: { include: { file: true }, orderBy: { createdAt: "asc" } } }
    });
    if (keepAudio) {
      const asset = await saveUploadedFile(auth.user.id, file, auth.user.tenantId);
      if (asset) await prisma.activityImage.create({ data: { activityId: idea.id, fileId: asset.id, title: "Sprachaufnahme" } });
    }
    const refreshed = await prisma.activityPlan.findUniqueOrThrow({ where: { id: idea.id }, include: { owner: { include: { profile: true } }, images: { include: { file: true }, orderBy: { createdAt: "asc" } } } });
    await logAction({ actorId: auth.user.id, action: "content_entry_transcription_appended_api", entityType: "activity", entityId: idea.id, title: `Idee per Sprache ergänzt: ${idea.title}`, href: `/ideas/${idea.slug}` });
    return NextResponse.json({ ok: true, transcript, text: transcript, item: serializeContentEntry(request, { legacyType: "idea", idea: refreshed }) });
  }

  const resolved = await contentEntryAccess(auth.user, params.spaceId, parsed.id);
  if (!resolved || !canEditContentEntry(auth.user, resolved.entry, resolved.space)) return NextResponse.json({ ok: false, error: "not_found_or_readonly" }, { status: 404 });
  const entry = await prisma.contentEntry.update({
    where: { id: resolved.entry.id },
    data: { content: mergedContent(resolved.entry.content, transcript, insertAt) },
    include: { owner: { include: { profile: true } }, space: true, attachments: { include: { file: true }, orderBy: { createdAt: "asc" } } }
  });
  if (keepAudio) {
    const asset = await saveUploadedFile(auth.user.id, file, auth.user.tenantId);
    if (asset) await prisma.contentEntryAttachment.create({ data: { tenantId: auth.user.tenantId || undefined, ownerId: auth.user.id, entryId: entry.id, fileId: asset.id, title: "Sprachaufnahme" } });
  }
  const refreshed = await prisma.contentEntry.findUniqueOrThrow({ where: { id: entry.id }, include: { owner: { include: { profile: true } }, space: true, attachments: { include: { file: true }, orderBy: { createdAt: "asc" } } } });
  await logAction({ actorId: auth.user.id, action: "content_entry_transcription_appended_api", entityType: "contentEntry", entityId: entry.id, title: `Inhalt per Sprache ergänzt: ${entry.title}`, href: `/content-spaces/${entry.spaceId}/entries/${entry.id}` });
  return NextResponse.json({ ok: true, transcript, text: transcript, item: serializeContentEntry(request, refreshed) });
}
