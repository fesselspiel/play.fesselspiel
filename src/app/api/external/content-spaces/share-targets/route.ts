import { NextRequest, NextResponse } from "next/server";
import { blockedUserIds } from "@/lib/compliance/ugc";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "wiki");
  if (blocked) return blocked;
  if (!auth.user.tenantId) return NextResponse.json({ ok: true, users: [], circles: [] });

  const excludedUserIds = await blockedUserIds(auth.user.id, auth.user.tenantId);
  const memberships = await prisma.tenantMembership.findMany({
    where: {
      tenantId: auth.user.tenantId,
      active: true,
      user: { active: true, id: { notIn: [auth.user.id, ...excludedUserIds] } }
    },
    select: {
      userId: true,
      circleId: true,
      user: { select: { username: true, name: true, profile: { select: { displayName: true } } } }
    }
  });
  const ownMemberships = await prisma.tenantMembership.findMany({
    where: { tenantId: auth.user.tenantId, userId: auth.user.id, active: true, circleId: { not: null } },
    select: { circleId: true }
  });
  const visibleCircleIds = auth.user.role === "ADMIN" || auth.user.role === "SUPER_ADMIN"
    ? undefined
    : ownMemberships.map((entry) => entry.circleId).filter((id): id is string => Boolean(id));
  const circles = await prisma.circle.findMany({
    where: {
      tenantId: auth.user.tenantId,
      ...(visibleCircleIds ? { id: { in: visibleCircleIds } } : {})
    },
    select: { id: true, name: true, _count: { select: { memberships: { where: { active: true } } } } },
    orderBy: { name: "asc" }
  });
  const usersById = new Map<string, { id: string; name: string; circleIds: string[] }>();
  for (const entry of memberships) {
    const existing = usersById.get(entry.userId);
    const circleIds = new Set(existing?.circleIds || []);
    if (entry.circleId) circleIds.add(entry.circleId);
    usersById.set(entry.userId, {
      id: entry.userId,
      name: entry.user.profile?.displayName || entry.user.name || entry.user.username || "Mitglied",
      circleIds: [...circleIds]
    });
  }
  const users = [...usersById.values()].sort((left, right) => left.name.localeCompare(right.name, "de"));

  return NextResponse.json({
    ok: true,
    users,
    circles: circles.map((circle) => ({ id: circle.id, name: circle.name, memberCount: circle._count.memberships }))
  });
}
