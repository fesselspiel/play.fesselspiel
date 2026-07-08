import { ownerScope } from "@/lib/access";
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

export function serializeCalendarEvent(event: any, currentUserId?: string) {
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
    checkIns: (event.checkIns || []).map((checkIn: any) => ({
      id: checkIn.id,
      userId: checkIn.userId,
      note: checkIn.note,
      createdAt: checkIn.createdAt.toISOString()
    })),
    checkedIn: currentUserId ? (event.checkIns || []).some((checkIn: any) => checkIn.userId === currentUserId) : false,
    packingEvents: (event.packingEvents || []).map((entry: any) => ({ id: entry.id, title: entry.title, slug: entry.slug, href: `/packing?packingEvent=${entry.id}` })),
    packingLists: (event.packingLists || []).map((entry: any) => ({ id: entry.id, title: entry.title, slug: entry.slug, href: `/packing/${entry.slug}` }))
  };
}

export async function findCalendarEventForUser(user: { id: string; tenantId?: string | null; circleId?: string | null; role?: string | null }, id: string) {
  return prisma.event.findFirst({ where: { id, ...(await ownerScope(user)) }, include: calendarEventInclude });
}
