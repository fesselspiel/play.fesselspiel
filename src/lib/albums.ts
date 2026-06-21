import { prisma } from "@/lib/prisma";
import { currentTenant } from "@/lib/tenancy";

export const legacyDefaultAlbumTitles = ["Standard", "Eingang"];

function cleanTitle(value?: string | null) {
  return (value || "").trim();
}

function ownerAlbumTitle(owner: { email?: string | null; username?: string | null; name?: string | null; profile?: { displayName?: string | null } | null }) {
  const displayName = cleanTitle(owner.profile?.displayName || owner.name);
  if (displayName) return displayName;
  const username = cleanTitle(owner.username);
  if (username) return username;
  const email = cleanTitle(owner.email);
  if (email) return email.split("@")[0] || email;
  return "Persönliches Album";
}

export async function defaultAlbumTitle(ownerId: string) {
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, include: { profile: true } });
  return ownerAlbumTitle(owner || {});
}

export async function isDefaultAlbumTitle(ownerId: string, title?: string | null) {
  const normalized = cleanTitle(title).toLowerCase();
  if (!normalized) return false;
  const desiredTitle = (await defaultAlbumTitle(ownerId)).toLowerCase();
  return normalized === desiredTitle || legacyDefaultAlbumTitles.some((entry) => normalized === entry.toLowerCase());
}

export async function ensureDefaultAlbum(ownerId: string, tenantId?: string | null) {
  const title = await defaultAlbumTitle(ownerId);
  const tenant = tenantId ? { id: tenantId } : await currentTenant();
  const candidateTitles = [title, ...legacyDefaultAlbumTitles];
  const candidates = await prisma.album.findMany({
    where: { tenantId: tenant.id, ownerId, title: { in: candidateTitles } },
    orderBy: { createdAt: "asc" }
  });
  if (candidates.length) {
    const exact = candidates.filter((album) => album.title === title);
    const [keeper, ...duplicates] = exact.length ? [...exact, ...candidates.filter((album) => album.title !== title)] : candidates;
    if (duplicates.length) {
      const duplicateIds = duplicates.map((album) => album.id);
      await prisma.media.updateMany({ where: { tenantId: tenant.id, albumId: { in: duplicateIds } }, data: { albumId: keeper.id, visibility: null } });
      await prisma.album.deleteMany({ where: { id: { in: duplicateIds } } });
    }
    if (keeper.title !== title || !keeper.description || legacyDefaultAlbumTitles.includes(keeper.title)) {
      return prisma.album.update({
        where: { id: keeper.id },
        data: {
          title,
          description: `Persönliches Hauptalbum von ${title}.`
        }
      });
    }
    return keeper;
  }
  return prisma.album.create({
    data: {
      tenantId: tenant.id,
      ownerId,
      title,
      description: `Persönliches Hauptalbum von ${title}.`,
      visibility: "PRIVATE"
    }
  });
}
