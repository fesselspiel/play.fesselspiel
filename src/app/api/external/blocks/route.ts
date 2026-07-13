import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const BlockSchema = z.object({ userId: z.string().min(1) });

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  if (!auth.user.tenantId) return NextResponse.json({ ok: true, items: [] });
  const items = await prisma.userBlock.findMany({
    where: { tenantId: auth.user.tenantId, blockerId: auth.user.id },
    include: { blocked: { include: { profile: true } } },
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json({
    ok: true,
    items: items.map((item) => ({
      id: item.id,
      userId: item.blockedId,
      displayName: item.blocked.profile?.displayName || item.blocked.name || item.blocked.username || "Benutzer",
      createdAt: item.createdAt.toISOString()
    }))
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 409 });
  const parsed = BlockSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.userId === auth.user.id) return NextResponse.json({ ok: false, error: "invalid_user" }, { status: 400 });
  const target = await prisma.tenantMembership.findFirst({
    where: { tenantId: auth.user.tenantId, userId: parsed.data.userId, active: true, user: { active: true } },
    select: { userId: true, circleId: true }
  });
  if (!target) return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
  const block = await prisma.userBlock.upsert({
    where: { tenantId_blockerId_blockedId: { tenantId: auth.user.tenantId, blockerId: auth.user.id, blockedId: target.userId } },
    update: {},
    create: { tenantId: auth.user.tenantId, blockerId: auth.user.id, blockedId: target.userId }
  });
  return NextResponse.json({
    ok: true,
    block: { id: block.id, userId: block.blockedId, createdAt: block.createdAt.toISOString() },
    sharedCircle: Boolean(auth.user.circleId && target.circleId === auth.user.circleId)
  });
}
