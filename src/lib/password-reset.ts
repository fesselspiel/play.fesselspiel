import { createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPasswordReset(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 2);
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: tokenHash(token),
      expiresAt
    }
  });
  return {
    token,
    expiresAt,
    resetUrl: `${env.appUrl}/password/reset?token=${encodeURIComponent(token)}`
  };
}

export async function findValidPasswordReset(token: string) {
  if (!token) return null;
  return prisma.passwordResetToken.findFirst({
    where: {
      tokenHash: tokenHash(token),
      usedAt: null,
      expiresAt: { gt: new Date() }
    },
    include: { user: { include: { profile: true } } }
  });
}
