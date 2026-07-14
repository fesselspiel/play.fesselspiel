import type { AccessUser } from "@/lib/access";
import { calendarEventSafetyExclusions, visibleCalendarEventWhere } from "@/lib/calendar-event-safety";
import { prisma } from "@/lib/prisma";

export const calendarEventInclude = {
  owner: { include: { profile: true } },
  checkIns: true,
  packingEvents: true,
  packingLists: true
};

export function eventDisplayName(user?: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null } | null) {
  return user?.profile?.displayName || user?.name || user?.username || user?.email || null;
}

export function serializeCalendarEvent(event: any, currentUser?: AccessUser) {
  const own = currentUser?.id === event.ownerId;
  const canManage = Boolean(own || currentUser?.role === "ADMIN" || currentUser?.role === "SUPER_ADMIN");
  return {
    id: event.id,
    title: event.title,
    location: event.location,
    startsAt: event.startsAt.toISOString(),
    description: event.description,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
    href: `/events/${event.id}/edit`,
    owner: { id: event.owner.id, username: event.owner.username, displayName: eventDisplayName(event.owner) },
    own,
    canManage,
    canReport: Boolean(currentUser && !own),
    canHide: Boolean(currentUser && !own),
    checkIns: (event.checkIns || []).map((checkIn: any) => ({
      id: checkIn.id,
      userId: checkIn.userId,
      note: checkIn.note,
      createdAt: checkIn.createdAt.toISOString()
    })),
    checkedIn: currentUser ? (event.checkIns || []).some((checkIn: any) => checkIn.userId === currentUser.id) : false,
    packingEvents: (event.packingEvents || []).map((entry: any) => ({ id: entry.id, title: entry.title, slug: entry.slug, href: `/packing?packingEvent=${entry.id}` })),
    packingLists: (event.packingLists || []).map((entry: any) => ({ id: entry.id, title: entry.title, slug: entry.slug, href: `/packing/${entry.slug}` }))
  };
}

export async function findCalendarEventForUser(user: { id: string; tenantId?: string | null; circleId?: string | null; role?: string | null }, id: string) {
  const exclusions = await calendarEventSafetyExclusions(user);
  return prisma.event.findFirst({ where: { id, ...(await visibleCalendarEventWhere(user, exclusions)) }, include: calendarEventInclude });
}
