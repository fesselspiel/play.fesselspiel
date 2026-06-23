import { createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { sendTemplateEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createEmailConfirmation(userId: string, email?: string | null) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
  await prisma.emailConfirmationToken.create({
    data: {
      userId,
      email: email || null,
      tokenHash: tokenHash(token),
      expiresAt
    }
  });
  return {
    token,
    expiresAt,
    confirmUrl: `${env.appUrl}/email/confirm?token=${encodeURIComponent(token)}`
  };
}

export async function sendEmailConfirmation(user: { id: string; email: string; username?: string | null; name?: string | null; profile?: { displayName?: string | null } | null }) {
  if (!user.email || user.email.endsWith("@local.fesselspiel")) return { sent: false, skipped: "no-recipient" };
  const confirmation = await createEmailConfirmation(user.id, user.email);
  return sendTemplateEmail({
    key: "user_invite",
    to: user.email,
    actorId: user.id,
    source: "email-confirmation",
    entityType: "user",
    entityId: user.id,
    variables: {
      userName: user.profile?.displayName || user.name || user.username || user.email,
      loginIdentifier: user.username || user.email,
      appUrl: env.appUrl,
      profileUrl: `${env.appUrl}/profile`,
      confirmUrl: confirmation.confirmUrl
    }
  });
}

export async function findValidEmailConfirmation(token: string) {
  if (!token) return null;
  return prisma.emailConfirmationToken.findFirst({
    where: {
      tokenHash: tokenHash(token),
      usedAt: null,
      expiresAt: { gt: new Date() }
    },
    include: { user: { include: { profile: true } } }
  });
}
