import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { minutesBetween } from "@/lib/dates";
import { trackerVisibleToUser } from "@/lib/external-tracker-types";

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

export class TrackerEntryMoveError extends Error {
  constructor(public readonly code: "entry_running" | "destination_conflict") {
    super(code);
    this.name = "TrackerEntryMoveError";
  }
}

export async function moveTrackerEntryToType(input: {
  entry: {
    id: string;
    trackerTypeId: string;
    startTime: Date;
    endTime: Date | null;
    allDay: boolean;
    legacyType: string | null;
    legacyId: string | null;
  };
  target: { id: string; key: string };
}) {
  if (input.entry.trackerTypeId === input.target.id) {
    return prisma.trackerEntry.findUnique({ where: { id: input.entry.id }, include: { trackerType: true } });
  }
  if (!input.entry.allDay && !input.entry.endTime) throw new TrackerEntryMoveError("entry_running");
  if (input.entry.legacyType && input.entry.legacyId) {
    const conflict = await prisma.trackerEntry.findFirst({
      where: {
        trackerTypeId: input.target.id,
        legacyType: input.entry.legacyType,
        legacyId: input.entry.legacyId,
        id: { not: input.entry.id }
      },
      select: { id: true }
    });
    if (conflict) throw new TrackerEntryMoveError("destination_conflict");
  }
  const slug = await uniqueTrackerSlug(input.target.id, input.target.key, input.entry.startTime, input.entry.id);
  return prisma.trackerEntry.update({
    where: { id: input.entry.id },
    data: {
      trackerTypeId: input.target.id,
      slug
    },
    include: { trackerType: true }
  });
}

export async function findTrackerTypeForUser(key: string, user: { id: string; tenantId?: string | null }) {
  if (user.tenantId) {
    const tenantTracker = await prisma.trackerType.findFirst({
      where: {
        key,
        enabled: true,
        tenantId: user.tenantId
      }
    });
    if (tenantTracker && trackerVisibleToUser(tenantTracker, user.id)) return tenantTracker;
  }
  const globalTracker = await prisma.trackerType.findFirst({
    where: {
      key,
      enabled: true,
      tenantId: null
    }
  });
  return globalTracker && trackerVisibleToUser(globalTracker, user.id) ? globalTracker : null;
}

export async function trackerTypesForUser(user: { id: string; tenantId?: string | null }) {
  const trackers = await prisma.trackerType.findMany({
    where: {
      enabled: true,
      ...(user.tenantId ? { OR: [{ tenantId: user.tenantId }, { tenantId: null }] } : { tenantId: null })
    },
    orderBy: { title: "asc" }
  });
  return trackers.filter((tracker) => trackerVisibleToUser(tracker, user.id));
}

export async function findTrackerTypeByIdForUser(id: string, user: { id: string; tenantId?: string | null }) {
  const tracker = await prisma.trackerType.findFirst({
    where: {
      id,
      enabled: true,
      ...(user.tenantId ? { OR: [{ tenantId: user.tenantId }, { tenantId: null }] } : { tenantId: null })
    }
  });
  return tracker && trackerVisibleToUser(tracker, user.id) ? tracker : null;
}

export async function findTrackerTypeByTextForUser(query: string, user: { id: string; tenantId?: string | null }) {
  const normalized = query.trim().toLowerCase();
  const trackers = await trackerTypesForUser(user);
  if (!normalized) return trackers[0] || null;
  return trackers.find((tracker) => tracker.key.toLowerCase() === normalized)
    || trackers.find((tracker) => tracker.title.toLowerCase() === normalized)
    || trackers.find((tracker) => tracker.key.toLowerCase().includes(normalized) || tracker.title.toLowerCase().includes(normalized))
    || null;
}

export async function runningTrackerEntriesForUser(
  user: { id: string; tenantId?: string | null },
  options?: { trackerTypeId?: string }
) {
  return prisma.trackerEntry.findMany({
    where: {
      ownerId: user.id,
      endTime: null,
      allDay: false,
      ...(options?.trackerTypeId ? { trackerTypeId: options.trackerTypeId } : {})
    },
    include: {
      trackerType: {
        select: {
          key: true,
          title: true
        }
      }
    },
    orderBy: { startTime: "desc" }
  });
}

export async function stopAllRunningTrackerEntriesForUser(
  input: {
    user: { id: string; tenantId?: string | null };
    notes?: string;
    trackerTypeId?: string;
  }
) {
  const openEntries = await runningTrackerEntriesForUser(input.user, input.trackerTypeId ? { trackerTypeId: input.trackerTypeId } : undefined);
  const uniqueByKey = new Map(openEntries.map((entry) => [entry.trackerType.key, entry]));
  const stopped: Exclude<Awaited<ReturnType<typeof stopTrackerEntry>>, null>[] = [];

  for (const entry of uniqueByKey.values()) {
    const closed = await stopTrackerEntry({
      key: entry.trackerType.key,
      user: input.user,
      notes: input.notes
    });
    if (closed) {
      stopped.push(closed);
    }
  }

  return { openEntries, stopped };
}

export async function startTrackerEntry(input: {
  key: string;
  user: { id: string; tenantId?: string | null };
  startTime?: Date;
  allDay?: boolean;
  notes?: string;
  fieldValues?: Record<string, unknown>;
}) {
  const trackerType = await findTrackerTypeForUser(input.key, input.user);
  if (!trackerType) return null;
  return startTrackerEntryForType({ ...input, trackerType });
}

export async function startTrackerEntryForType(input: {
  trackerType: { id: string; key: string; title: string; tenantId?: string | null; autoCloseOpenSession: boolean };
  user: { id: string; tenantId?: string | null };
  startTime?: Date;
  allDay?: boolean;
  notes?: string;
  fieldValues?: Record<string, unknown>;
}) {
  const trackerType = input.trackerType;
  const startTime = input.startTime || new Date();
  const allDay = input.allDay === true;
  if (!allDay && trackerType.autoCloseOpenSession) {
    const open = await prisma.trackerEntry.findFirst({
      where: { trackerTypeId: trackerType.id, ownerId: input.user.id, endTime: null, allDay: false },
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
      allDay,
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
  return stopTrackerEntryForType({ trackerType, user: input.user, notes: input.notes });
}

export async function stopTrackerEntryForType(input: {
  trackerType: { id: string };
  user: { id: string; tenantId?: string | null };
  notes?: string;
}) {
  const trackerType = input.trackerType;
  const entry = await prisma.trackerEntry.findFirst({
    where: { trackerTypeId: trackerType.id, ownerId: input.user.id, endTime: null, allDay: false },
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
