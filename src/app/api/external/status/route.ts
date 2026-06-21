import { NextRequest, NextResponse } from "next/server";
import { ownerScope } from "@/lib/access";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  const scope = await ownerScope(auth.user);
  const [toys, positions, activities, media, openSession, openKgSession] = await Promise.all([
    prisma.toy.count({ where: scope }),
    prisma.position.count({ where: scope }),
    prisma.activityPlan.count({ where: { ...scope, category: { not: "IDEA_COLLECTION" }, status: { in: ["REQUESTED", "PLANNED"] } } }),
    prisma.media.count({ where: scope }),
    prisma.segufixSession.findFirst({ where: { tenantId: auth.user.tenantId || undefined, ownerId: auth.user.id, endTime: null }, orderBy: { startTime: "desc" } }),
    prisma.kgSession.findFirst({ where: { tenantId: auth.user.tenantId || undefined, ownerId: auth.user.id, endTime: null }, orderBy: { startTime: "desc" } })
  ]);
  return NextResponse.json({
    ok: true,
    user: { id: auth.user.id, name: auth.user.profile?.displayName || auth.user.name || auth.user.username || auth.user.email },
    counts: { toys, positions, plannedActivities: activities, media },
    openSession: openSession ? { id: openSession.id, startTime: openSession.startTime } : null,
    openKgSession: openKgSession ? { id: openKgSession.id, startTime: openKgSession.startTime } : null
  });
}
