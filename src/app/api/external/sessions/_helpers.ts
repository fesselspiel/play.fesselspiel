import { Prisma } from "@prisma/client";
import { ownerScope } from "@/lib/access";
import { fileIdFromUrl } from "@/lib/files";
import { prisma } from "@/lib/prisma";

export const externalSessionInclude = {
  owner: { include: { profile: true } },
  tools: { include: { category: true } },
  positions: { include: { category: true } },
  bondageSystemItems: { include: { product: true } },
  images: { include: { file: true }, orderBy: { createdAt: "asc" as const } },
  likes: { include: { user: { include: { profile: true } } }, orderBy: { createdAt: "asc" as const } },
  comments: { include: { owner: { include: { profile: true } } }, orderBy: { createdAt: "asc" as const } }
} satisfies Prisma.ActivityPlanInclude;

export type ExternalSession = Prisma.ActivityPlanGetPayload<{ include: typeof externalSessionInclude }>;

type LinkedMedia = Prisma.MediaGetPayload<{ include: { owner: { include: { profile: true } } } }>;

export async function findExternalSession(user: { id: string; tenantId?: string | null; circleId?: string | null; role?: string | null }, id: string) {
  return prisma.activityPlan.findFirst({
    where: {
      ...(await ownerScope(user)),
      OR: [{ id }, { slug: id }],
      AND: [{ OR: [{ category: null }, { category: { notIn: ["IDEA_COLLECTION", "SELF_BONDAGE_ORDER"] } }] }]
    },
    include: externalSessionInclude
  });
}

function displayName(user?: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null } | null) {
  return user?.profile?.displayName || user?.name || user?.username || user?.email || null;
}

function absoluteUrl(request: Request, path?: string | null) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return new URL(path.startsWith("/") ? path : `/${path}`, publicOrigin(request)).toString();
}

function externalFileUrl(request: Request, fileId: string) {
  return new URL(`/api/external/files/${fileId}`, publicOrigin(request)).toString();
}

function dayRange(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function publicOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  if (host && !host.startsWith("0.0.0.0")) return `${forwardedProto}://${host}`;
  return process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_URL || new URL(request.url).origin;
}

function serializeImage(request: Request, image: ExternalSession["images"][number]) {
  const url = externalFileUrl(request, image.fileId);
  return {
    id: image.id,
    fileId: image.fileId,
    title: image.title,
    url,
    downloadUrl: url,
    protectedUrl: `/api/files/${image.fileId}`,
    mimeType: image.file.mimeType,
    createdAt: image.createdAt.toISOString(),
    requiresAuthorization: true
  };
}

function serializeLinkedMedia(request: Request, entry: LinkedMedia) {
  const fileId = fileIdFromUrl(entry.url);
  const href = `/media?view=${entry.id}`;
  const url = fileId ? externalFileUrl(request, fileId) : absoluteUrl(request, entry.url);
  return {
    id: entry.id,
    title: entry.title,
    href,
    path: href,
    kind: entry.kind,
    calendarDate: entry.calendarDate?.toISOString() || null,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    fileId,
    url,
    downloadUrl: url,
    owner: {
      id: entry.owner.id,
      username: entry.owner.username,
      displayName: displayName(entry.owner)
    }
  };
}

export async function calendarMediaForSessionDates(
  user: { id: string; tenantId?: string | null; circleId?: string | null; role?: string | null },
  activities: ExternalSession[]
) {
  const dated = activities.filter((activity) => activity.plannedAt);
  if (!dated.length) return new Map<string, LinkedMedia[]>();
  const ranges = dated.map((activity) => ({ id: activity.id, ...dayRange(activity.plannedAt as Date) }));
  const min = new Date(Math.min(...ranges.map((range) => range.start.getTime())));
  const max = new Date(Math.max(...ranges.map((range) => range.end.getTime())));
  const media = await prisma.media.findMany({
    where: {
      ...(await ownerScope(user)),
      showInCalendar: true,
      calendarDate: { gte: min, lt: max }
    },
    include: { owner: { include: { profile: true } } },
    orderBy: [{ calendarDate: "asc" }, { createdAt: "asc" }]
  });
  const result = new Map<string, LinkedMedia[]>();
  for (const activity of dated) {
    const { start, end } = dayRange(activity.plannedAt as Date);
    result.set(activity.id, media.filter((entry) => entry.calendarDate && entry.calendarDate >= start && entry.calendarDate < end));
  }
  return result;
}

export async function calendarMediaForSession(
  user: { id: string; tenantId?: string | null; circleId?: string | null; role?: string | null },
  activity: ExternalSession
) {
  return (await calendarMediaForSessionDates(user, [activity])).get(activity.id) || [];
}

export function serializeExternalSession(request: Request, activity: ExternalSession, currentUserId: string, linkedMedia: LinkedMedia[] = []) {
  const href = `/activities/${activity.slug}`;
  const calendarMedia = linkedMedia.map((entry) => serializeLinkedMedia(request, entry));
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
    href,
    url: absoluteUrl(request, href),
    wikiPage: null,
    wiki_page: null,
    diaryEntry: null,
    wikiPageId: null,
    calendarMedia,
    calendar_media: calendarMedia,
    linkedMedia: calendarMedia,
    owner: {
      id: activity.owner.id,
      username: activity.owner.username,
      displayName: displayName(activity.owner)
    },
    images: activity.images.map((image) => serializeImage(request, image)),
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
    })),
    comments: activity.comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      own: comment.ownerId === currentUserId,
      canDelete: comment.ownerId === currentUserId,
      owner: {
        id: comment.owner.id,
        username: comment.owner.username,
        displayName: displayName(comment.owner)
      }
    }))
  };
}
