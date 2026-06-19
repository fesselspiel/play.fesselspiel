import { prisma } from "@/lib/prisma";

export const defaultAlbumTitle = "Eingang";

export async function ensureDefaultAlbum(ownerId: string) {
  const existing = await prisma.album.findFirst({ where: { ownerId, title: defaultAlbumTitle } });
  if (existing) return existing;
  return prisma.album.create({
    data: {
      ownerId,
      title: defaultAlbumTitle,
      description: "Standardalbum fuer neue Uploads und Telegram-Bilder.",
      visibility: "PRIVATE"
    }
  });
}
