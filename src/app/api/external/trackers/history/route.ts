import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { formatDateInput, minutesBetween, parseDateInput, parseDateTimeLocal } from "@/lib/dates";
import { entityLikeStateMap } from "@/lib/entity-likes";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { serializeFileImage } from "@/lib/external-mobile-serializers";
import { prisma } from "@/lib/prisma";
import { findTrackerTypeForUser, uniqueTrackerSlug } from "@/lib/tracker-core";

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

function stringArray(value: unknown) {
  if (Array.isArray(value)) return Array.from(new Set(value.map(String).map((entry) => entry.trim()).filter(Boolean)));
  if (typeof value === "string") return Array.from(new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean)));
  return [];
}

function bool(value: unknown, fallback = false) {
  if (value === undefined) return fallback;
  return value === true || value === "true" || value === "1" || value === 1 || value === "on";
}

function parseDateValue(value: unknown) {
  if (!value) return null;
  const raw = String(value).trim();
  return parseDateTimeLocal(raw) || parseDateInput(raw) || (() => {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  })();
}

function addMinutes(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * 60_000);
}

async function relationData(user: any, body: Record<string, unknown>) {
  const scope = await ownerScope(user);
  const toyIds = stringArray(body.toyIds);
  const positionIds = stringArray(body.positionIds);
  const bondageSystemItemIds = stringArray(body.bondageSystemItemIds);
  const [toys, positions, bondageSystemItems] = await Promise.all([
    toyIds.length ? prisma.toy.findMany({ where: { ...scope, id: { in: toyIds } }, select: { id: true } }) : [],
    positionIds.length ? prisma.position.findMany({ where: { ...scope, id: { in: positionIds } }, select: { id: true } }) : [],
    bondageSystemItemIds.length ? prisma.bondageSystemItem.findMany({ where: { tenantId: user.tenantId || undefined, id: { in: bondageSystemItemIds }, visible: true }, select: { id: true } }) : []
  ]);
  return { toys, positions, bondageSystemItems };
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

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const trackerKey = String(body.trackerKey || body.key || "").trim().toLowerCase();
  if (!trackerKey) return NextResponse.json({ ok: false, error: "missing_tracker_key" }, { status: 400 });
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers", `tracker.${trackerKey}`);
  if (blocked) return blocked;

  const trackerType = await findTrackerTypeForUser(trackerKey, auth.user);
  if (!trackerType) return NextResponse.json({ ok: false, error: "tracker_not_found" }, { status: 404 });

  const allDay = bool(body.allDay);
  const durationValue = body.durationMinutes !== undefined ? Number(body.durationMinutes) : null;
  if (durationValue !== null && (!Number.isFinite(durationValue) || durationValue < 0)) {
    return NextResponse.json({ ok: false, error: "invalid_duration_minutes" }, { status: 400 });
  }

  const startTime = allDay
    ? parseDateValue(body.date || body.startTime || body.startedAt)
    : parseDateValue(body.startTime || body.startedAt || body.date);
  if (!startTime) return NextResponse.json({ ok: false, error: "invalid_start_time" }, { status: 400 });

  const rawEndTime = body.endTime ?? body.endedAt;
  let endTime = rawEndTime !== undefined && String(rawEndTime || "").trim() ? parseDateValue(rawEndTime) : null;
  if (!allDay && !endTime && durationValue !== null) endTime = addMinutes(startTime, durationValue);
  if (!allDay && endTime && endTime < startTime) return NextResponse.json({ ok: false, error: "invalid_end_time" }, { status: 400 });

  if (!allDay && !endTime && trackerType.autoCloseOpenSession) {
    const open = await prisma.trackerEntry.findFirst({
      where: { trackerTypeId: trackerType.id, ownerId: auth.user.id, endTime: null, allDay: false },
      orderBy: { startTime: "desc" }
    });
    if (open) {
      const autoEnd = new Date();
      await prisma.trackerEntry.update({
        where: { id: open.id },
        data: { endTime: autoEnd, durationMinutes: minutesBetween(open.startTime, autoEnd) }
      });
    }
  }

  const relations = await relationData(auth.user, body);
  const fieldValues = body.fieldValues && typeof body.fieldValues === "object" && !Array.isArray(body.fieldValues) ? body.fieldValues as Prisma.InputJsonObject : {};
  const created = await prisma.trackerEntry.create({
    data: {
      tenantId: auth.user.tenantId || trackerType.tenantId,
      ownerId: auth.user.id,
      trackerTypeId: trackerType.id,
      title: String(body.title || "").trim() || trackerType.title,
      startTime,
      endTime: allDay ? null : endTime,
      allDay,
      durationMinutes: allDay ? null : minutesBetween(startTime, endTime),
      notes: String(body.notes ?? body.note ?? "").trim(),
      fieldValues: fieldValues as Prisma.InputJsonValue,
      slug: await uniqueTrackerSlug(trackerType.id, trackerType.key, startTime),
      toys: relations.toys.length ? { connect: relations.toys.map((entry) => ({ id: entry.id })) } : undefined,
      positions: relations.positions.length ? { connect: relations.positions.map((entry) => ({ id: entry.id })) } : undefined,
      bondageSystemItems: relations.bondageSystemItems.length ? { connect: relations.bondageSystemItems.map((entry) => ({ id: entry.id })) } : undefined
    },
    include: {
      trackerType: true,
      owner: { include: { profile: true } },
      toys: { select: { id: true, title: true, slug: true, imageUrl: true } },
      positions: { select: { id: true, name: true, slug: true, imageUrl: true } },
      bondageSystemItems: { include: { product: { select: { id: true, title: true, slug: true, imageUrl: true } } } },
      images: { include: { file: true }, orderBy: { createdAt: "asc" } }
    }
  });

  await logAction({
    actorId: auth.user.id,
    action: "tracker_entry_created_api",
    entityType: "trackerEntry",
    entityId: created.id,
    title: `Tracker-Eintrag per API angelegt: ${created.title || created.trackerType.title}`,
    href: trackerUrl(created.trackerType.key, created.slug, created.id)
  });

  const likeStates = await entityLikeStateMap("trackerEntry", [created.id], auth.user.id, [{
    entityType: "trackerEntry",
    entityId: created.id,
    ownerId: created.ownerId,
    tenantId: created.tenantId,
    title: created.title || created.trackerType.title,
    href: trackerUrl(created.trackerType.key, created.slug, created.id)
  }]);

  const href = trackerUrl(created.trackerType.key, created.slug, created.id);
  const startedAt = created.startTime.toISOString();
  const calendarDate = formatDateInput(created.startTime);
  const endedAt = created.endTime?.toISOString() || null;
  return NextResponse.json({
    ok: true,
    item: {
      id: created.id,
      trackerKey: created.trackerType.key,
      key: created.trackerType.key,
      trackerTitle: created.trackerType.title,
      trackerName: created.trackerType.title,
      color: created.trackerType.color,
      colorHex: created.trackerType.color,
      tracker: { id: created.trackerType.id, key: created.trackerType.key, title: created.trackerType.title, color: created.trackerType.color },
      title: created.title || created.trackerType.title,
      notes: created.notes || "",
      note: created.notes || "",
      startedAt,
      startTime: startedAt,
      date: calendarDate,
      day: calendarDate,
      calendarDate,
      endedAt,
      endTime: endedAt,
      durationMinutes: created.durationMinutes,
      minutes: created.durationMinutes,
      allDay: created.allDay,
      slug: created.slug,
      href,
      url: new URL(href, publicOrigin(request)).toString(),
      owner: {
        id: created.owner.id,
        username: created.owner.username,
        displayName: created.owner.profile?.displayName || created.owner.name || created.owner.username || created.owner.email
      },
      toys: created.toys.map((toy) => ({ id: toy.id, title: toy.title, slug: toy.slug, imageUrl: toy.imageUrl, href: `/toys/${toy.slug}` })),
      positions: created.positions.map((position) => ({ id: position.id, name: position.name, slug: position.slug, imageUrl: position.imageUrl, href: `/positions/${position.slug}` })),
      bondageSystemItems: created.bondageSystemItems.map((entry) => ({
        id: entry.id,
        title: entry.product.title,
        slug: entry.product.slug,
        imageUrl: entry.product.imageUrl,
        href: `/bondage-system/${entry.product.slug}`
      })),
      ...(likeStates.get(created.id) || {}),
      images: [],
      fieldValues: created.fieldValues,
      legacyType: created.legacyType,
      legacyId: created.legacyId,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString()
    }
  }, { status: 201 });
}
