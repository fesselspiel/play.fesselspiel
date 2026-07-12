import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { formatDateInput, minutesBetween, parseDateInput, parseDateTimeLocal } from "@/lib/dates";
import { emptyEntityLikeState, entityLikeState } from "@/lib/entity-likes";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { absoluteUrl, serializeFileImage } from "@/lib/external-mobile-serializers";
import { deleteOwnedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { uniqueTrackerSlug } from "@/lib/tracker-core";

export const runtime = "nodejs";

const include = {
  trackerType: true,
  owner: { include: { profile: true } },
  toys: { select: { id: true, title: true, slug: true, imageUrl: true } },
  positions: { select: { id: true, name: true, slug: true, imageUrl: true } },
  bondageSystemItems: { include: { product: { select: { id: true, title: true, slug: true, imageUrl: true } } } },
  images: { include: { file: true }, orderBy: { createdAt: "asc" } }
} satisfies Prisma.TrackerEntryInclude;

type Entry = Prisma.TrackerEntryGetPayload<{ include: typeof include }>;

function stringArray(value: unknown) {
  if (Array.isArray(value)) return Array.from(new Set(value.map(String).map((entry) => entry.trim()).filter(Boolean)));
  if (typeof value === "string") return Array.from(new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean)));
  return [];
}

function parseDate(value: unknown) {
  if (!value) return null;
  const raw = String(value);
  return parseDateTimeLocal(raw) || parseDateInput(raw) || (() => {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  })();
}

function bool(value: unknown, fallback = false) {
  if (value === undefined) return fallback;
  return value === true || value === "true" || value === "1" || value === 1 || value === "on";
}

