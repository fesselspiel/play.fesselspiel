import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { accessibleOwnerIds, mediaVisibilityScope, type AccessUser } from "@/lib/access";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

function safeExtension(name: string) {
  const ext = path.extname(name).toLowerCase().replace(/[^a-z0-9.]/g, "");
  return ext.slice(0, 16);
}

function assetUrl(id: string) {
  return `/api/files/${id}`;
}

function storageRoot() {
  return path.resolve(env.uploadPath);
}

function storageAbsolutePath(storagePath: string) {
  const absolute = path.resolve(storageRoot(), storagePath);
  if (!absolute.startsWith(`${storageRoot()}${path.sep}`)) throw new Error("Ungültiger Dateipfad");
  return absolute;
}

export function fileAssetUrl(id: string) {
  return assetUrl(id);
}

export function fileIdFromUrl(url?: string | null) {
  const match = String(url || "").match(/^\/api\/files\/([^/?#]+)$/);
  return match?.[1] || null;
}

export async function saveUploadedFile(ownerId: string, file: File | null | undefined) {
  if (!file || file.size === 0) return null;
  if (file.size > env.maxUploadBytes) throw new Error(`Datei ist größer als ${Math.round(env.maxUploadBytes / 1024 / 1024)} MB`);

  const id = randomUUID();
  const extension = safeExtension(file.name);
  const relativeDir = path.join(ownerId, new Date().toISOString().slice(0, 10));
  const filename = `${id}${extension}`;
  const relativePath = path.join(relativeDir, filename);
  const absoluteDir = storageAbsolutePath(relativeDir);
  const absolutePath = storageAbsolutePath(relativePath);

  await mkdir(absoluteDir, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(absolutePath, bytes, { mode: 0o600 });

  const asset = await prisma.fileAsset.create({
    data: {
      ownerId,
      originalName: file.name || filename,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      storagePath: relativePath
    }
  });
  return asset;
}

export async function saveFileBuffer({
  ownerId,
  bytes,
  originalName,
  mimeType
}: {
  ownerId: string;
  bytes: Buffer;
  originalName: string;
  mimeType: string;
}) {
  if (!bytes.length) return null;
  if (bytes.length > env.maxUploadBytes) throw new Error(`Datei ist größer als ${Math.round(env.maxUploadBytes / 1024 / 1024)} MB`);

  const id = randomUUID();
  const extension = safeExtension(originalName);
  const relativeDir = path.join(ownerId, new Date().toISOString().slice(0, 10));
  const filename = `${id}${extension}`;
  const relativePath = path.join(relativeDir, filename);
  const absoluteDir = storageAbsolutePath(relativeDir);
  const absolutePath = storageAbsolutePath(relativePath);

  await mkdir(absoluteDir, { recursive: true });
  await writeFile(absolutePath, bytes, { mode: 0o600 });

  return prisma.fileAsset.create({
    data: {
      ownerId,
      originalName,
      mimeType,
      sizeBytes: bytes.length,
      storagePath: relativePath
    }
  });
}

export async function deleteOwnedFile(ownerId: string, id: string) {
  const asset = await prisma.fileAsset.findFirst({ where: { id, ownerId } });
  if (!asset) return false;
  await prisma.fileAsset.delete({ where: { id: asset.id } });
  try {
    await unlink(storageAbsolutePath(asset.storagePath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return true;
}

export async function fileAssetForUser(ownerId: string, id: string) {
  return prisma.fileAsset.findFirst({ where: { id, ownerId } });
}

export async function fileAssetForAccess(user: AccessUser, id: string) {
  const asset = await prisma.fileAsset.findFirst({ where: { id, ownerId: { in: await accessibleOwnerIds(user) } } });
  if (asset) return asset;

  const sharedAsset = await prisma.fileAsset.findUnique({ where: { id } });
  if (!sharedAsset) return null;
  const visibleMedia = await prisma.media.findFirst({
    where: {
      ...(await mediaVisibilityScope(user)),
      url: assetUrl(id)
    },
    select: { id: true }
  });
  return visibleMedia ? sharedAsset : null;
}

export function absolutePathForAsset(storagePath: string) {
  return storageAbsolutePath(storagePath);
}
