import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { accessibleOwnerIds, mediaVisibilityScope, type AccessUser } from "@/lib/access";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { currentTenant } from "@/lib/tenancy";

function safeExtension(name: string) {
  const ext = path.extname(name).toLowerCase().replace(/[^a-z0-9.]/g, "");
  return ext.slice(0, 16);
}

function extensionForMime(mimeType: string) {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "video/mp4") return ".mp4";
  if (mimeType === "video/quicktime") return ".mov";
  if (mimeType === "application/pdf") return ".pdf";
  return "";
}

function detectFileType(bytes: Buffer) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mimeType: "image/png", extension: ".png" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: ".jpg" };
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return { mimeType: "image/webp", extension: ".webp" };
  }
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) {
    return { mimeType: "image/gif", extension: ".gif" };
  }
  if (bytes.length >= 8 && bytes.subarray(4, 8).toString("ascii") === "ftyp") {
    return { mimeType: "video/mp4", extension: ".mp4" };
  }
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-") {
    return { mimeType: "application/pdf", extension: ".pdf" };
  }
  return null;
}

function normalizeOriginalName(name: string, extension: string) {
  const fallback = name.trim() || `datei${extension}`;
  if (!extension) return fallback;
  const current = safeExtension(fallback);
  if (current === extension) return fallback;
  const base = current ? fallback.slice(0, -current.length) : fallback;
  return `${base || "datei"}${extension}`;
}

function fileInfoFromBytes(bytes: Buffer, originalName: string, declaredMimeType?: string | null) {
  const detected = detectFileType(bytes);
  const mimeType = detected?.mimeType || declaredMimeType || "application/octet-stream";
  const extension = detected?.extension || safeExtension(originalName) || extensionForMime(mimeType);
  return {
    mimeType,
    extension,
    originalName: detected ? normalizeOriginalName(originalName, detected.extension) : originalName
  };
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

export async function saveUploadedFile(ownerId: string, file: File | null | undefined, tenantId?: string | null) {
  if (!file || file.size === 0) return null;
  if (file.size > env.maxUploadBytes) throw new Error(`Datei ist größer als ${Math.round(env.maxUploadBytes / 1024 / 1024)} MB`);

  const bytes = Buffer.from(await file.arrayBuffer());
  const fileInfo = fileInfoFromBytes(bytes, file.name || "", file.type);
  const id = randomUUID();
  const relativeDir = path.join(ownerId, new Date().toISOString().slice(0, 10));
  const filename = `${id}${fileInfo.extension}`;
  const relativePath = path.join(relativeDir, filename);
  const absoluteDir = storageAbsolutePath(relativeDir);
  const absolutePath = storageAbsolutePath(relativePath);

  await mkdir(absoluteDir, { recursive: true });
  await writeFile(absolutePath, bytes, { mode: 0o600 });

  const asset = await prisma.fileAsset.create({
    data: {
      tenantId: tenantId || (await currentTenant()).id,
      ownerId,
      originalName: fileInfo.originalName || filename,
      mimeType: fileInfo.mimeType,
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
  mimeType,
  tenantId
}: {
  ownerId: string;
  bytes: Buffer;
  originalName: string;
  mimeType: string;
  tenantId?: string | null;
}) {
  if (!bytes.length) return null;
  if (bytes.length > env.maxUploadBytes) throw new Error(`Datei ist größer als ${Math.round(env.maxUploadBytes / 1024 / 1024)} MB`);

  const fileInfo = fileInfoFromBytes(bytes, originalName, mimeType);
  const id = randomUUID();
  const relativeDir = path.join(ownerId, new Date().toISOString().slice(0, 10));
  const filename = `${id}${fileInfo.extension}`;
  const relativePath = path.join(relativeDir, filename);
  const absoluteDir = storageAbsolutePath(relativeDir);
  const absolutePath = storageAbsolutePath(relativePath);

  await mkdir(absoluteDir, { recursive: true });
  await writeFile(absolutePath, bytes, { mode: 0o600 });

  return prisma.fileAsset.create({
    data: {
      tenantId: tenantId || (await currentTenant()).id,
      ownerId,
      originalName: fileInfo.originalName,
      mimeType: fileInfo.mimeType,
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
  const ownerIds = await accessibleOwnerIds(user);
  const tenantScope = user.tenantId ? { tenantId: user.tenantId } : {};
  const asset = await prisma.fileAsset.findFirst({ where: { id, ...tenantScope, ownerId: { in: ownerIds } } });
  if (asset) return asset;

  const sharedAsset = await prisma.fileAsset.findFirst({ where: { id, ...tenantScope } });
  if (!sharedAsset) return null;
  const visibleMedia = await prisma.media.findFirst({
    where: {
      ...(await mediaVisibilityScope(user)),
      url: assetUrl(id)
    },
    select: { id: true }
  });
  if (visibleMedia) return sharedAsset;

  const visibleActivityImage = await prisma.activityImage.findFirst({
    where: {
      fileId: id,
      activity: { ...tenantScope, ownerId: { in: ownerIds } }
    },
    select: { id: true }
  });
  if (visibleActivityImage) return sharedAsset;

  const visibleChatMessage = await prisma.circleChatMessage.findFirst({
    where: {
      fileId: id,
      deletedAt: null,
      ...(user.tenantId ? { tenantId: user.tenantId } : {}),
      ...(user.role === "ADMIN" || user.role === "SUPER_ADMIN"
        ? {}
        : user.circleId ? { circleId: user.circleId } : { senderId: user.id })
    },
    select: { id: true }
  });
  return visibleChatMessage ? sharedAsset : null;
}

export function absolutePathForAsset(storagePath: string) {
  return storageAbsolutePath(storagePath);
}
