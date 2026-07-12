import { NextRequest, NextResponse } from "next/server";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { serializeFileImage } from "@/lib/external-mobile-serializers";
import { saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function findEntry(user: any, id: string) {
  return prisma.trackerEntry.findFirst({
    where: { ...(await ownerScope(user)), OR: [{ id }, { slug: id }], trackerType: { enabled: true } },
    include: { trackerType: true }
  });
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

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers");
  if (blocked) return blocked;
  const entry = await findEntry(auth.user, params.id);
  if (!entry) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const images = await prisma.trackerEntryImage.findMany({
    where: { trackerEntryId: entry.id },
    include: { file: true },
    orderBy: { createdAt: "asc" }
  });
  return NextResponse.json({ ok: true, count: images.length, items: images.map((image) => imageItem(request, image)) });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers");
  if (blocked) return blocked;
  const entry = await findEntry(auth.user, params.id);
  if (!entry) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (entry.ownerId !== auth.user.id && auth.user.role !== "ADMIN" && auth.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file") as File | null;
  const asset = await saveUploadedFile(entry.ownerId, file, auth.user.tenantId);
  if (!asset) return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  const image = await prisma.trackerEntryImage.create({
    data: {
      tenantId: entry.tenantId || auth.user.tenantId || null,
      trackerEntryId: entry.id,
      fileId: asset.id,
      title: String(formData?.get("title") || asset.originalName || entry.title || entry.trackerType.title).trim(),
      note: String(formData?.get("note") || "").trim() || null
    },
    include: { file: true }
  });
  await logAction({
    actorId: auth.user.id,
    action: `tracker_${entry.trackerType.key}_image_uploaded_api`,
    entityType: "trackerEntry",
    entityId: entry.id,
    title: `Foto per API zum Tracker hinzugefügt: ${entry.title || entry.trackerType.title}`,
    href: `/trackers/${entry.trackerType.key}/${entry.slug || entry.id}`,
    details: { imageId: image.id, fileId: asset.id }
  });
  return NextResponse.json({ ok: true, image: imageItem(request, image), item: imageItem(request, image) }, { status: 201 });
}
