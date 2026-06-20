import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

export const SESSION_COOKIE = "fesselspiel_session";

type SessionPayload = {
  userId: string;
  exp: number;
  viewAsUserId?: string;
};

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(value: string) {
  return createHmac("sha256", env.jwtSecret).update(value).digest("base64url");
}

export function createSessionToken(userId: string, remember: boolean, viewAsUserId?: string) {
  const payload: SessionPayload = {
    userId,
    exp: Date.now() + (remember ? 1000 * 60 * 60 * 24 * 30 : 1000 * 60 * 60 * 12),
    ...(viewAsUserId ? { viewAsUserId } : {})
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
  const user = await prisma.user.findFirst({
    where: {
      active: true,
      OR: [{ email: identifier.toLowerCase() }, { username: identifier }]
    }
  });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return null;
  const token = createSessionToken(user.id, remember);
  if (remember) {
    await prisma.user.update({
      where: { id: user.id },
      data: { rememberTokenHash: createHmac("sha256", env.jwtSecret).update(token).digest("hex") }
    });
  }
  return { user, token };
}

export async function currentUser() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) return null;
  const actor = await prisma.user.findFirst({ where: { id: session.userId, active: true }, include: { settings: true, profile: true, circle: true } });
  if (!actor) return null;
  if (!session.viewAsUserId || actor.role !== "ADMIN") return actor;
  return await prisma.user.findFirst({ where: { id: session.viewAsUserId, active: true }, include: { settings: true, profile: true, circle: true } }) || actor;
}

export async function currentSessionUser() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) return null;
  return prisma.user.findFirst({ where: { id: session.userId, active: true }, include: { settings: true, profile: true, circle: true } });
}

export async function currentSessionContext() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) return { actor: null, user: null, viewAsUserId: null };
  const actor = await prisma.user.findFirst({ where: { id: session.userId, active: true }, include: { settings: true, profile: true, circle: true } });
  if (!actor) return { actor: null, user: null, viewAsUserId: null };
  const user = session.viewAsUserId && actor.role === "ADMIN"
    ? await prisma.user.findFirst({ where: { id: session.viewAsUserId, active: true }, include: { settings: true, profile: true, circle: true } })
    : actor;
  return { actor, user: user || actor, viewAsUserId: session.viewAsUserId || null };
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Response("Nicht angemeldet", { status: 401 });
  return user;
}

export async function requireAdmin() {
  const user = await currentSessionUser();
  if (!user) throw new Response("Nicht angemeldet", { status: 401 });
  if (user.role !== "ADMIN") throw new Response("Nicht berechtigt", { status: 403 });
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
  const actor = await prisma.user.findFirst({ where: { id: session.userId, active: true }, include: { settings: true, circle: true } });
  if (!actor) return null;
  if (!session.viewAsUserId || actor.role !== "ADMIN") return actor;
  return await prisma.user.findFirst({ where: { id: session.viewAsUserId, active: true }, include: { settings: true, circle: true } }) || actor;
}
