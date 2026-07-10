import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { findExternalSession, serializeExternalSession } from "../../_helpers";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "activities");
  if (blocked) return blocked;
  const session = await findExternalSession(auth.user, params.id);
  if (!session) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (session.ownerId !== auth.user.id && auth.user.role !== "ADMIN" && auth.user.role !== "SUPER_ADMIN") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file") as File | null;
  const asset = await saveUploadedFile(session.ownerId, file, auth.user.tenantId);
  if (!asset) return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  const image = await prisma.activityImage.create({
    data: {
      activityId: session.id,
      fileId: asset.id,
      title: String(formData?.get("title") || asset.originalName || session.title).trim()
    }
  });
  await logAction({ actorId: auth.user.id, action: "activity_session_image_uploaded_api", entityType: "activity", entityId: session.id, title: `Bild per API zur Session hochgeladen: ${session.title}`, href: `/activities/${session.slug}`, details: { imageId: image.id, fileId: asset.id } });
  const updated = await findExternalSession(auth.user, session.id);
  return NextResponse.json({ ok: true, imageId: image.id, item: updated ? serializeExternalSession(request, updated, auth.user.id) : null }, { status: 201 });
}
