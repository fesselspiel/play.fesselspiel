import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { currentTenant } from "@/lib/tenancy";

export const SESSION_COOKIE = "fesselspiel_session";

type SessionPayload = {
  userId: string;
  exp: number;
  viewAsUserId?: string;
  viewAsTenantId?: string;
};

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(value: string) {
  return createHmac("sha256", env.jwtSecret).update(value).digest("base64url");
}

export function createSessionToken(userId: string, remember: boolean, viewAsUserId?: string, viewAsTenantId?: string) {
  const payload: SessionPayload = {
    userId,
    exp: Date.now() + (remember ? 1000 * 60 * 60 * 24 * 30 : 1000 * 60 * 60 * 12),
    ...(viewAsUserId ? { viewAsUserId } : {}),
    ...(viewAsTenantId ? { viewAsTenantId } : {})
  };
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token?: string | null): SessionPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  const given = Buffer.from(signature);
  const signed = Buffer.from(expected);
  if (given.length !== signed.length || !timingSafeEqual(given, signed)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.userId || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function login(identifier: string, password: string, remember: boolean) {
  const tenant = await currentTenant();
  const user = await prisma.user.findFirst({
    where: {
      active: true,
      AND: [{
        OR: [{ email: identifier.toLowerCase() }, { username: identifier }]
      }]
    }
  });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return null;
  const membership = tenant?.id
    ? await ensureTenantMembership(user.id, tenant.id)
    : null;
  if (tenant?.id && user.role !== "SUPER_ADMIN" && !membership) return null;
  const token = createSessionToken(user.id, remember);
  if (remember) {
    await prisma.user.update({
      where: { id: user.id },
      data: { rememberTokenHash: createHmac("sha256", env.jwtSecret).update(token).digest("hex") }
    });
  }
  return { user, token };
}

type IncludedUser = NonNullable<Awaited<ReturnType<typeof loadUser>>>;

async function loadUser(id: string) {
  return prisma.user.findFirst({
    where: { id, active: true },
    include: { settings: true, profile: true, circle: true, tenant: { include: { domains: true, features: true } } }
  });
}

async function ensureTenantMembership(userId: string, tenantId: string) {
  const existing = await prisma.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId, userId } }, include: { circle: true, tenant: { include: { domains: true, features: true } } } });
  if (existing?.active) return existing;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tenantId: true, circleId: true, role: true, active: true } });
  if (!user?.active) return null;
  if (user.role === "SUPER_ADMIN" || user.tenantId === tenantId) {
    return prisma.tenantMembership.upsert({
      where: { tenantId_userId: { tenantId, userId } },
      update: { active: true, role: user.role === "SUPER_ADMIN" ? "ADMIN" : user.role, circleId: user.circleId },
      create: { tenantId, userId, role: user.role === "SUPER_ADMIN" ? "ADMIN" : user.role, circleId: user.circleId, active: true },
      include: { circle: true, tenant: { include: { domains: true, features: true } } }
    });
  }
  return null;
}

async function tenantMembershipFor(user: IncludedUser, tenantId?: string | null) {
  if (!tenantId) return null;
  const membership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId, userId: user.id } },
    include: { circle: true, tenant: { include: { domains: true, features: true } } }
  });
  if (membership?.active) return membership;
  return ensureTenantMembership(user.id, tenantId);
}

function withEffectiveMembership(user: IncludedUser, membership: Awaited<ReturnType<typeof tenantMembershipFor>>, tenant: Awaited<ReturnType<typeof currentTenant>> | null) {
  if (!membership) return user;
  return {
    ...user,
    tenantId: membership.tenantId,
    tenant: membership.tenant || tenant || user.tenant,
    circleId: membership.circleId,
    circle: membership.circle,
    role: user.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : membership.role
  };
}

