import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAction } from "@/lib/audit";
import { requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const LeaveSchema = z.object({ confirmation: z.literal("ZIRKEL VERLASSEN") });

async function circleSummary(userId: string, tenantId?: string | null) {
  if (!tenantId) return null;
  const membership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    include: { circle: { select: { id: true, name: true, memberships: { where: { active: true }, select: { userId: true } } } } }
  });
  if (!membership?.circle) return null;
  const circleId = membership.circle.id;
  const otherUserIds = membership.circle.memberships.map((entry) => entry.userId).filter((id) => id !== userId);
  const [partnerMedia, partnerAlbums, partnerWiki, explicitWikiShares, directWikiShares, sharedContentSpaces, contentSpaceShares, outgoingShares, incomingShares, assignedProducts] = await Promise.all([
    prisma.media.count({ where: { ownerId: userId, visibility: { in: ["PARTNER", "SHARED"] } } }),
    prisma.album.count({ where: { ownerId: userId, visibility: { in: ["PARTNER", "SHARED"] } } }),
    prisma.wikiPage.count({ where: { ownerId: userId, visibility: { in: ["PARTNER", "SHARED"] } } }),
    prisma.wikiPageShare.count({ where: { page: { ownerId: userId }, targetCircleId: circleId } }),
    otherUserIds.length ? prisma.wikiPageShare.count({ where: { targetUserId: userId, page: { ownerId: { in: otherUserIds } } } }) : 0,
    prisma.contentSpace.count({ where: { ownerId: userId, visibility: { in: ["CIRCLES", "SHARED"] } } }),
    prisma.contentSpace.count({
      where: {
        OR: [
          { ownerId: userId, allowedCircleIds: { array_contains: circleId } },
          { ownerId: { in: otherUserIds }, allowedCircleIds: { array_contains: circleId } },
          { ownerId: { in: otherUserIds }, allowedUserIds: { array_contains: userId } }
        ]
      }
    }),
    otherUserIds.length ? prisma.shareDelivery.count({ where: { actorId: userId, targetUserId: { in: otherUserIds } } }) : 0,
    otherUserIds.length ? prisma.shareDelivery.count({ where: { targetUserId: userId, actorId: { in: otherUserIds } } }) : 0,
    prisma.bondageSystemItem.count({ where: { tenantId, targetUserId: userId } })
  ]);
  return {
    membershipId: membership.id,
    circle: { id: circleId, name: membership.circle.name, memberCount: membership.circle.memberships.length },
    affected: { partnerMedia, partnerAlbums, partnerWiki, explicitWikiShares, directWikiShares, sharedContentSpaces, contentSpaceShares, outgoingShares, incomingShares, assignedProducts }
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, { allowUnaccepted: true, ignoreViewContext: true });
  if ("response" in auth) return auth.response;
  return NextResponse.json({ ok: true, membership: await circleSummary(auth.user.id, auth.user.tenantId) });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireApiUser(request, { allowUnaccepted: true, ignoreViewContext: true });
  if ("response" in auth) return auth.response;
  const parsed = LeaveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "confirmation_required", confirmationText: "ZIRKEL VERLASSEN" }, { status: 400 });
  const summary = await circleSummary(auth.user.id, auth.user.tenantId);
  if (!summary || !auth.user.tenantId) return NextResponse.json({ ok: false, error: "not_in_circle" }, { status: 409 });
  const otherMemberships = await prisma.tenantMembership.findMany({ where: { tenantId: auth.user.tenantId, circleId: summary.circle.id, active: true, userId: { not: auth.user.id } }, select: { userId: true } });
  const otherUserIds = otherMemberships.map((entry) => entry.userId);
  const sharedSpaces = await prisma.contentSpace.findMany({
    where: {
      ownerId: { in: otherUserIds },
      OR: [
        { allowedCircleIds: { array_contains: summary.circle.id } },
        { allowedUserIds: { array_contains: auth.user.id } }
      ]
    },
    select: { id: true, allowedCircleIds: true, allowedUserIds: true }
  });
  await prisma.$transaction([
    prisma.media.updateMany({ where: { ownerId: auth.user.id, visibility: { in: ["PARTNER", "SHARED"] } }, data: { visibility: "PRIVATE" } }),
    prisma.album.updateMany({ where: { ownerId: auth.user.id, visibility: { in: ["PARTNER", "SHARED"] } }, data: { visibility: "PRIVATE" } }),
    prisma.wikiPage.updateMany({ where: { ownerId: auth.user.id, visibility: { in: ["PARTNER", "SHARED"] } }, data: { visibility: "PRIVATE" } }),
    prisma.wikiPageShare.deleteMany({ where: { OR: [{ page: { ownerId: auth.user.id }, targetCircleId: summary.circle.id }, { targetUserId: auth.user.id, page: { ownerId: { in: otherUserIds } } }] } }),
    prisma.contentSpace.updateMany({
      where: { ownerId: auth.user.id },
      data: { visibility: "PRIVATE", allowedCircleIds: [], allowedUserIds: [] }
    }),
    ...sharedSpaces.map((space) => prisma.contentSpace.update({
      where: { id: space.id },
      data: {
        allowedCircleIds: Array.isArray(space.allowedCircleIds) ? space.allowedCircleIds.map(String).filter((id) => id !== summary.circle.id) : [],
        allowedUserIds: Array.isArray(space.allowedUserIds) ? space.allowedUserIds.map(String).filter((id) => id !== auth.user.id) : []
      }
    })),
    prisma.shareDelivery.deleteMany({ where: { OR: [{ actorId: auth.user.id, targetUserId: { in: otherUserIds } }, { targetUserId: auth.user.id, actorId: { in: otherUserIds } }] } }),
    prisma.bondageSystemItem.updateMany({ where: { tenantId: auth.user.tenantId, targetUserId: auth.user.id }, data: { targetUserId: null } }),
    prisma.tenantMembership.update({ where: { id: summary.membershipId }, data: { circleId: null } }),
    prisma.user.updateMany({ where: { id: auth.user.id, tenantId: auth.user.tenantId }, data: { circleId: null } })
  ]);
  await logAction({ actorId: auth.user.id, action: "account_circle_left", entityType: "circle", entityId: summary.circle.id, title: "Zirkel verlassen", details: { circleName: summary.circle.name, affected: summary.affected } });
  return NextResponse.json({ ok: true, circle: summary.circle, affected: summary.affected });
}
