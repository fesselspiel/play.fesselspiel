import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { accessibleCircleChats } from "@/lib/circle-chat";
import { logAction, userDisplayName } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "circleChat");
  if (blocked) return blocked;
  const circles = await accessibleCircleChats(auth.user);
  const currentCircleId = circles.some((circle) => circle.id === auth.user.circleId)
    ? auth.user.circleId
    : circles[0]?.id || null;
  return NextResponse.json({
    ok: true,
    count: circles.length,
    currentCircleId,
    circles
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "circleChat");
  if (blocked) return blocked;
  if (auth.user.role !== "ADMIN" && auth.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
  if (name.length > 80) return NextResponse.json({ ok: false, error: "name_too_long" }, { status: 400 });

  const existing = await prisma.circle.findFirst({
    where: { tenantId: auth.user.tenantId, name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true, _count: { select: { memberships: { where: { active: true } } } } }
  });
  if (existing) {
    return NextResponse.json({
      ok: true,
      created: false,
      circle: { id: existing.id, name: existing.name, current: false, default: false, memberCount: existing._count.memberships }
    });
  }

  const circle = await prisma.circle.create({
    data: { tenantId: auth.user.tenantId, name },
    select: { id: true, name: true }
  });
  await logAction({
    actorId: auth.user.id,
    action: "circle_created_api",
    entityType: "circle",
    entityId: circle.id,
    title: `${userDisplayName(auth.user)} hat den Zirkel ${circle.name} angelegt`,
    href: "/settings/users",
    details: { tenantId: auth.user.tenantId }
  });
  return NextResponse.json({
    ok: true,
    created: true,
    circle: { id: circle.id, name: circle.name, current: false, default: false, memberCount: 0 }
  }, { status: 201 });
}
