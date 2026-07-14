import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import { requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request, { allowUnaccepted: true, ignoreViewContext: true });
  if ("response" in auth) return auth.response;
  const session = await prisma.apiToken.findFirst({ where: { id: params.id, userId: auth.user.id, active: true }, select: { id: true, name: true } });
  if (!session) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  await prisma.$transaction([
    prisma.externalViewContext.deleteMany({ where: { tokenId: session.id } }),
    prisma.apiToken.update({ where: { id: session.id }, data: { active: false } })
  ]);
  await logAction({ actorId: auth.user.id, action: "account_session_revoked", entityType: "apiToken", entityId: session.id, title: "App-Sitzung abgemeldet", details: { name: session.name, current: session.id === auth.token.id } });
  return NextResponse.json({ ok: true, id: session.id, currentRevoked: session.id === auth.token.id });
}
