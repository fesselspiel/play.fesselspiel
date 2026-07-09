import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { deleteOwnedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { createWikiRevision, wikiEditablePage, wikiOwnerSlug } from "@/lib/wiki";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest, { params }: { params: { id: string; attachmentId: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "wiki");
  if (blocked) return blocked;
  const page = await wikiEditablePage(auth.user, params.id);
  if (!page) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const image = await prisma.wikiPageImage.findFirst({ where: { id: params.attachmentId, pageId: page.id }, include: { file: true } });
  if (!image) return NextResponse.json({ ok: false, error: "attachment_not_found" }, { status: 404 });
  await prisma.wikiPageImage.delete({ where: { id: image.id } });
  await deleteOwnedFile(image.file.ownerId, image.fileId).catch(() => false);
  await createWikiRevision(page.id, auth.user.id, "image_deleted_api");
  await logAction({ actorId: auth.user.id, action: "wiki_image_deleted_api", entityType: "wikiPage", entityId: page.id, title: `Bild per API von Wiki-Seite gelöscht: ${page.title}`, href: `/wiki/${wikiOwnerSlug(page.owner)}/${page.slug}`, details: { imageId: image.id, fileId: image.fileId } });
  return NextResponse.json({ ok: true, id: image.id });
}
