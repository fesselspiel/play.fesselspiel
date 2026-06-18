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
};

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(value: string) {
  return createHmac("sha256", env.jwtSecret).update(value).digest("base64url");
}

export function createSessionToken(userId: string, remember: boolean) {
  const payload: SessionPayload = {
    userId,
    exp: Date.now() + (remember ? 1000 * 60 * 60 * 24 * 30 : 1000 * 60 * 60 * 12)
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
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
  if (!payload.userId || payload.exp < Date.now()) return null;
  return payload;
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
  return prisma.user.findFirst({ where: { id: session.userId, active: true }, include: { settings: true, profile: true, circle: true } });
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Response("Nicht angemeldet", { status: 401 });
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Response("Nicht berechtigt", { status: 403 });
  return user;
}

export function setSessionCookie(response: NextResponse, token: string, remember: boolean) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: remember ? 60 * 60 * 24 * 30 : 60 * 60 * 12
  });
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
  return prisma.user.findFirst({ where: { id: session.userId, active: true }, include: { settings: true, circle: true } });
}
