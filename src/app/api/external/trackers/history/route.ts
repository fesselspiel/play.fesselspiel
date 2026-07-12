import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { ownerScope } from "@/lib/access";
import { formatDateInput, parseDateInput } from "@/lib/dates";
import { entityLikeStateMap } from "@/lib/entity-likes";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { serializeFileImage } from "@/lib/external-mobile-serializers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function optionalDate(value: string | null) {
  return parseDateInput(value || "") || null;
}

function endExclusive(value: Date | null) {
  if (!value) return null;
  return new Date(value.getTime() + 24 * 60 * 60 * 1000);
}

function dateRangeWhere(from: Date | null, toExclusive: Date | null): Prisma.TrackerEntryWhereInput {
  if (from && toExclusive) {
    return {
      OR: [
        { startTime: { gte: from, lt: toExclusive } },
        { endTime: { gte: from, lt: toExclusive } },
        { startTime: { lt: from }, OR: [{ endTime: null }, { endTime: { gte: from } }] }
      ]
    };
  }
  if (from) {
    return { OR: [{ startTime: { gte: from } }, { endTime: { gte: from } }, { startTime: { lt: from }, endTime: null }] };
  }
  if (toExclusive) {
    return { startTime: { lt: toExclusive } };
  }
  return {};
}

function trackerUrl(key: string, slug?: string | null, id?: string) {
  return `/trackers/${key}/${slug || id}`;
}

function publicOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  if (host && !host.startsWith("0.0.0.0")) return `${forwardedProto}://${host}`;
  return process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_URL || new URL(request.url).origin;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers");
  if (blocked) return blocked;

  const searchParams = request.nextUrl.searchParams;
  const from = optionalDate(searchParams.get("from"));
  const to = optionalDate(searchParams.get("to"));
  const toExclusive = endExclusive(to);
  const trackerKey = String(searchParams.get("trackerKey") || searchParams.get("key") || "").trim().toLowerCase();
  const limit = Math.min(1000, Math.max(1, Number(searchParams.get("limit") || 500)));
  const cursor = searchParams.get("cursor") || undefined;
  const scope = await ownerScope(auth.user);

  const where: Prisma.TrackerEntryWhereInput = {
    ...scope,
    ...dateRangeWhere(from, toExclusive),
    trackerType: {
      enabled: true,
      ...(trackerKey ? { key: trackerKey } : {})
    }
  };

  const entries = await prisma.trackerEntry.findMany({
    where,
    include: {
      trackerType: true,
      owner: { include: { profile: true } },
      toys: { select: { id: true, title: true, slug: true, imageUrl: true } },
      positions: { select: { id: true, name: true, slug: true, imageUrl: true } },
      bondageSystemItems: { include: { product: { select: { id: true, title: true, slug: true, imageUrl: true } } } },
      images: { include: { file: true }, orderBy: { createdAt: "asc" } }
    },
    orderBy: [{ startTime: "asc" }, { createdAt: "asc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  });
  const pageItems = entries.slice(0, limit);
  const nextCursor = entries.length > limit ? entries[limit].id : null;
  const likeStates = await entityLikeStateMap("trackerEntry", pageItems.map((entry) => entry.id), auth.user.id, pageItems.map((entry) => ({
    entityType: "trackerEntry",
    entityId: entry.id,
    ownerId: entry.ownerId,
    tenantId: entry.tenantId,
    title: entry.title || entry.trackerType.title,
    href: trackerUrl(entry.trackerType.key, entry.slug, entry.id)
  })));

  return NextResponse.json({
    ok: true,
    count: pageItems.length,
    nextCursor,
    from: from ? formatDateInput(from) : null,
    to: to ? formatDateInput(to) : null,
    items: pageItems.map((entry) => {
      const key = entry.trackerType.key;
      const href = trackerUrl(key, entry.slug, entry.id);
      const startedAt = entry.startTime.toISOString();
      const calendarDate = formatDateInput(entry.startTime);
      const endedAt = entry.endTime?.toISOString() || null;
      return {
        id: entry.id,
        trackerKey: key,
        key,
        trackerTitle: entry.trackerType.title,
        trackerName: entry.trackerType.title,
        color: entry.trackerType.color,
        colorHex: entry.trackerType.color,
        hexColor: entry.trackerType.color,
        trackerColor: entry.trackerType.color,
        tracker: {
          id: entry.trackerType.id,
          key,
          title: entry.trackerType.title,
          color: entry.trackerType.color,
          colorHex: entry.trackerType.color,
          hexColor: entry.trackerType.color,
          trackerColor: entry.trackerType.color
        },
        title: entry.title || entry.trackerType.title,
        notes: entry.notes || "",
        note: entry.notes || "",
        startedAt,
        startTime: startedAt,
        startAt: startedAt,
        occurredAt: startedAt,
        recordedAt: startedAt,
        timestamp: startedAt,
        date: calendarDate,
        day: calendarDate,
        entryDate: calendarDate,
        calendarDate,
        calendar_date: calendarDate,
        endedAt,
        stoppedAt: endedAt,
        endTime: endedAt,
        durationMinutes: entry.durationMinutes,
        minutes: entry.durationMinutes,
        allDay: entry.allDay,
        slug: entry.slug,
        href,
        url: new URL(href, publicOrigin(request)).toString(),
        owner: {
          id: entry.owner.id,
          username: entry.owner.username,
          displayName: entry.owner.profile?.displayName || entry.owner.name || entry.owner.username || entry.owner.email
        },
        toys: entry.toys.map((toy) => ({ id: toy.id, title: toy.title, slug: toy.slug, imageUrl: toy.imageUrl, href: `/toys/${toy.slug}` })),
        positions: entry.positions.map((position) => ({ id: position.id, name: position.name, slug: position.slug, imageUrl: position.imageUrl, href: `/positions/${position.slug}` })),
        bondageSystemItems: entry.bondageSystemItems.map((item) => ({
          id: item.id,
          title: item.product.title,
          slug: item.product.slug,
          imageUrl: item.product.imageUrl,
          href: `/bondage-system/${item.product.slug}`
        })),
        ...(likeStates.get(entry.id) || {}),
        images: entry.images.map((image) => ({
          ...serializeFileImage(request, {
            id: image.id,
            fileId: image.fileId,
            title: image.title,
            createdAt: image.createdAt
          }),
          note: image.note,
          mimeType: image.file.mimeType,
          sizeBytes: image.file.sizeBytes,
          updatedAt: image.updatedAt.toISOString()
        })),
        fieldValues: entry.fieldValues,
        legacyType: entry.legacyType,
        legacyId: entry.legacyId,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString()
      };
    })
  });
}
