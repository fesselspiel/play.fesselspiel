import JSZip from "jszip";
import { readFile } from "fs/promises";
import path from "path";
import { accessibleOwnerIds, type AccessUser } from "@/lib/access";
import { ensureDefaultAlbum } from "@/lib/albums";
import { absolutePathForAsset, fileAssetUrl, fileIdFromUrl, saveFileBuffer } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { uniqueSlug } from "@/lib/slug";
import { uniqueSessionSlug } from "@/lib/session-slug";

type ExportRecord = Record<string, unknown>;

type TransferData = {
  format: "fesselspiel-export";
  version: 1;
  exportedAt: string;
  files: ExportRecord[];
  toys: ExportRecord[];
  positions: ExportRecord[];
  activities: ExportRecord[];
  activityImages: ExportRecord[];
  sessions: ExportRecord[];
  kgSessions: ExportRecord[];
  sessionComments: ExportRecord[];
  albums: ExportRecord[];
  media: ExportRecord[];
  mediaComments: ExportRecord[];
  events: ExportRecord[];
  checkIns: ExportRecord[];
};

function withoutOwner<T extends { ownerId?: string }>(entry: T) {
  const { ownerId: _ownerId, ...rest } = entry;
  return rest;
}

function toDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function rewriteFileUrl(url: unknown, fileMap: Map<string, string>) {
  const fileId = fileIdFromUrl(typeof url === "string" ? url : "");
  if (!fileId) return typeof url === "string" ? url : "";
  const nextId = fileMap.get(fileId);
  return nextId ? fileAssetUrl(nextId) : "";
}

