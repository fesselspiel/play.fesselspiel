import { blockedUserIds, hiddenEntityIds } from "@/lib/compliance/ugc";
import { packingVisibilityScope, type PackingUser } from "@/lib/packing";

export type PackingSafetyExclusions = {
  ownerIds: string[];
  listIds: string[];
  eventIds: string[];
};

export async function packingSafetyExclusions(user: PackingUser): Promise<PackingSafetyExclusions> {
  if (!user.tenantId) return { ownerIds: [], listIds: [], eventIds: [] };
  const [ownerIds, listIds, eventIds] = await Promise.all([
    blockedUserIds(user.id, user.tenantId),
    hiddenEntityIds(user.tenantId, "packingList"),
    hiddenEntityIds(user.tenantId, "packingEvent")
  ]);
  return { ownerIds, listIds, eventIds };
}

export function visiblePackingWhere(user: PackingUser, kind: "list" | "event", exclusions: PackingSafetyExclusions) {
  const hiddenIds = kind === "list" ? exclusions.listIds : exclusions.eventIds;
  return {
    AND: [
      packingVisibilityScope(user),
      ...(exclusions.ownerIds.length ? [{ ownerId: { notIn: exclusions.ownerIds } }] : []),
      ...(hiddenIds.length ? [{ id: { notIn: hiddenIds } }] : [])
    ]
  };
}
