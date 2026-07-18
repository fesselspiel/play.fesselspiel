import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { logAction, userDisplayName } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function isAdmin(user: { role?: string | null }) {
  return user.role === "ADMIN" || user.role === "SUPER_ADMIN";
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "circleChat");
  if (blocked) return blocked;
  if (!isAdmin(auth.user)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 });
  const circleBeforeUpdate = await prisma.circle.findFirst({
    where: { id: params.id, tenantId: auth.user.tenantId },
    select: { id: true, name: true }
  });
  if (!circleBeforeUpdate) return NextResponse.json({ ok: false, error: "circle_not_found" }, { status: 404 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
  if (name.length > 80) return NextResponse.json({ ok: false, error: "name_too_long" }, { status: 400 });

  const duplicate = await prisma.circle.findFirst({
    where: {
      tenantId: auth.user.tenantId,
      id: { not: circleBeforeUpdate.id },
      name: { equals: name, mode: "insensitive" }
    },
    select: { id: true }
  });
  if (duplicate) return NextResponse.json({ ok: false, error: "circle_name_exists" }, { status: 409 });

  const circle = await prisma.circle.update({
    where: { id: circleBeforeUpdate.id },
    data: { name },
    select: {
      id: true,
      name: true,
      _count: { select: { memberships: { where: { active: true, user: { active: true } } } } }
    }
  });
  await logAction({
    actorId: auth.user.id,
    action: "circle_updated_api",
    entityType: "circle",
    entityId: circle.id,
    title: `${userDisplayName(auth.user)} hat den Zirkel ${circleBeforeUpdate.name} in ${circle.name} umbenannt`,
    href: "/settings/users",
    details: { tenantId: auth.user.tenantId }
  });
  return NextResponse.json({
    ok: true,
    circle: {
      id: circle.id,
      name: circle.name,
      current: circle.id === auth.user.circleId,
      default: circle.id === auth.user.circleId,
      memberCount: circle._count.memberships
    }
  });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "circleChat");
  if (blocked) return blocked;
  if (!isAdmin(auth.user)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 });
  const circle = await prisma.circle.findFirst({
    where: { id: params.id, tenantId: auth.user.tenantId },
    select: { id: true, name: true }
  });
  if (!circle) return NextResponse.json({ ok: false, error: "circle_not_found" }, { status: 404 });

  const usage = await prisma.$transaction(async (tx) => {
    const [memberships, users, messages, wikiShares, pushRules, emailRules, telegramRules, telegramChats, chatRules, productTargets] = await Promise.all([
      tx.tenantMembership.count({ where: { circleId: circle.id } }),
      tx.user.count({ where: { circleId: circle.id } }),
      tx.circleChatMessage.count({ where: { circleId: circle.id } }),
      tx.wikiPageShare.count({ where: { targetCircleId: circle.id } }),
      tx.nativePushNotificationRule.count({ where: { targetCircleId: circle.id } }),
      tx.emailNotificationRule.count({ where: { targetCircleId: circle.id } }),
      tx.telegramNotificationRule.count({ where: { targetCircleId: circle.id } }),
      tx.telegramChat.count({ where: { targetCircleId: circle.id } }),
      tx.chatNotificationRule.count({ where: { targetCircleId: circle.id } }),
      tx.bondageSystemItem.count({ where: { targetCircleId: circle.id } })
    ]);
    return { memberships, users, messages, wikiShares, pushRules, emailRules, telegramRules, telegramChats, chatRules, productTargets };
  });
  const dependencyCount = Object.values(usage).reduce((sum, count) => sum + count, 0);
  if (dependencyCount > 0) {
    return NextResponse.json({
      ok: false,
      code: "circle_not_empty",
      error: "Der Zirkel ist noch in Verwendung. Entferne zuerst Mitglieder, Chatverlauf, Freigaben und Regeln.",
      usage
    }, { status: 409 });
  }

  await prisma.circle.delete({ where: { id: circle.id } });
  await logAction({
    actorId: auth.user.id,
    action: "circle_deleted_api",
    entityType: "circle",
    entityId: circle.id,
    title: `${userDisplayName(auth.user)} hat den leeren Zirkel ${circle.name} gelöscht`,
    href: "/settings/users",
    details: { tenantId: auth.user.tenantId }
  });
  return NextResponse.json({ ok: true, deleted: true, id: circle.id });
}
