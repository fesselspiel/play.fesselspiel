import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { Role } from "@prisma/client";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { normalizeUsername } from "@/lib/usernames";
import { passwordPolicyError } from "@/lib/password-policy";

export const runtime = "nodejs";

function isAdmin(user: { role?: string | null }) {
  return user.role === "ADMIN" || user.role === "SUPER_ADMIN";
}

function userItem(user: any) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.profile?.displayName || user.name || user.username || user.email,
    name: user.name,
    role: user.role,
    active: user.active,
    tenantId: user.tenantId,
    circleId: user.circleId,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString?.() || null,
    lastLoginAt: user.lastLoginAt?.toISOString?.() || null,
    createdAt: user.createdAt?.toISOString?.() || null
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  if (!isAdmin(auth.user)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const users = await prisma.user.findMany({
    where: auth.user.tenantId ? { memberships: { some: { tenantId: auth.user.tenantId, active: true } } } : {},
    include: { profile: true },
    orderBy: [{ name: "asc" }, { email: "asc" }]
  });
  return NextResponse.json({ ok: true, count: users.length, items: users.map(userItem), users: users.map(userItem) });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  if (!isAdmin(auth.user)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const username = normalizeUsername(String(body.username || ""));
  if (!username) return NextResponse.json({ ok: false, error: "username_required" }, { status: 400 });
  const email = String(body.email || `${username}@local.playplaner`).trim().toLowerCase();
  const exists = await prisma.user.findFirst({ where: { OR: [{ username }, { email }] }, select: { id: true } });
  if (exists) return NextResponse.json({ ok: false, error: "user_exists" }, { status: 409 });
  const password = String(body.password || randomBytes(18).toString("base64url"));
  if (body.password !== undefined && passwordPolicyError(password)) return NextResponse.json({ ok: false, error: "password_policy", minimumLength: 12, maximumLength: 128 }, { status: 400 });
  const role = String(body.role || "USER").toUpperCase() === "ADMIN" ? Role.ADMIN : Role.USER;
  const user = await prisma.user.create({
    data: {
      tenantId: auth.user.tenantId || undefined,
      username,
      email,
      name: String(body.name || body.displayName || username).trim(),
      passwordHash: await bcrypt.hash(password, 12),
      role,
      emailVerifiedAt: body.emailVerified === true ? new Date() : null,
      memberships: auth.user.tenantId ? { create: { tenantId: auth.user.tenantId, role, circleId: String(body.circleId || "") || null } } : undefined,
      profile: { create: { displayName: String(body.displayName || body.name || username).trim() || null } },
      settings: { create: {} }
    },
    include: { profile: true }
  });
  await logAction({ actorId: auth.user.id, action: "user_created_api", entityType: "user", entityId: user.id, title: `Benutzer per API angelegt: ${userItem(user).displayName}`, href: "/settings/users" });
  return NextResponse.json({ ok: true, item: userItem(user), user: userItem(user), generatedPassword: body.password ? undefined : password }, { status: 201 });
}
