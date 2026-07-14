import { NextRequest, NextResponse } from "next/server";
import { DELETE as deleteWikiAttachment } from "@/app/api/external/wiki/[id]/attachments/[attachmentId]/route";
import { logAction } from "@/lib/audit";
import {
  canEditContentEntry,
  contentEntryAccess,
  LEGACY_WIKI_SPACE_ID,
  parseEntryId
} from "@/lib/content-spaces";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { deleteOwnedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest, props: { params: Promise<{ spaceId: string; entryId: string; attachmentId: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "wiki");
  if (blocked) return blocked;

  const parsed = parseEntryId(params.entryId);
  if (params.spaceId === LEGACY_WIKI_SPACE_ID || parsed.type === "wiki") {
    return deleteWikiAttachment(request, { params: Promise.resolve({ id: parsed.id, attachmentId: params.attachmentId }) });
  }
  if (parsed.type !== "content") return NextResponse.json({ ok: false, error: "attachment_not_supported" }, { status: 409 });

  const resolved = await contentEntryAccess(auth.user, params.spaceId, parsed.id);
  if (!resolved || !canEditContentEntry(auth.user, resolved.entry, resolved.space)) {
    return NextResponse.json({ ok: false, error: "not_found_or_readonly" }, { status: 404 });
  }
  const attachment = await prisma.contentEntryAttachment.findFirst({ where: { id: params.attachmentId, entryId: resolved.entry.id }, include: { file: true } });
  if (!attachment) return NextResponse.json({ ok: false, error: "attachment_not_found" }, { status: 404 });
  await prisma.contentEntryAttachment.delete({ where: { id: attachment.id } });
  await deleteOwnedFile(attachment.file.ownerId, attachment.fileId).catch(() => false);
  await logAction({ actorId: auth.user.id, action: "content_entry_attachment_deleted_api", entityType: "contentEntry", entityId: resolved.entry.id, title: `Anlage entfernt: ${resolved.entry.title}`, href: `/content-spaces/${resolved.entry.spaceId}/entries/${resolved.entry.id}` });
  return NextResponse.json({ ok: true, id: attachment.id });
}
