import { NextRequest, NextResponse } from "next/server";
import { accessibleOwnerIds, type AccessUser } from "@/lib/access";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function findDismissibleAuditLog(user: AccessUser, eventId: string) {
  const ownerIds = await accessibleOwnerIds(user);
  return prisma.auditLog.findFirst({
    where: { id: eventId, actorId: { in: ownerIds } },
    select: { id: true }
  });
}

export async function POST(request: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "auditLog");
  if (blocked) return blocked;
  const auditLog = await findDismissibleAuditLog(auth.user, params.eventId);
  if (!auditLog) return NextResponse.json({ ok: false, error: "event_not_found" }, { status: 404 });
  await prisma.feedDismissal.upsert({
    where: { auditLogId_userId: { auditLogId: auditLog.id, userId: auth.user.id } },
    update: {},
    create: { auditLogId: auditLog.id, userId: auth.user.id }
  });
  return NextResponse.json({ ok: true, eventId: auditLog.id, dismissedForMe: true });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "auditLog");
  if (blocked) return blocked;
  const auditLog = await findDismissibleAuditLog(auth.user, params.eventId);
  if (!auditLog) return NextResponse.json({ ok: false, error: "event_not_found" }, { status: 404 });
  await prisma.feedDismissal.deleteMany({ where: { auditLogId: auditLog.id, userId: auth.user.id } });
  return NextResponse.json({ ok: true, eventId: auditLog.id, dismissedForMe: false });
}
