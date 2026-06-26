import { NextRequest, NextResponse } from "next/server";
import { accessibleOwnerIds } from "@/lib/access";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { notificationActionOptions } from "@/lib/notification-actions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "auditLog");
  if (blocked) return blocked;

  const ownerIds = await accessibleOwnerIds(auth.user);
  const grouped = await prisma.auditLog.groupBy({
    by: ["action"],
    where: { actorId: { in: ownerIds } },
    _count: { action: true },
    orderBy: { action: "asc" }
  });
  const counts = new Map(grouped.map((entry) => [entry.action, entry._count.action]));
  const options = await notificationActionOptions({
    tenantId: auth.user.tenantId,
    auditActions: grouped.map((entry) => entry.action)
  });

  return NextResponse.json({
    ok: true,
    count: options.length,
    actions: options.map((entry) => ({
      action: entry.action,
      label: entry.label,
      seenCount: counts.get(entry.action) || 0
    }))
  });
}