function records(value: unknown): ExportRecord[] {
  return Array.isArray(value) ? value.filter((entry): entry is ExportRecord => Boolean(entry) && typeof entry === "object") : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export async function buildDataExport(user: AccessUser) {
  const ownerIds = await accessibleOwnerIds(user);
  const ownerScope = { ownerId: { in: ownerIds } };
  const [
    files,
    toys,
    positions,
    activities,
    activityImages,
    sessions,
    kgSessions,
    sessionComments,
    albums,
    media,
    mediaComments,
    events,
    checkIns
  ] = await Promise.all([
    prisma.fileAsset.findMany({ where: ownerScope, orderBy: { createdAt: "asc" } }),
    prisma.toy.findMany({ where: ownerScope, orderBy: { createdAt: "asc" } }),
    prisma.position.findMany({ where: ownerScope, include: { tools: { select: { id: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.activityPlan.findMany({ where: ownerScope, include: { tools: { select: { id: true } }, positions: { select: { id: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.activityImage.findMany({ where: { activity: { ownerId: { in: ownerIds } } }, orderBy: { createdAt: "asc" } }),
    prisma.segufixSession.findMany({ where: ownerScope, orderBy: { startTime: "asc" } }),
    prisma.kgSession.findMany({ where: ownerScope, orderBy: { startTime: "asc" } }),
    prisma.sessionComment.findMany({ where: { ownerId: { in: ownerIds } }, orderBy: { createdAt: "asc" } }),
    prisma.album.findMany({ where: ownerScope, orderBy: { createdAt: "asc" } }),
    prisma.media.findMany({ where: ownerScope, orderBy: { createdAt: "asc" } }),
    prisma.mediaComment.findMany({ where: { ownerId: { in: ownerIds } }, orderBy: { createdAt: "asc" } }),
    prisma.event.findMany({ where: ownerScope, orderBy: { startsAt: "asc" } }),
    prisma.checkIn.findMany({ where: { userId: { in: ownerIds } }, orderBy: { createdAt: "asc" } })
  ]);

  const data: TransferData = {
    format: "fesselspiel-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    files: files.map((entry) => ({
      id: entry.id,
      originalName: entry.originalName,
      mimeType: entry.mimeType,
      sizeBytes: entry.sizeBytes,
      createdAt: entry.createdAt
    })),
    toys: toys.map(withoutOwner),
    positions: positions.map((entry) => ({
      ...withoutOwner(entry),
      toolIds: entry.tools.map((tool) => tool.id),
      tools: undefined
    })),
    activities: activities.map((entry) => ({
      ...withoutOwner(entry),
      toolIds: entry.tools.map((tool) => tool.id),
      positionIds: entry.positions.map((position) => position.id),
      tools: undefined,
      positions: undefined
    })),
    activityImages: activityImages.map((entry) => ({
      id: entry.id,
      activityId: entry.activityId,
      fileId: entry.fileId,
      title: entry.title,
      createdAt: entry.createdAt
    })),
    sessions: sessions.map(withoutOwner),
    kgSessions: kgSessions.map(withoutOwner),
    sessionComments: sessionComments.map(({ ownerId: _ownerId, ...entry }) => entry),
    albums: albums.map(withoutOwner),
    media: media.map(withoutOwner),
    mediaComments: mediaComments.map(({ ownerId: _ownerId, ...entry }) => entry),
    events: events.map(withoutOwner),
    checkIns: checkIns.map(({ userId: _userId, ...entry }) => entry)
  };

  const zip = new JSZip();
  zip.file("data.json", JSON.stringify(data, null, 2));
  const fileFolder = zip.folder("files");
  if (fileFolder) {
    for (const asset of files) {
      try {
        const bytes = await readFile(absolutePathForAsset(asset.storagePath));
        fileFolder.file(asset.id, bytes);
      } catch {
        // Missing files stay visible in data.json but are skipped in the archive.
      }
    }
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export async function importDataArchive(user: AccessUser, bytes: Buffer) {
  const zip = await JSZip.loadAsync(bytes);
  const rawData = await zip.file("data.json")?.async("string");
  if (!rawData) throw new Error("Im Archiv fehlt data.json");
  const data = JSON.parse(rawData) as Partial<TransferData>;
  if (data.format !== "fesselspiel-export" || data.version !== 1) throw new Error("Dieses Archivformat wird nicht unterstützt");

  const fileMap = new Map<string, string>();
  for (const entry of records(data.files)) {
    const id = String(entry.id || "");
    const archived = id ? zip.file(`files/${id}`) : null;
    if (!id || !archived) continue;
    const fileBytes = Buffer.from(await archived.async("uint8array"));
    const asset = await saveFileBuffer({
      ownerId: user.id,
      bytes: fileBytes,
      originalName: String(entry.originalName || path.basename(id)),
      mimeType: String(entry.mimeType || "application/octet-stream")
    });
    if (asset) fileMap.set(id, asset.id);
  }

  const toyMap = new Map<string, string>();
  for (const entry of records(data.toys)) {
    const title = String(entry.title || "Importiertes Spielzeug");
    const slug = await uniqueSlug("toy", String(entry.slug || title));
    const created = await prisma.toy.create({
      data: {
        ownerId: user.id,
        title,
        slug,
        description: String(entry.description || ""),
        imageUrl: rewriteFileUrl(entry.imageUrl, fileMap)
      }
    });
    toyMap.set(String(entry.id || ""), created.id);
  }

  const positionMap = new Map<string, string>();
  for (const entry of records(data.positions)) {
    const name = String(entry.name || "Importierte Szene");
    const slug = await uniqueSlug("position", String(entry.slug || name));
    const toolIds = strings(entry.toolIds).map((id) => toyMap.get(id)).filter((id): id is string => Boolean(id));
    const created = await prisma.position.create({
      data: {
        ownerId: user.id,
        name,
        slug,
        description: String(entry.description || ""),
        imageUrl: rewriteFileUrl(entry.imageUrl, fileMap),
        tools: { connect: toolIds.map((id) => ({ id })) }
      }
    });
    positionMap.set(String(entry.id || ""), created.id);
  }

  const activityMap = new Map<string, string>();
  for (const entry of records(data.activities)) {
    const title = String(entry.title || "Importierte Aktivität");
    const slug = await uniqueSlug("activityPlan", String(entry.slug || title));
    const toolIds = strings(entry.toolIds).map((id) => toyMap.get(id)).filter((id): id is string => Boolean(id));
    const positionIds = strings(entry.positionIds).map((id) => positionMap.get(id)).filter((id): id is string => Boolean(id));
    const created = await prisma.activityPlan.create({
      data: {
        ownerId: user.id,
        title,
        slug,
        category: typeof entry.category === "string" ? entry.category : null,
        note: typeof entry.note === "string" ? entry.note : null,
        plannedAt: toDate(entry.plannedAt),
        status: String(entry.status || "PLANNED") as "REQUESTED" | "PLANNED" | "DONE" | "DISCARDED",
        tools: { connect: toolIds.map((id) => ({ id })) },
        positions: { connect: positionIds.map((id) => ({ id })) }
      }
    });
    activityMap.set(String(entry.id || ""), created.id);
  }

  const sessionMap = new Map<string, string>();
  const activityImageMap = new Map<string, string>();
  for (const entry of records(data.activityImages)) {
    const activityId = activityMap.get(String(entry.activityId || ""));
    const fileId = fileMap.get(String(entry.fileId || ""));
    if (!activityId || !fileId) continue;
    const created = await prisma.activityImage.create({
      data: {
        activityId,
        fileId,
        title: String(entry.title || "Importiertes Ideenbild")
      }
    });
    activityImageMap.set(String(entry.id || ""), created.id);
  }

  const legacyActivityImageIds = new Set<string>();
  for (const entry of records(data.sessions)) {
    const startTime = toDate(entry.startTime);
    if (!startTime) continue;
    const created = await prisma.segufixSession.create({
      data: {
        ownerId: user.id,
        slug: await uniqueSessionSlug(startTime),
        startTime,
        endTime: toDate(entry.endTime),
        durationMinutes: typeof entry.durationMinutes === "number" ? entry.durationMinutes : null,
        notes: typeof entry.notes === "string" ? entry.notes : null,
        moodBefore: entry.moodBefore ? String(entry.moodBefore) as "NEEDS_WORK" | "OKAY" | "NEUTRAL" | "PLEASANT" | "VERY_PLEASANT" : null,
        moodBeforeText: typeof entry.moodBeforeText === "string" ? entry.moodBeforeText : null,
        moodAfter: entry.moodAfter ? String(entry.moodAfter) as "WORSE" | "UNCHANGED" | "SLIGHTLY_BETTER" | "MUCH_BETTER" | "RELAXED" : null,
        moodAfterText: typeof entry.moodAfterText === "string" ? entry.moodAfterText : null
      }
    });
    sessionMap.set(String(entry.id || ""), created.id);
  }

  for (const entry of records(data.kgSessions)) {
    const startTime = toDate(entry.startTime);
    if (!startTime) continue;
    await prisma.kgSession.create({
      data: {
        ownerId: user.id,
        startTime,
        endTime: toDate(entry.endTime),
        durationMinutes: typeof entry.durationMinutes === "number" ? entry.durationMinutes : null,
        notes: typeof entry.notes === "string" ? entry.notes : null
      }
    });
  }

  for (const entry of records(data.sessionComments)) {
    const sessionId = sessionMap.get(String(entry.sessionId || ""));
    const body = String(entry.body || "").trim();
    if (!sessionId || !body) continue;
    await prisma.sessionComment.create({ data: { sessionId, ownerId: user.id, body } });
  }

  const albumMap = new Map<string, string>();
  for (const entry of records(data.albums)) {
    const created = await prisma.album.create({
      data: {
        ownerId: user.id,
        title: String(entry.title || "Importiertes Album"),
        description: String(entry.description || ""),
        visibility: String(entry.visibility || "PRIVATE") as "PRIVATE" | "PARTNER" | "SHARED"
      }
    });
    albumMap.set(String(entry.id || ""), created.id);
  }
  const fallbackAlbum = await ensureDefaultAlbum(user.id);

  const mediaMap = new Map<string, string>();
  for (const entry of records(data.media)) {
    const sourceFileId = fileIdFromUrl(typeof entry.url === "string" ? entry.url : "");
    const importedFileId = sourceFileId ? fileMap.get(sourceFileId) : null;
    const importedActivityId = activityMap.get(String(entry.activityId || "")) || null;
    if (importedActivityId && importedFileId) {
      const created = await prisma.activityImage.create({
        data: {
          activityId: importedActivityId,
          fileId: importedFileId,
          title: String(entry.title || "Importiertes Ideenbild")
        }
      });
      legacyActivityImageIds.add(String(entry.id || ""));
      activityImageMap.set(String(entry.id || ""), created.id);
      continue;
    }
    const url = rewriteFileUrl(entry.url, fileMap);
    if (!url) continue;
    const importedAlbumId = albumMap.get(String(entry.albumId || "")) || fallbackAlbum.id;
    const created = await prisma.media.create({
      data: {
        ownerId: user.id,
        albumId: importedAlbumId,
        sessionId: sessionMap.get(String(entry.sessionId || "")) || null,
        title: String(entry.title || "Importiertes Bild"),
        kind: String(entry.kind || "IMAGE") as "IMAGE" | "VIDEO",
        url,
        visibility: entry.visibility ? (String(entry.visibility) as "PRIVATE" | "PARTNER" | "SHARED") : null
      }
    });
    mediaMap.set(String(entry.id || ""), created.id);
  }

  for (const entry of records(data.albums)) {
    const albumId = albumMap.get(String(entry.id || ""));
    const coverMediaId = mediaMap.get(String(entry.coverMediaId || ""));
    if (!albumId || !coverMediaId) continue;
    await prisma.album.update({ where: { id: albumId }, data: { coverMediaId } });
  }

  for (const entry of records(data.mediaComments)) {
    if (legacyActivityImageIds.has(String(entry.mediaId || ""))) continue;
    const mediaId = mediaMap.get(String(entry.mediaId || ""));
    const body = String(entry.body || "").trim();
    if (!mediaId || !body) continue;
    await prisma.mediaComment.create({ data: { mediaId, ownerId: user.id, body } });
  }

  const eventMap = new Map<string, string>();
  for (const entry of records(data.events)) {
    const startsAt = toDate(entry.startsAt);
    if (!startsAt) continue;
    const created = await prisma.event.create({
      data: {
        ownerId: user.id,
        title: String(entry.title || "Importierter Termin"),
        location: typeof entry.location === "string" ? entry.location : null,
        startsAt,
        description: typeof entry.description === "string" ? entry.description : null
      }
    });
    eventMap.set(String(entry.id || ""), created.id);
  }

  for (const entry of records(data.checkIns)) {
    const eventId = eventMap.get(String(entry.eventId || ""));
    if (!eventId) continue;
    await prisma.checkIn.upsert({
      where: { eventId_userId: { eventId, userId: user.id } },
      update: { note: typeof entry.note === "string" ? entry.note : null },
      create: { eventId, userId: user.id, note: typeof entry.note === "string" ? entry.note : null }
    });
  }

  return {
    files: fileMap.size,
    toys: toyMap.size,
    positions: positionMap.size,
    activities: activityMap.size,
    activityImages: activityImageMap.size,
    albums: albumMap.size,
    media: mediaMap.size,
    events: eventMap.size
  };
}
