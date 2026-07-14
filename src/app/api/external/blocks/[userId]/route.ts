import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 409 });
  await prisma.userBlock.deleteMany({
    where: { tenantId: auth.user.tenantId, blockerId: auth.user.id, blockedId: (await context.params).userId }
  });
  return NextResponse.json({ ok: true });
}
