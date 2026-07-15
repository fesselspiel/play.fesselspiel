import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import {
  canEditContentEntry,
  contentEntryAccess,
  serializeContentEntry
} from "@/lib/content-spaces";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: NextRequest, props: { params: Promise<{ spaceId: string; entryId: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "wiki");
  if (blocked) return blocked;

  const resolved = await contentEntryAccess(auth.user, params.spaceId, params.entryId);
  if (!resolved || !canEditContentEntry(auth.user, resolved.entry, resolved.space)) {
    return NextResponse.json({ ok: false, error: "not_found_or_readonly" }, { status: 404 });
  }
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file") as File | null;
  const asset = await saveUploadedFile(resolved.entry.ownerId, file, auth.user.tenantId);
  if (!asset) return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  await prisma.contentEntryAttachment.create({
    data: {
      tenantId: auth.user.tenantId || undefined,
      ownerId: resolved.entry.ownerId,
      entryId: resolved.entry.id,
      fileId: asset.id,
      title: String(formData?.get("title") || asset.originalName || resolved.entry.title).trim()
    }
  });
  const updated = await prisma.contentEntry.findUniqueOrThrow({
    where: { id: resolved.entry.id },
    include: { owner: { include: { profile: true } }, space: true, attachments: { include: { file: true }, orderBy: { createdAt: "asc" } } }
  });
  await logAction({ actorId: auth.user.id, action: "content_entry_attachment_added_api", entityType: "contentEntry", entityId: updated.id, title: `Anlage hinzugefügt: ${updated.title}`, href: `/content-spaces/${updated.spaceId}/entries/${updated.id}` });
  return NextResponse.json({ ok: true, item: serializeContentEntry(request, updated, auth.user) }, { status: 201 });
}
