import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { normalizeUsername } from "@/lib/usernames";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordPolicyError } from "@/lib/password-policy";

export const runtime = "nodejs";

function isAdmin(user: { role?: string | null }) {
  return user.role === "ADMIN" || user.role === "SUPER_ADMIN";
}

function userItem(user: any, tenantId?: string | null) {
  const membership = tenantId ? user.memberships?.find((entry: any) => entry.tenantId === tenantId) : null;
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.profile?.displayName || user.name || user.username || user.email,
    name: user.name,
    role: user.role,
    active: user.active,
    tenantId: membership?.tenantId || user.tenantId,
    tenantName: membership?.tenant?.name || null,
    circleId: membership ? membership.circleId : user.circleId,
    circleName: membership?.circle?.name || null,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString?.() || null,
    lastLoginAt: user.lastLoginAt?.toISOString?.() || null,
    createdAt: user.createdAt?.toISOString?.() || null
  };
}

async function findUser(authUser: any, id: string) {
  return prisma.user.findFirst({
    where: { id, ...(authUser.tenantId ? { memberships: { some: { tenantId: authUser.tenantId, active: true } } } : {}) },
    include: { profile: true, memberships: { include: { tenant: true, circle: true } } }
  });
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  if (!isAdmin(auth.user) && auth.user.id !== params.id) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const user = await findUser(auth.user, params.id);
  if (!user) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const item = userItem(user, auth.user.tenantId);
  return NextResponse.json({ ok: true, item, user: item });
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  if (!isAdmin(auth.user) && auth.user.id !== params.id) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const existing = await findUser(auth.user, params.id);
  if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (body.password !== undefined && String(body.password || "") && passwordPolicyError(String(body.password))) {
    return NextResponse.json({ ok: false, error: "password_policy", minimumLength: PASSWORD_MIN_LENGTH, maximumLength: PASSWORD_MAX_LENGTH }, { status: 400 });
  }
  const username = body.username === undefined ? undefined : normalizeUsername(String(body.username || ""));
  if (body.username !== undefined && !username) return NextResponse.json({ ok: false, error: "invalid_username" }, { status: 400 });
  if (username) {
    const exists = await prisma.user.findFirst({ where: { username, id: { not: existing.id } }, select: { id: true } });
    if (exists) return NextResponse.json({ ok: false, error: "username_taken" }, { status: 409 });
  }
  const role = body.role === undefined ? undefined : String(body.role || "").toUpperCase() === "ADMIN" ? Role.ADMIN : Role.USER;
  const circleId = body.circleId === undefined ? undefined : String(body.circleId || "").trim() || null;
  if (circleId) {
    const circle = await prisma.circle.findFirst({ where: { id: circleId, tenantId: auth.user.tenantId || "" }, select: { id: true } });
    if (!circle) return NextResponse.json({ ok: false, error: "circle_not_found" }, { status: 400 });
  }
  const passwordHash = body.password !== undefined && String(body.password || "")
    ? await bcrypt.hash(String(body.password), 12)
    : undefined;
  const user = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: existing.id },
      data: {
        ...(username !== undefined ? { username } : {}),
        ...(body.email !== undefined ? { email: String(body.email || existing.email).trim().toLowerCase() } : {}),
        ...(body.name !== undefined || body.displayName !== undefined ? { name: String(body.name || body.displayName || "").trim() || null } : {}),
        ...(body.active !== undefined && isAdmin(auth.user) ? { active: body.active === true || body.active === "true" || body.active === "1" } : {}),
        ...(role && isAdmin(auth.user) ? { role } : {}),
        ...(passwordHash ? { passwordHash } : {}),
        ...(circleId !== undefined && existing.tenantId === auth.user.tenantId ? { circleId } : {}),
        profile: {
          upsert: {
            create: { displayName: String(body.displayName || body.name || "").trim() || null },
            update: {
              ...(body.displayName !== undefined || body.name !== undefined ? { displayName: String(body.displayName || body.name || "").trim() || null } : {}),
              ...(body.bio !== undefined ? { bio: String(body.bio || "").trim() || null } : {})
            }
          }
        }
      }
    });
    if (auth.user.tenantId && (role || circleId !== undefined)) {
      await tx.tenantMembership.updateMany({
        where: { tenantId: auth.user.tenantId, userId: existing.id },
        data: { ...(role ? { role } : {}), ...(circleId !== undefined ? { circleId } : {}) }
      });
    }
    return tx.user.findUniqueOrThrow({
      where: { id: existing.id },
      include: { profile: true, memberships: { include: { tenant: true, circle: true } } }
    });
  });
  const item = userItem(user, auth.user.tenantId);
  await logAction({ actorId: auth.user.id, action: "user_updated_api", entityType: "user", entityId: user.id, title: `Benutzer geändert: ${item.displayName}`, href: "/settings/users", details: { tenantId: item.tenantId, circleId: item.circleId } });
  return NextResponse.json({ ok: true, item, user: item });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  if (!isAdmin(auth.user)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (params.id === auth.user.id) return NextResponse.json({ ok: false, error: "cannot_delete_self" }, { status: 400 });
  const user = await findUser(auth.user, params.id);
  if (!user) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  await prisma.user.update({ where: { id: user.id }, data: { active: false } });
  await logAction({ actorId: auth.user.id, action: "user_deactivated_api", entityType: "user", entityId: user.id, title: `Benutzer per API deaktiviert: ${userItem(user).displayName}`, href: "/settings/users" });
  return NextResponse.json({ ok: true, id: user.id, active: false });
}
