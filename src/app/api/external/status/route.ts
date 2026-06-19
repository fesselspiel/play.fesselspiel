import { NextRequest, NextResponse } from "next/server";
import { ownerScope } from "@/lib/access";
import { requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const scope = await ownerScope(auth.user);
  const [toys, positions, activities, media, openSession] = await Promise.all([
    prisma.toy.count({ where: scope }),
    prisma.position.count({ where: scope }),
    prisma.activityPlan.count({ where: { ...scope, status: { in: ["REQUESTED", "PLANNED"] } } }),
    prisma.media.count({ where: scope }),
    prisma.segufixSession.findFirst({ where: { ownerId: auth.user.id, endTime: null }, orderBy: { startTime: "desc" } })
  ]);
  return NextResponse.json({
    ok: true,
    user: { id: auth.user.id, name: auth.user.profile?.displayName || auth.user.name || auth.user.username || auth.user.email },
    counts: { toys, positions, plannedActivities: activities, media },
    openSession: openSession ? { id: openSession.id, startTime: openSession.startTime } : null
  });
}
