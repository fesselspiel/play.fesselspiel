import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAction } from "@/lib/audit";
import { requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const RevokeSchema = z.object({ action: z.literal("REVOKE_OTHERS") });

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, { allowUnaccepted: true, ignoreViewContext: true });
  if ("response" in auth) return auth.response;
  const sessions = await prisma.apiToken.findMany({
    where: { userId: auth.user.id, active: true },
    select: { id: true, name: true, tokenLastSix: true, lastUsedAt: true, createdAt: true },
    orderBy: [{ lastUsedAt: "desc" }, { createdAt: "desc" }]
  });
  return NextResponse.json({
    ok: true,
    sessions: sessions.map((session) => ({ ...session, current: session.id === auth.token.id })),
    webSessions: { revocableTogether: true, sessionRevision: auth.user.sessionRevision }
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, { allowUnaccepted: true, ignoreViewContext: true });
  if ("response" in auth) return auth.response;
  const parsed = RevokeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  const revoked = await prisma.$transaction(async (tx) => {
    const otherTokens = await tx.apiToken.findMany({ where: { userId: auth.user.id, active: true, id: { not: auth.token.id } }, select: { id: true } });
    const ids = otherTokens.map((token) => token.id);
    if (ids.length) {
      await tx.externalViewContext.deleteMany({ where: { tokenId: { in: ids } } });
      await tx.apiToken.updateMany({ where: { id: { in: ids } }, data: { active: false } });
    }
    await tx.user.update({ where: { id: auth.user.id }, data: { sessionRevision: { increment: 1 }, rememberTokenHash: null } });
    return ids.length;
  });
  await logAction({ actorId: auth.user.id, action: "account_sessions_revoked", entityType: "user", entityId: auth.user.id, title: "Andere Sitzungen abgemeldet", details: { revokedAppSessions: revoked, webSessionsRevoked: true } });
  return NextResponse.json({ ok: true, revokedAppSessions: revoked, webSessionsRevoked: true });
}
