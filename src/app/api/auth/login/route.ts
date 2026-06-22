import { NextResponse } from "next/server";
import { z } from "zod";
import { login, setSessionCookie } from "@/lib/auth";
import { logAction, userDisplayName } from "@/lib/audit";
import { formatDateTime } from "@/lib/dates";
import { sendTemplateEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const LoginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
  remember: z.boolean().optional()
});

export async function POST(request: Request) {
  const parsed = LoginSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  const result = await login(parsed.data.identifier, parsed.data.password, Boolean(parsed.data.remember));
  if (!result) {
    await logAction({
      action: "login_failed",
      title: `Login fehlgeschlagen: ${parsed.data.identifier}`,
      details: { identifier: parsed.data.identifier }
    });
    return NextResponse.json({ error: "Login fehlgeschlagen" }, { status: 401 });
  }
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
