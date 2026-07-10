import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { deleteOwnedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { findExternalSession, serializeExternalSession } from "../../../_helpers";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest, { params }: { params: { id: string; imageId: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "activities");
  if (blocked) return blocked;
  const session = await findExternalSession(auth.user, params.id);
  if (!session) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (session.ownerId !== auth.user.id && auth.user.role !== "ADMIN" && auth.user.role !== "SUPER_ADMIN") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const image = await prisma.activityImage.findFirst({ where: { id: params.imageId, activityId: session.id }, include: { file: true } });
  if (!image) return NextResponse.json({ ok: false, error: "image_not_found" }, { status: 404 });
  await prisma.activityImage.delete({ where: { id: image.id } });
  await deleteOwnedFile(image.file.ownerId, image.fileId).catch(() => false);
  await logAction({ actorId: auth.user.id, action: "activity_session_image_deleted_api", entityType: "activity", entityId: session.id, title: `Bild per API von Session gelöscht: ${session.title}`, href: `/activities/${session.slug}`, details: { imageId: image.id, fileId: image.fileId } });
  const updated = await findExternalSession(auth.user, session.id);
  return NextResponse.json({ ok: true, id: image.id, item: updated ? serializeExternalSession(request, updated, auth.user.id) : null });
}
