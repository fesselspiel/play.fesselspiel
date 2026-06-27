import { ActivityStatus, type Prisma } from "@prisma/client";
import { fileAssetUrl, fileIdFromUrl } from "@/lib/files";

export const activityInclude = {
  owner: { include: { profile: true } },
  tools: { include: { category: true } },
  positions: { include: { category: true } },
  bondageSystemItems: { include: { product: true } },
  images: { include: { file: true }, orderBy: { createdAt: "asc" as const } },
  likes: { include: { user: { include: { profile: true } } }, orderBy: { createdAt: "asc" as const } }
} satisfies Prisma.ActivityPlanInclude;

export type ActivityWithMobileRelations = Prisma.ActivityPlanGetPayload<{ include: typeof activityInclude }>;

export function displayName(user?: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null } | null) {
  return user?.profile?.displayName || user?.name || user?.username || user?.email || null;
}

export function absoluteUrl(request: Request, path?: string | null) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return new URL(path.startsWith("/") ? path : `/${path}`, request.url).toString();
}

export function externalFileUrl(request: Request, fileId: string, token?: string) {
  const url = new URL(`/api/external/files/${fileId}`, request.url);
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

export function serializeFileImage(request: Request, input: { id?: string | null; fileId?: string | null; title?: string | null; url?: string | null; createdAt?: Date | null }, token?: string) {
  const fileId = input.fileId || fileIdFromUrl(input.url);
  const url = fileId ? externalFileUrl(request, fileId) : absoluteUrl(request, input.url);
  return {
    id: input.id || fileId || null,
    title: input.title || null,
    fileId,
    url,
    downloadUrl: url,
    downloadUrlWithToken: fileId && token ? externalFileUrl(request, fileId, token) : null,
    requiresAuthorization: Boolean(fileId && !token),
    createdAt: input.createdAt?.toISOString() || null
  };
}

export function serializeActivity(request: Request, activity: ActivityWithMobileRelations, token?: string) {
  return {
    id: activity.id,
    title: activity.title,
    slug: activity.slug,
    category: activity.category,
    note: activity.note,
    status: activity.status,
    plannedAt: activity.plannedAt?.toISOString() || null,
    createdAt: activity.createdAt.toISOString(),
    updatedAt: activity.updatedAt.toISOString(),
    href: activity.category === "IDEA_COLLECTION" ? `/ideas/${activity.slug}` : activity.category === "SELF_BONDAGE_ORDER" ? `/orders#order-${activity.id}` : `/activities/${activity.slug}`,
    url: absoluteUrl(request, activity.category === "IDEA_COLLECTION" ? `/ideas/${activity.slug}` : activity.category === "SELF_BONDAGE_ORDER" ? `/orders#order-${activity.id}` : `/activities/${activity.slug}`),
    owner: {
      id: activity.owner.id,
      username: activity.owner.username,
      displayName: displayName(activity.owner)
    },
    images: activity.images.map((image) => serializeFileImage(request, {
      id: image.id,
      fileId: image.fileId,
      title: image.title,
      createdAt: image.createdAt
    }, token)),
    toys: activity.tools.map((toy) => ({
      id: toy.id,
      title: toy.title,
      slug: toy.slug,
      imageUrl: toy.imageUrl,
      href: `/toys/${toy.slug}`,
      category: toy.category ? { id: toy.category.id, name: toy.category.name } : null
    })),
    positions: activity.positions.map((position) => ({
      id: position.id,
      name: position.name,
      slug: position.slug,
      imageUrl: position.imageUrl,
      selfBondageCapable: position.selfBondageCapable,
      href: `/positions/${position.slug}`,
      category: position.category ? { id: position.category.id, name: position.category.name } : null
    })),
    bondageSystemItems: activity.bondageSystemItems.map((item) => ({
      id: item.id,
      title: item.product.title,
      slug: item.product.slug,
      imageUrl: item.product.imageUrl,
      href: `/bondage-system/${item.product.slug}`
    })),
    likes: activity.likes.map((like) => ({
      userId: like.userId,
      displayName: displayName(like.user),
      createdAt: like.createdAt.toISOString()
    }))
  };
}

export function parseActivityStatus(value: string | null | undefined) {
  if (!value) return null;
  return Object.values(ActivityStatus).includes(value as ActivityStatus) ? value as ActivityStatus : null;
}

export function parseDateValue(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}
