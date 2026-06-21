import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { minutesBetween } from "@/lib/dates";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function trackerSlugBase(key: string, startTime: Date) {
  return `${key}-${startTime.getFullYear()}-${pad(startTime.getMonth() + 1)}-${pad(startTime.getDate())}-${pad(startTime.getHours())}${pad(startTime.getMinutes())}`;
}

export async function uniqueTrackerSlug(trackerTypeId: string, key: string, startTime: Date, currentId?: string) {
  const base = trackerSlugBase(key, startTime);
  let slug = base;
  let counter = 2;
  while (true) {
    const existing = await prisma.trackerEntry.findFirst({ where: { trackerTypeId, slug } });
    if (!existing || existing.id === currentId) return slug;
    slug = `${base}-${counter++}`;
  }
}

export async function findTrackerTypeForUser(key: string, user: { tenantId?: string | null }) {
  return prisma.trackerType.findFirst({
    where: {
      key,
      enabled: true,
      ...(user.tenantId ? { OR: [{ tenantId: user.tenantId }, { tenantId: null }] } : {})
    }
  });
}

export async function startTrackerEntry(input: {
  key: string;
  user: { id: string; tenantId?: string | null };
  startTime?: Date;
  notes?: string;
  fieldValues?: Record<string, unknown>;
}) {
  const trackerType = await findTrackerTypeForUser(input.key, input.user);
  if (!trackerType) return null;
  const startTime = input.startTime || new Date();
  if (trackerType.autoCloseOpenSession) {
    const open = await prisma.trackerEntry.findFirst({
      where: { trackerTypeId: trackerType.id, ownerId: input.user.id, endTime: null },
      orderBy: { startTime: "desc" }
    });
    if (open) {
      const endTime = new Date();
      await prisma.trackerEntry.update({
        where: { id: open.id },
        data: {
          endTime,
          durationMinutes: minutesBetween(open.startTime, endTime)
        }
      });
    }
  }
  return prisma.trackerEntry.create({
    data: {
      tenantId: input.user.tenantId || trackerType.tenantId,
      ownerId: input.user.id,
      trackerTypeId: trackerType.id,
      slug: await uniqueTrackerSlug(trackerType.id, trackerType.key, startTime),
      title: trackerType.title,
      startTime,
      notes: input.notes || "",
      fieldValues: (input.fieldValues || {}) as Prisma.InputJsonValue
    }
  });
}

export async function stopTrackerEntry(input: {
  key: string;
  user: { id: string; tenantId?: string | null };
  notes?: string;
}) {
  const trackerType = await findTrackerTypeForUser(input.key, input.user);
  if (!trackerType) return null;
  const entry = await prisma.trackerEntry.findFirst({
    where: { trackerTypeId: trackerType.id, ownerId: input.user.id, endTime: null },
    orderBy: { startTime: "desc" }
  });
  if (!entry) return null;
  const endTime = new Date();
  return prisma.trackerEntry.update({
    where: { id: entry.id },
    data: {
      endTime,
      durationMinutes: minutesBetween(entry.startTime, endTime),
      notes: [entry.notes, input.notes].filter(Boolean).join("\n")
    }
  });
}
