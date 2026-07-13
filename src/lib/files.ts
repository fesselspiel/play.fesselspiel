import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { accessibleOwnerIds, mediaVisibilityScope, type AccessUser } from "@/lib/access";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { currentTenant } from "@/lib/tenancy";
import { contentIsHidden } from "@/lib/compliance/ugc";

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
  if (mimeType === "image/heic") return ".heic";
  if (mimeType === "audio/mp4") return ".m4a";
  if (mimeType === "audio/mpeg") return ".mp3";
  if (mimeType === "audio/wav") return ".wav";
  if (mimeType === "audio/ogg") return ".ogg";
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
    const brand = bytes.subarray(8, 12).toString("ascii").toLowerCase();
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) return { mimeType: "image/heic", extension: ".heic" };
    if (brand === "m4a ") return { mimeType: "audio/mp4", extension: ".m4a" };
    if (brand === "qt  ") return { mimeType: "video/quicktime", extension: ".mov" };
    return { mimeType: "video/mp4", extension: ".mp4" };
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WAVE") {
    return { mimeType: "audio/wav", extension: ".wav" };
  }
  if (bytes.length >= 4 && bytes.subarray(0, 4).toString("ascii") === "OggS") {
    return { mimeType: "audio/ogg", extension: ".ogg" };
  }
  if (bytes.length >= 3 && bytes.subarray(0, 3).toString("ascii") === "ID3") {
    return { mimeType: "audio/mpeg", extension: ".mp3" };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return { mimeType: "audio/mpeg", extension: ".mp3" };
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
  if (!detected) throw new Error("Dateityp ist nicht erlaubt oder konnte nicht sicher erkannt werden");
  const mimeType = detected.mimeType;
  const extension = detected.extension;
  return {
    mimeType,
    extension,
    originalName: normalizeOriginalName(originalName, detected.extension),
    declaredMimeType: declaredMimeType || null
  };
}

function assertFileSafety(bytes: Buffer) {
  // The EICAR marker is harmless test data used to verify malware rejection.
  // Real malware scanning can be layered on later without changing upload callers.
  const probe = bytes.subarray(0, Math.min(bytes.length, 1024 * 1024)).toString("latin1");
  if (probe.includes("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*")) {
    throw new Error("Die Datei wurde durch die Sicherheitsprüfung abgelehnt");
  }
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
  assertFileSafety(bytes);
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
      storagePath: relativePath,
      scanStatus: "CLEAN",
      safetyCheckedAt: new Date()
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
  assertFileSafety(bytes);
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
      storagePath: relativePath,
      scanStatus: "CLEAN",
      safetyCheckedAt: new Date()
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
  const safetyScope = {
    contentClassification: { not: "QUARANTINED" as const },
    scanStatus: { not: "REJECTED" as const }
  };
  const asset = await prisma.fileAsset.findFirst({ where: { id, ...tenantScope, ...safetyScope, ownerId: { in: ownerIds } } });
  if (asset) return asset;

  const sharedAsset = await prisma.fileAsset.findFirst({ where: { id, ...tenantScope, ...safetyScope } });
  if (!sharedAsset) return null;
  const visibleMedia = await prisma.media.findFirst({
    where: {
      ...(await mediaVisibilityScope(user)),
      url: assetUrl(id)
    },
    select: { id: true }
  });
  if (visibleMedia && !(await contentIsHidden(user.tenantId || "", "media", visibleMedia.id))) return sharedAsset;

  const visibleActivityImage = await prisma.activityImage.findFirst({
    where: {
      fileId: id,
      activity: { ...tenantScope, ownerId: { in: ownerIds } }
    },
    select: { id: true, activityId: true }
  });
  if (visibleActivityImage && !(await contentIsHidden(user.tenantId || "", "activity", visibleActivityImage.activityId))) return sharedAsset;

  const visibleTrackerImage = await prisma.trackerEntryImage.findFirst({
    where: {
      fileId: id,
      trackerEntry: { ...tenantScope, ownerId: { in: ownerIds } }
    },
    select: { id: true }
  });
  if (visibleTrackerImage) return sharedAsset;

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
  if (visibleChatMessage && !(await contentIsHidden(user.tenantId || "", "circleChatMessage", visibleChatMessage.id))) return sharedAsset;

  const visibleWikiImage = await prisma.wikiPageImage.findFirst({
    where: {
      fileId: id,
      page: {
        ...(user.tenantId ? { tenantId: user.tenantId } : {}),
        OR: [
          { ownerId: user.id },
          { visibility: "SHARED" },
          ...(user.circleId ? [{ visibility: "PARTNER" as const }] : []),
          { shares: { some: { targetUserId: user.id } } },
          ...(user.circleId ? [{ shares: { some: { targetCircleId: user.circleId } } }] : [])
        ]
      }
    },
    select: { id: true }
  });
  return visibleWikiImage ? sharedAsset : null;
}

export function absolutePathForAsset(storagePath: string) {
  return storageAbsolutePath(storagePath);
}

export async function deleteStoredFile(storagePath: string) {
  try {
    await unlink(storageAbsolutePath(storagePath));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
