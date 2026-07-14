import { NextRequest, NextResponse } from "next/server";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { activityInclude, serializeActivity } from "@/lib/external-mobile-serializers";
import { deleteOwnedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function findIdea(user: any, id: string) {
  return prisma.activityPlan.findFirst({ where: { ...(await ownerScope(user)), OR: [{ id }, { slug: id }], category: "IDEA_COLLECTION" }, include: activityInclude });
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string; imageId: string }> }
) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "ideas");
  if (blocked) return blocked;
  const idea = await findIdea(auth.user, params.id);
  if (!idea) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (idea.ownerId !== auth.user.id && auth.user.role !== "ADMIN" && auth.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const image = await prisma.activityImage.findFirst({ where: { id: params.imageId, activityId: idea.id }, include: { file: true } });
  if (!image) return NextResponse.json({ ok: false, error: "image_not_found" }, { status: 404 });
  await prisma.activityImage.delete({ where: { id: image.id } });
  await deleteOwnedFile(image.file.ownerId, image.fileId).catch(() => false);
  await logAction({ actorId: auth.user.id, action: "idea_image_deleted_api", entityType: "activity", entityId: idea.id, title: `Bild per API von Idee gelöscht: ${idea.title}`, href: `/ideas/${idea.slug}`, details: { imageId: image.id, fileId: image.fileId } });
  const updated = await findIdea(auth.user, idea.id);
  return NextResponse.json({ ok: true, id: image.id, item: updated ? serializeActivity(request, updated) : null });
}
