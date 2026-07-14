import { NextRequest, NextResponse } from "next/server";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { serializeFileImage } from "@/lib/external-mobile-serializers";
import { deleteOwnedFile, saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function findImage(user: any, entryId: string, imageId: string) {
  return prisma.trackerEntryImage.findFirst({
    where: {
      id: imageId,
      trackerEntry: { ...(await ownerScope(user)), OR: [{ id: entryId }, { slug: entryId }], trackerType: { enabled: true } }
    },
    include: { file: true, trackerEntry: { include: { trackerType: true } } }
  });
}

function canEdit(user: any, ownerId: string) {
  return ownerId === user.id || user.role === "ADMIN" || user.role === "SUPER_ADMIN";
}

function imageItem(request: NextRequest, image: {
  id: string;
  fileId: string;
  title: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  file: { mimeType: string; sizeBytes: number };
}) {
  return {
    ...serializeFileImage(request, {
      id: image.id,
      fileId: image.fileId,
      title: image.title,
      createdAt: image.createdAt
    }),
    note: image.note,
    mimeType: image.file.mimeType,
    sizeBytes: image.file.sizeBytes,
    updatedAt: image.updatedAt.toISOString()
  };
}

async function payload(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData().catch(() => null);
    return { formData, body: formData ? Object.fromEntries(formData.entries()) as Record<string, unknown> : {} };
  }
  return { formData: null, body: await request.json().catch(() => ({})) as Record<string, unknown> };
}

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string; imageId: string }> }
) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers");
  if (blocked) return blocked;
  const image = await findImage(auth.user, params.id, params.imageId);
  if (!image) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, image: imageItem(request, image), item: imageItem(request, image) });
}

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string; imageId: string }> }
) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers");
  if (blocked) return blocked;
  const existing = await findImage(auth.user, params.id, params.imageId);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (!canEdit(auth.user, existing.trackerEntry.ownerId)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { formData, body } = await payload(request);
  const file = formData?.get("file") as File | null;
  const nextAsset = file ? await saveUploadedFile(existing.trackerEntry.ownerId, file, auth.user.tenantId) : null;
  const titleValue = body.title === undefined ? undefined : String(body.title || "").trim();
  const noteValue = body.note === undefined ? undefined : String(body.note || "").trim();
  const updated = await prisma.trackerEntryImage.update({
    where: { id: existing.id },
    data: {
      ...(titleValue !== undefined ? { title: titleValue || null } : {}),
      ...(noteValue !== undefined ? { note: noteValue || null } : {}),
      ...(nextAsset ? { fileId: nextAsset.id } : {})
    },
    include: { file: true, trackerEntry: { include: { trackerType: true } } }
  });
  if (nextAsset) await deleteOwnedFile(existing.trackerEntry.ownerId, existing.fileId).catch(() => false);
  await logAction({
    actorId: auth.user.id,
    action: `tracker_${existing.trackerEntry.trackerType.key}_image_updated_api`,
    entityType: "trackerEntry",
    entityId: existing.trackerEntry.id,
    title: `Tracker-Foto per API geändert: ${existing.trackerEntry.title || existing.trackerEntry.trackerType.title}`,
    href: `/trackers/${existing.trackerEntry.trackerType.key}/${existing.trackerEntry.slug || existing.trackerEntry.id}`,
    details: { imageId: updated.id, fileId: updated.fileId, replacedFile: Boolean(nextAsset) }
  });
  return NextResponse.json({ ok: true, image: imageItem(request, updated), item: imageItem(request, updated) });
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string; imageId: string }> }
) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers");
  if (blocked) return blocked;
  const existing = await findImage(auth.user, params.id, params.imageId);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (!canEdit(auth.user, existing.trackerEntry.ownerId)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  await prisma.trackerEntryImage.delete({ where: { id: existing.id } });
  await deleteOwnedFile(existing.trackerEntry.ownerId, existing.fileId).catch(() => false);
  await logAction({
    actorId: auth.user.id,
    action: `tracker_${existing.trackerEntry.trackerType.key}_image_deleted_api`,
    entityType: "trackerEntry",
    entityId: existing.trackerEntry.id,
    title: `Tracker-Foto per API gelöscht: ${existing.trackerEntry.title || existing.trackerEntry.trackerType.title}`,
    href: `/trackers/${existing.trackerEntry.trackerType.key}/${existing.trackerEntry.slug || existing.trackerEntry.id}`,
    details: { imageId: existing.id, fileId: existing.fileId }
  });
  return NextResponse.json({ ok: true, id: existing.id });
}
