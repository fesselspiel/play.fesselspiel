import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import { decryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { createWikiRevision, uniqueWikiSlug, wikiEditablePage, wikiOwnerSlug } from "@/lib/wiki";

export const runtime = "nodejs";

function text(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function visibility(value: string) {
  return value === "PARTNER" || value === "SHARED" ? value : "PRIVATE";
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

function serializePage(page: NonNullable<Awaited<ReturnType<typeof prisma.wikiPage.findUnique>>>, ownerSlug: string) {
  return {
    id: page.id,
    title: page.title,
    slug: page.slug,
    ownerSlug,
    path: `/wiki/${ownerSlug}/${page.slug}`,
    href: `/wiki/${ownerSlug}/${page.slug}`,
    content: page.content,
    visibility: page.visibility,
    calendarDate: page.createdAt.toISOString(),
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString()
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "wiki");
  if (blocked) return blocked;

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ ok: false, error: "invalid_multipart", message: "multipart/form-data erwartet" }, { status: 400 });
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return NextResponse.json({ ok: false, error: "file_required", message: "Audiodatei fehlt" }, { status: 400 });

  const apiKey = await openAiKeyForUser(auth.user);
  if (!apiKey) return NextResponse.json({ ok: false, error: "openai_key_missing", message: "OpenAI API-Key fehlt" }, { status: 400 });

  const mode = text(formData.get("mode")) === "append" ? "append" : "create";
  const keepAudio = ["1", "true", "yes", "on"].includes(text(formData.get("keepAudio")).toLowerCase());
  const audio = new File([await file.arrayBuffer()], file.name || "audio.m4a", { type: file.type || "audio/mp4" });
  let transcript = "";
  try {
    const client = new OpenAI({ apiKey });
    const result = await client.audio.transcriptions.create({
      file: audio,
      model: env.openAiTranscriptionModel
    });
    transcript = String(result.text || "").trim();
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: "transcription_failed",
      message: "Audio konnte nicht transkribiert werden",
      detail: error instanceof Error ? error.message : String(error)
    }, { status: 502 });
  }
  if (!transcript) return NextResponse.json({ ok: false, error: "empty_transcription", message: "Die Transkription war leer" }, { status: 422 });

  const insertAt = text(formData.get("insertAt")) || "append";
  let pageId = text(formData.get("pageId"));
  let page;
  if (mode === "append") {
    if (!pageId) return NextResponse.json({ ok: false, error: "pageId_required", message: "pageId fehlt für append" }, { status: 400 });
    const existing = await wikiEditablePage(auth.user, pageId);
    if (!existing) return NextResponse.json({ ok: false, error: "not_found", message: "Wiki-Seite nicht gefunden" }, { status: 404 });
    const separator = existing.content.trim() ? "\n\n" : "";
    page = await prisma.wikiPage.update({
      where: { id: existing.id },
      data: {
        content: insertAt === "prepend"
          ? `${transcript}${separator}${existing.content}`.trim()
          : `${existing.content}${separator}${transcript}`.trim()
      },
      include: { owner: { include: { profile: true } }, images: { include: { file: true }, orderBy: { createdAt: "asc" } } }
    });
  } else {
    const title = text(formData.get("title")) || transcript.split(/\s+/).slice(0, 6).join(" ") || "Neuer Tagebucheintrag";
    const slug = await uniqueWikiSlug(auth.user.id, auth.user.tenantId, title, title);
    page = await prisma.wikiPage.create({
      data: {
        tenantId: auth.user.tenantId || undefined,
        ownerId: auth.user.id,
        title,
        slug,
        content: transcript,
        visibility: visibility(text(formData.get("visibility")))
      },
      include: { owner: { include: { profile: true } }, images: { include: { file: true }, orderBy: { createdAt: "asc" } } }
    });
  }
  pageId = page.id;

  let audioAttachment = null;
  if (keepAudio) {
    const asset = await saveUploadedFile(page.ownerId, file, auth.user.tenantId);
    if (asset) {
      const attachment = await prisma.wikiPageImage.create({
        data: { pageId, fileId: asset.id, title: file.name || "Transkript-Audio" },
        include: { file: true }
      });
      audioAttachment = {
        id: attachment.id,
        fileId: attachment.fileId,
        title: attachment.title,
        url: `/api/external/files/${attachment.fileId}`,
        mimeType: attachment.file.mimeType,
        createdAt: attachment.createdAt.toISOString()
      };
    }
  }

  await createWikiRevision(pageId, auth.user.id, mode === "append" ? "transcribed_appended_api" : "transcribed_created_api");
  await logAction({
    actorId: auth.user.id,
    action: mode === "append" ? "wiki_transcription_appended_api" : "wiki_transcription_created_api",
    entityType: "wikiPage",
    entityId: pageId,
    title: `Wiki per Audio ergänzt: ${page.title}`,
    href: `/wiki/${wikiOwnerSlug(page.owner)}/${page.slug}`,
    details: { mode, keepAudio, audioAttachmentId: audioAttachment?.id || null }
  });

  const refreshed = await prisma.wikiPage.findUnique({
    where: { id: pageId },
    include: { owner: { include: { profile: true } }, images: { include: { file: true }, orderBy: { createdAt: "asc" } } }
  });
  if (!refreshed) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const ownerSlug = wikiOwnerSlug(refreshed.owner);
  const item = {
    ...serializePage(refreshed, ownerSlug),
    images: refreshed.images.map((entry) => ({
      id: entry.id,
      fileId: entry.fileId,
      title: entry.title,
      url: `/api/external/files/${entry.fileId}`,
      mimeType: entry.file.mimeType,
      createdAt: entry.createdAt.toISOString()
    }))
  };
  return NextResponse.json({ ok: true, item, page: item, transcript, audioAttachment });
}
