"use server";

import { redirect } from "next/navigation";
import { logAction } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { requireFeature } from "@/lib/features";
import { fileIdFromUrl, saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { createWikiRevision, uniqueWikiSlug, wikiEditablePage, wikiOwnerSlug } from "@/lib/wiki";

function visibilityFromForm(value: FormDataEntryValue | null) {
  const raw = String(value || "PRIVATE");
  return raw === "PARTNER" || raw === "SHARED" ? raw : "PRIVATE";
}

async function selectedIds(formData: FormData, key: string) {
  return formData.getAll(key).map(String).filter(Boolean);
}

async function updateShares(pageId: string, formData: FormData) {
  const userIds = await selectedIds(formData, "shareUsers");
  const circleIds = await selectedIds(formData, "shareCircles");
  await prisma.wikiPageShare.deleteMany({ where: { pageId } });
  await prisma.wikiPageShare.createMany({
    data: [
      ...userIds.map((targetUserId) => ({ pageId, targetUserId })),
      ...circleIds.map((targetCircleId) => ({ pageId, targetCircleId }))
    ],
    skipDuplicates: true
  });
}

async function attachWikiImage(pageId: string, userId: string, formData: FormData) {
  const uploadedImageUrl = String(formData.get("imageUploadedUrl") || "").trim();
  const uploadedFileId = fileIdFromUrl(uploadedImageUrl);
  const fallbackFile = uploadedFileId ? null : await saveUploadedFile(userId, formData.get("image") as File | null);
  const fileId = uploadedFileId || fallbackFile?.id;
  if (!fileId) return;
  await prisma.wikiPageImage.create({
    data: {
      pageId,
      fileId,
      title: String(formData.get("title") || "Wiki-Bild").trim()
    }
  });
}

export async function createWikiPage(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("wiki");
  const title = String(formData.get("title") || "").trim();
  if (!title) redirect("/wiki/new");
  const slug = await uniqueWikiSlug(user.id, user.tenantId, title, title);
  const page = await prisma.wikiPage.create({
    data: {
      tenantId: user.tenantId || undefined,
      ownerId: user.id,
      title,
      slug,
      summary: String(formData.get("summary") || "").trim(),
      content: String(formData.get("content") || "").trim(),
      visibility: visibilityFromForm(formData.get("visibility"))
    }
  });
  await updateShares(page.id, formData);
  await attachWikiImage(page.id, user.id, formData);
  await createWikiRevision(page.id, user.id, "created");
  await logAction({
    actorId: user.id,
    action: "wiki_page_created",
    entityType: "wikiPage",
    entityId: page.id,
    title: `Wiki-Seite angelegt: ${page.title}`,
    href: `/wiki/${wikiOwnerSlug(user)}/${page.slug}`
  });
  redirect(`/wiki/${wikiOwnerSlug(user)}/${page.slug}`);
}

export async function updateWikiPage(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("wiki");
  const id = String(formData.get("id") || "");
  const page = await wikiEditablePage(user, id);
  if (!page) redirect("/wiki");
  const title = String(formData.get("title") || "").trim() || page.title;
  const slug = await uniqueWikiSlug(page.ownerId, user.tenantId, title, title, page.id);
  const updated = await prisma.wikiPage.update({
    where: { id: page.id },
    data: {
      title,
      slug,
      summary: String(formData.get("summary") || "").trim(),
      content: String(formData.get("content") || "").trim(),
      visibility: visibilityFromForm(formData.get("visibility"))
    },
    include: { owner: { include: { profile: true } } }
  });
  await updateShares(page.id, formData);
  await attachWikiImage(page.id, user.id, formData);
  await createWikiRevision(updated.id, user.id, "updated");
  await logAction({
    actorId: user.id,
    action: "wiki_page_updated",
    entityType: "wikiPage",
    entityId: page.id,
    title: `Wiki-Seite geändert: ${updated.title}`,
    href: `/wiki/${wikiOwnerSlug(updated.owner)}/${updated.slug}`
  });
  redirect(`/wiki/${wikiOwnerSlug(updated.owner)}/${updated.slug}`);
}

export async function importWikiPage(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("wiki");
  const id = String(formData.get("id") || "");
  const page = await wikiEditablePage(user, id);
  if (!page) redirect("/wiki");
  const file = formData.get("wikiFile") as File | null;
  const fileText = file && file.size > 0 ? await file.text() : "";
  const text = fileText || String(formData.get("wikiText") || "");
  if (!text.trim()) redirect(`/wiki/${wikiOwnerSlug(page.owner)}/${page.slug}`);
  const withoutTopTitle = text.replace(/^=\s+[^=\n]+?\s+=\s*/m, "").replace(/<!--\s*summary:[\s\S]*?-->\s*/m, "").trim();
  await prisma.wikiPage.update({ where: { id: page.id }, data: { content: withoutTopTitle } });
  await createWikiRevision(page.id, user.id, "imported");
  await logAction({
    actorId: user.id,
    action: "wiki_page_imported",
    entityType: "wikiPage",
    entityId: page.id,
    title: `Wiki-Seite importiert: ${page.title}`,
    href: `/wiki/${wikiOwnerSlug(page.owner)}/${page.slug}`
  });
  redirect(`/wiki/${wikiOwnerSlug(page.owner)}/${page.slug}`);
}

export async function deleteWikiPage(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("wiki");
  const id = String(formData.get("id") || "");
  const page = await wikiEditablePage(user, id);
  if (!page) redirect("/wiki");
  await prisma.wikiPage.delete({ where: { id: page.id } });
  await logAction({
    actorId: user.id,
    action: "wiki_page_deleted",
    entityType: "wikiPage",
    entityId: page.id,
    title: `Wiki-Seite gelöscht: ${page.title}`,
    href: "/wiki"
  });
  redirect("/wiki");
}