function item(request: NextRequest, entry: Entry, likeState: ReturnType<typeof emptyEntityLikeState> = emptyEntityLikeState()) {
  const key = entry.trackerType.key;
  const href = `/trackers/${key}/${entry.slug || entry.id}`;
  const startedAt = entry.startTime.toISOString();
  const endedAt = entry.endTime?.toISOString() || null;
  const calendarDate = formatDateInput(entry.startTime);
  return {
    id: entry.id,
    trackerKey: key,
    key,
    trackerTitle: entry.trackerType.title,
    trackerName: entry.trackerType.title,
    color: entry.trackerType.color,
    colorHex: entry.trackerType.color,
    tracker: { id: entry.trackerType.id, key, title: entry.trackerType.title, color: entry.trackerType.color },
    title: entry.title || entry.trackerType.title,
    notes: entry.notes || "",
    note: entry.notes || "",
    startedAt,
    startTime: startedAt,
    endedAt,
    endTime: endedAt,
    durationMinutes: entry.durationMinutes,
    minutes: entry.durationMinutes,
    allDay: entry.allDay,
    slug: entry.slug,
    href,
    url: absoluteUrl(request, href),
    date: calendarDate,
    day: calendarDate,
    calendarDate,
    owner: {
      id: entry.owner.id,
      username: entry.owner.username,
      displayName: entry.owner.profile?.displayName || entry.owner.name || entry.owner.username || entry.owner.email
    },
    toys: entry.toys.map((toy) => ({ id: toy.id, title: toy.title, slug: toy.slug, imageUrl: toy.imageUrl, href: `/toys/${toy.slug}` })),
    positions: entry.positions.map((position) => ({ id: position.id, name: position.name, slug: position.slug, imageUrl: position.imageUrl, href: `/positions/${position.slug}` })),
    bondageSystemItems: entry.bondageSystemItems.map((bondageItem) => ({
      id: bondageItem.id,
      title: bondageItem.product.title,
      slug: bondageItem.product.slug,
      imageUrl: bondageItem.product.imageUrl,
      href: `/bondage-system/${bondageItem.product.slug}`
    })),
    ...likeState,
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
}

async function findEntry(user: any, id: string) {
  return prisma.trackerEntry.findFirst({ where: { ...(await ownerScope(user)), OR: [{ id }, { slug: id }], trackerType: { enabled: true } }, include });
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

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers");
  if (blocked) return blocked;
  const entry = await findEntry(auth.user, params.id);
  if (!entry) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, item: item(request, entry, await entityLikeState("trackerEntry", entry.id, auth.user.id)) });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers");
  if (blocked) return blocked;
  const existing = await findEntry(auth.user, params.id);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (existing.ownerId !== auth.user.id && auth.user.role !== "ADMIN" && auth.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const startTime = body.startTime !== undefined || body.startedAt !== undefined ? parseDate(body.startTime ?? body.startedAt) : existing.startTime;
  const rawEndTime = body.endTime ?? body.endedAt;
  const endTime = body.endTime !== undefined || body.endedAt !== undefined
    ? (String(rawEndTime || "").trim() ? parseDate(rawEndTime) : null)
    : existing.endTime;
  if (!startTime) return NextResponse.json({ ok: false, error: "invalid_start_time" }, { status: 400 });
  if (endTime && endTime < startTime) return NextResponse.json({ ok: false, error: "invalid_end_time" }, { status: 400 });
  const allDay = body.allDay !== undefined ? bool(body.allDay) : existing.allDay;
  const relations = await relationData(auth.user, body);
  const fieldValues = body.fieldValues && typeof body.fieldValues === "object" && !Array.isArray(body.fieldValues) ? body.fieldValues as Prisma.InputJsonObject : undefined;
  const updated = await prisma.trackerEntry.update({
    where: { id: existing.id },
    data: {
      ...(body.title !== undefined ? { title: String(body.title || "").trim() || existing.trackerType.title } : {}),
      ...(body.notes !== undefined || body.note !== undefined ? { notes: String(body.notes ?? body.note ?? "").trim() } : {}),
      startTime,
      endTime: allDay ? null : endTime,
      allDay,
      durationMinutes: allDay ? null : minutesBetween(startTime, endTime),
      slug: await uniqueTrackerSlug(existing.trackerTypeId, existing.trackerType.key, startTime, existing.id),
      ...(fieldValues !== undefined ? { fieldValues } : {}),
      ...(body.toyIds !== undefined ? { toys: { set: relations.toys.map((entry) => ({ id: entry.id })) } } : {}),
      ...(body.positionIds !== undefined ? { positions: { set: relations.positions.map((entry) => ({ id: entry.id })) } } : {}),
      ...(body.bondageSystemItemIds !== undefined ? { bondageSystemItems: { set: relations.bondageSystemItems.map((entry) => ({ id: entry.id })) } } : {})
    },
    include
  });
  await logAction({ actorId: auth.user.id, action: "tracker_entry_updated_api", entityType: "trackerEntry", entityId: updated.id, title: `Tracker-Eintrag per API geändert: ${updated.title || updated.trackerType.title}`, href: `/trackers/${updated.trackerType.key}/${updated.slug || updated.id}` });
  return NextResponse.json({ ok: true, item: item(request, updated, await entityLikeState("trackerEntry", updated.id, auth.user.id)) });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers");
  if (blocked) return blocked;
  const existing = await findEntry(auth.user, params.id);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (existing.ownerId !== auth.user.id && auth.user.role !== "ADMIN" && auth.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const images = await prisma.trackerEntryImage.findMany({ where: { trackerEntryId: existing.id }, select: { fileId: true } });
  await prisma.trackerEntry.delete({ where: { id: existing.id } });
  for (const image of images) {
    await deleteOwnedFile(existing.ownerId, image.fileId).catch(() => false);
  }
  await logAction({ actorId: auth.user.id, action: "tracker_entry_deleted_api", entityType: "trackerEntry", entityId: existing.id, title: `Tracker-Eintrag per API gelöscht: ${existing.title || existing.trackerType.title}`, href: `/trackers/${existing.trackerType.key}` });
  return NextResponse.json({ ok: true, id: existing.id });
}