export async function currentUser() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) return null;
  const actor = await loadUser(session.userId);
  if (!actor) return null;
  const tenant = session.viewAsTenantId && actor.role === "SUPER_ADMIN"
    ? await prisma.tenant.findUnique({ where: { id: session.viewAsTenantId }, include: { domains: true, features: true } })
    : await currentTenant();
  const actorMembership = await tenantMembershipFor(actor, tenant?.id);
  const effectiveActor = withEffectiveMembership(actor, actorMembership, tenant);
  if (!session.viewAsUserId || (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN")) return effectiveActor;
  const target = await loadUser(session.viewAsUserId);
  if (!target) return effectiveActor;
  const targetMembership = await tenantMembershipFor(target, tenant?.id);
  if (!targetMembership && actor.role !== "SUPER_ADMIN") return effectiveActor;
  return withEffectiveMembership(target, targetMembership, tenant) || effectiveActor;
}

export async function currentSessionUser() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) return null;
  return loadUser(session.userId);
}

export async function currentSessionContext() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) return { actor: null, user: null, tenant: null, viewAsUserId: null, viewAsTenantId: null };
  const actor = await loadUser(session.userId);
  if (!actor) return { actor: null, user: null, tenant: null, viewAsUserId: null, viewAsTenantId: null };
  const canImpersonate = actor.role === "ADMIN" || actor.role === "SUPER_ADMIN";
  const rawUser = session.viewAsUserId && canImpersonate
    ? await loadUser(session.viewAsUserId)
    : actor;
  const tenant = session.viewAsTenantId && actor.role === "SUPER_ADMIN"
    ? await prisma.tenant.findUnique({ where: { id: session.viewAsTenantId }, include: { domains: true, features: true } })
    : await currentTenant();
  const actorMembership = await tenantMembershipFor(actor, tenant?.id);
  const userMembership = rawUser ? await tenantMembershipFor(rawUser, tenant?.id) : null;
  const effectiveActor = withEffectiveMembership(actor, actorMembership, tenant);
  const effectiveUser = rawUser && (userMembership || actor.role === "SUPER_ADMIN")
    ? withEffectiveMembership(rawUser, userMembership, tenant)
    : effectiveActor;
  return {
    actor: effectiveActor,
    user: effectiveUser,
    tenant,
    membership: userMembership,
    actorMembership,
    viewAsUserId: session.viewAsUserId || null,
    viewAsTenantId: session.viewAsTenantId || null
  };
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Response("Nicht angemeldet", { status: 401 });
  return user;
}

export async function requireAdmin() {
  const user = await currentSessionUser();
  if (!user) throw new Response("Nicht angemeldet", { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") throw new Response("Nicht berechtigt", { status: 403 });
  return user;
}

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge
  };
}

export function setSessionCookie(response: NextResponse, token: string, remember: boolean) {
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(remember ? 60 * 60 * 24 * 30 : 60 * 60 * 12));
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}

export function randomSecret() {
  return randomBytes(32).toString("hex");
}

export async function userFromRequest(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) return null;
  const actor = await prisma.user.findFirst({ where: { id: session.userId, active: true }, include: { settings: true, profile: true, circle: true, tenant: { include: { domains: true, features: true } } } });
  if (!actor) return null;
  const tenant = session.viewAsTenantId && actor.role === "SUPER_ADMIN"
    ? await prisma.tenant.findUnique({ where: { id: session.viewAsTenantId }, include: { domains: true, features: true } })
    : await currentTenant();
  const actorMembership = await tenantMembershipFor(actor, tenant?.id);
  const effectiveActor = withEffectiveMembership(actor, actorMembership, tenant);
  if (!session.viewAsUserId || (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN")) return effectiveActor;
  const target = await prisma.user.findFirst({ where: { id: session.viewAsUserId, active: true }, include: { settings: true, profile: true, circle: true, tenant: { include: { domains: true, features: true } } } });
  if (!target) return effectiveActor;
  const targetMembership = await tenantMembershipFor(target, tenant?.id);
  return targetMembership || actor.role === "SUPER_ADMIN" ? withEffectiveMembership(target, targetMembership, tenant) : effectiveActor;
}
