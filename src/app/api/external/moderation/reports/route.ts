import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  if (auth.user.role !== "ADMIN" && auth.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (!auth.user.tenantId) return NextResponse.json({ ok: true, items: [] });
  const status = request.nextUrl.searchParams.get("status");
  const items = await prisma.contentReport.findMany({
    where: {
      tenantId: auth.user.tenantId,
      ...(status ? { status: status as "OPEN" | "IN_REVIEW" | "ESCALATED" | "RESOLVED" | "DISMISSED" } : {})
    },
    include: {
      reporter: { include: { profile: true } },
      reportedUser: { include: { profile: true } },
      moderator: { include: { profile: true } }
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: 200
  });
  const displayName = (user: typeof items[number]["reporter"] | null) => user
    ? user.profile?.displayName || user.name || user.username || "Benutzer"
    : null;
  return NextResponse.json({
    ok: true,
    items: items.map((item) => ({
      id: item.id,
      entityType: item.entityType,
      entityId: item.entityId,
      reason: item.reason,
      details: item.details,
      priority: item.priority,
      status: item.status,
      action: item.action,
      moderationNote: item.moderationNote,
      reporter: { id: item.reporterId, displayName: displayName(item.reporter) },
      reportedUser: item.reportedUser ? { id: item.reportedUserId, displayName: displayName(item.reportedUser) } : null,
      moderator: item.moderator ? { id: item.moderatorId, displayName: displayName(item.moderator) } : null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      resolvedAt: item.resolvedAt?.toISOString() || null
    }))
  });
}
