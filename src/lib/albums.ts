import { prisma } from "@/lib/prisma";

export const defaultAlbumTitle = "Standard";
const legacyDefaultAlbumTitle = "Eingang";

export async function ensureDefaultAlbum(ownerId: string) {
  const existing = await prisma.album.findFirst({ where: { ownerId, title: defaultAlbumTitle } });
  if (existing) return existing;
  const legacy = await prisma.album.findFirst({ where: { ownerId, title: legacyDefaultAlbumTitle } });
  if (legacy) {
    return prisma.album.update({ where: { id: legacy.id }, data: { title: defaultAlbumTitle } });
  }
  return prisma.album.create({
    data: {
      ownerId,
      title: defaultAlbumTitle,
      description: "Standardalbum für neue Uploads und Telegram-Bilder.",
      visibility: "PRIVATE"
    }
  });
}
