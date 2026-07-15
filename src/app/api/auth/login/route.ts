import { NextResponse } from "next/server";
import { z } from "zod";
import { login, setSessionCookie } from "@/lib/auth";
import { logAction, userDisplayName } from "@/lib/audit";
import { formatDateTime } from "@/lib/dates";
import { sendTemplateEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, clearRateLimit, recordRateLimitFailure, requestClientAddress, requestHostScope, securitySubjectHash } from "@/lib/security-rate-limit";

const LoginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
  remember: z.boolean().optional()
});

const LOGIN_IDENTIFIER = { scope: "web-login-identifier", limit: 5, windowMs: 15 * 60_000, blockMs: 15_000 };
const LOGIN_ADDRESS = { scope: "web-login-address", limit: 30, windowMs: 15 * 60_000, blockMs: 15_000 };

function limited(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Zu viele Anmeldeversuche. Bitte versuche es später erneut.", code: "rate_limited", retryAfterSeconds },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}

export async function POST(request: Request) {
  const parsed = LoginSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  const host = requestHostScope(request);
  const identifierSubject = `${host}:${parsed.data.identifier}`;
  const addressSubject = `${host}:${requestClientAddress(request)}`;
  const [identifierLimit, addressLimit] = await Promise.all([
    checkRateLimit(LOGIN_IDENTIFIER, identifierSubject),
    checkRateLimit(LOGIN_ADDRESS, addressSubject)
  ]);
  if (!identifierLimit.allowed || !addressLimit.allowed) {
    return limited(Math.max(identifierLimit.retryAfterSeconds, addressLimit.retryAfterSeconds));
  }
  const result = await login(parsed.data.identifier, parsed.data.password, Boolean(parsed.data.remember));
  if (!result) {
    const [identifierFailure, addressFailure] = await Promise.all([
      recordRateLimitFailure(LOGIN_IDENTIFIER, identifierSubject),
      recordRateLimitFailure(LOGIN_ADDRESS, addressSubject)
    ]);
    await logAction({
      action: "login_failed",
      title: "Login fehlgeschlagen",
      details: { subjectFingerprint: securitySubjectHash(identifierSubject).slice(0, 12) }
    });
    if (!identifierFailure.allowed || !addressFailure.allowed) {
      return limited(Math.max(identifierFailure.retryAfterSeconds, addressFailure.retryAfterSeconds));
    }
    return NextResponse.json({ error: "Login fehlgeschlagen" }, { status: 401 });
  }
  await clearRateLimit(LOGIN_IDENTIFIER, identifierSubject);
  await prisma.user.update({ where: { id: result.user.id }, data: { lastLoginAt: new Date() } });
  await logAction({
    actorId: result.user.id,
    action: "login",
    entityType: "user",
    entityId: result.user.id,
    title: `${userDisplayName(result.user)} hat sich angemeldet`,
    href: "/profile"
  });
  await sendTemplateEmail({
    key: "login_success",
    to: result.user.email,
    actorId: result.user.id,
    source: "login",
    entityType: "user",
    entityId: result.user.id,
    variables: {
      userName: userDisplayName(result.user),
      loginIdentifier: result.user.username || result.user.email,
      loginTime: formatDateTime(new Date()),
      appUrl: env.appUrl,
      profileUrl: `${env.appUrl}/profile`
    }
  });
  const response = NextResponse.json({ ok: true });
  setSessionCookie(response, result.token, Boolean(parsed.data.remember));
  return response;
}
