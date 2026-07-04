import { NextRequest, NextResponse } from "next/server";
import { accessibleOwnerIds } from "@/lib/access";
import { userDisplayName } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";
import { tenantPointTotals, userPointTotal } from "@/lib/points";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 });

  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") || 30)));
  const [ownPoints, visibleUserIds, totals, entries] = await Promise.all([
    userPointTotal(auth.user.id, auth.user.tenantId),
    accessibleOwnerIds(auth.user),
    tenantPointTotals(auth.user.tenantId),
    prisma.pointEntry.findMany({
      where: { tenantId: auth.user.tenantId, userId: auth.user.id },
      include: { auditLog: true },
      orderBy: { createdAt: "desc" },
      take: limit
    })
  ]);
  const visibleSet = new Set(visibleUserIds);
  const visibleTotals = totals.filter((entry) => visibleSet.has(entry.userId));
  const users = await prisma.user.findMany({
    where: { id: { in: visibleTotals.map((entry) => entry.userId) } },
    include: { profile: true }
  });
  const userById = new Map(users.map((user) => [user.id, user]));
  return NextResponse.json({
    ok: true,
    user: {
      id: auth.user.id,
      displayName: userDisplayName(auth.user),
      points: ownPoints
    },
    leaderboard: visibleTotals.map((entry) => {
      const user = userById.get(entry.userId);
      return {
        userId: entry.userId,
        displayName: user ? userDisplayName(user) : "Unbekannter Benutzer",
        points: entry.points,
        entries: entry.entries
      };
    }),
    entries: entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      points: entry.points,
      note: entry.note,
      createdAt: entry.createdAt.toISOString(),
      auditLogId: entry.auditLogId,
      href: entry.auditLog?.href || null,
      title: entry.auditLog?.title || entry.note
    }))
  });
}
