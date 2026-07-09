import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { fileAssetUrl, saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { createWikiRevision, wikiEditablePage, wikiOwnerSlug } from "@/lib/wiki";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "wiki");
  if (blocked) return blocked;
  const page = await wikiEditablePage(auth.user, params.id);
  if (!page) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file") as File | null;
  const asset = await saveUploadedFile(page.ownerId, file, auth.user.tenantId);
  if (!asset) return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  const image = await prisma.wikiPageImage.create({
    data: {
      pageId: page.id,
      fileId: asset.id,
      title: String(formData?.get("title") || asset.originalName || page.title).trim()
    },
    include: { file: true }
  });
  await createWikiRevision(page.id, auth.user.id, "image_added_api");
  await logAction({ actorId: auth.user.id, action: "wiki_image_uploaded_api", entityType: "wikiPage", entityId: page.id, title: `Bild per API zur Wiki-Seite hinzugefügt: ${page.title}`, href: `/wiki/${wikiOwnerSlug(page.owner)}/${page.slug}`, details: { imageId: image.id, fileId: asset.id } });
  const updated = await prisma.wikiPage.findUnique({ where: { id: page.id }, include: { owner: { include: { profile: true } }, images: { include: { file: true }, orderBy: { createdAt: "asc" } } } });
  return NextResponse.json({
    ok: true,
    attachment: {
      id: image.id,
      fileId: image.fileId,
      title: image.title,
      url: `/api/external/files/${image.fileId}`,
      protectedUrl: fileAssetUrl(image.fileId),
      mimeType: image.file.mimeType,
      createdAt: image.createdAt.toISOString()
    },
    item: updated ? {
      id: updated.id,
      title: updated.title,
      slug: updated.slug,
      path: `/wiki/${wikiOwnerSlug(updated.owner)}/${updated.slug}`,
      images: updated.images.map((entry) => ({ id: entry.id, fileId: entry.fileId, title: entry.title, url: `/api/external/files/${entry.fileId}`, protectedUrl: fileAssetUrl(entry.fileId), mimeType: entry.file.mimeType, createdAt: entry.createdAt.toISOString() }))
    } : null
  }, { status: 201 });
}
