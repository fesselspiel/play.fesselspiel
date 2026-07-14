import type { AccessUser } from "@/lib/access";
import { ownerScope } from "@/lib/access";
import { blockedUserIds, hiddenEntityIds } from "@/lib/compliance/ugc";

export type CalendarEventSafetyExclusions = {
  ownerIds: string[];
  eventIds: string[];
};

export async function calendarEventSafetyExclusions(user: AccessUser): Promise<CalendarEventSafetyExclusions> {
  if (!user.tenantId) return { ownerIds: [], eventIds: [] };
  const [ownerIds, eventIds] = await Promise.all([
    blockedUserIds(user.id, user.tenantId),
    hiddenEntityIds(user.tenantId, "calendarEvent")
  ]);
  return { ownerIds, eventIds };
}

export async function visibleCalendarEventWhere(user: AccessUser, exclusions: CalendarEventSafetyExclusions) {
  return {
    AND: [
      await ownerScope(user),
      ...(exclusions.ownerIds.length ? [{ ownerId: { notIn: exclusions.ownerIds } }] : []),
      ...(exclusions.eventIds.length ? [{ id: { notIn: exclusions.eventIds } }] : [])
    ]
  };
}
