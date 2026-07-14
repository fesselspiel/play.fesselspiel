import { NextRequest, NextResponse } from "next/server";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { activityInclude, serializeActivity } from "@/lib/external-mobile-serializers";
import { fileAssetUrl, saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function findIdea(user: any, id: string) {
  return prisma.activityPlan.findFirst({ where: { ...(await ownerScope(user)), OR: [{ id }, { slug: id }], category: "IDEA_COLLECTION" }, include: activityInclude });
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
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
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file") as File | null;
  const asset = await saveUploadedFile(idea.ownerId, file, auth.user.tenantId);
  if (!asset) return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  const image = await prisma.activityImage.create({
    data: {
      activityId: idea.id,
      fileId: asset.id,
      title: String(formData?.get("title") || asset.originalName || idea.title).trim()
    },
    include: { file: true }
  });
  await logAction({ actorId: auth.user.id, action: "idea_image_uploaded_api", entityType: "activity", entityId: idea.id, title: `Bild per API zur Idee hinzugefügt: ${idea.title}`, href: `/ideas/${idea.slug}`, details: { imageId: image.id, fileId: asset.id } });
  const updated = await findIdea(auth.user, idea.id);
  return NextResponse.json({
    ok: true,
    image: {
      id: image.id,
      fileId: image.fileId,
      title: image.title,
      url: `/api/external/files/${image.fileId}`,
      protectedUrl: fileAssetUrl(image.fileId),
      mimeType: image.file.mimeType,
      createdAt: image.createdAt.toISOString()
    },
    item: updated ? serializeActivity(request, updated) : null
  }, { status: 201 });
}
