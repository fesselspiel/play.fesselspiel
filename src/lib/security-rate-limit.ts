import { createHmac } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export type RateLimitPolicy = {
  scope: string;
  limit: number;
  windowMs: number;
  blockMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export function securitySubjectHash(subject: string) {
  return createHmac("sha256", env.encryptionKey).update(subject.trim().toLowerCase()).digest("hex");
}

export function requestClientAddress(request: Request) {
  return clientAddressFromHeaders(request.headers);
}

export function clientAddressFromHeaders(headers: Headers) {
  const direct = headers.get("x-real-ip")?.trim();
  if (direct) return direct;
  const forwarded = headers.get("x-forwarded-for")?.split(",").map((value) => value.trim()).filter(Boolean);
  return forwarded?.at(-1) || "unknown";
}

export function requestHostScope(request: Request) {
  return request.headers.get("host")?.trim().toLowerCase() || new URL(request.url).host.toLowerCase() || "unknown";
}

function retryAfterSeconds(until: Date, now: Date) {
  return Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000));
}

export async function checkRateLimit(policy: RateLimitPolicy, subject: string): Promise<RateLimitResult> {
  const now = new Date();
  const entry = await prisma.securityRateLimit.findUnique({
    where: { scope_keyHash: { scope: policy.scope, keyHash: securitySubjectHash(subject) } }
  });
  if (!entry || entry.expiresAt <= now) return { allowed: true, retryAfterSeconds: 0 };
  if (entry.blockedUntil && entry.blockedUntil > now) {
    return { allowed: false, retryAfterSeconds: retryAfterSeconds(entry.blockedUntil, now) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function recordRateLimitFailure(policy: RateLimitPolicy, subject: string): Promise<RateLimitResult> {
  const keyHash = securitySubjectHash(subject);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const now = new Date();
    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.securityRateLimit.findUnique({
          where: { scope_keyHash: { scope: policy.scope, keyHash } }
        });
        const activeWindow = existing && existing.expiresAt > now;
        const attempts = activeWindow ? existing.attempts + 1 : 1;
        const blockedUntil = attempts >= policy.limit ? new Date(now.getTime() + policy.blockMs) : null;
        const expiresAt = new Date(now.getTime() + Math.max(policy.windowMs, blockedUntil ? policy.blockMs : 0));
        await tx.securityRateLimit.upsert({
          where: { scope_keyHash: { scope: policy.scope, keyHash } },
          create: { scope: policy.scope, keyHash, windowStartedAt: now, attempts, blockedUntil, expiresAt },
          update: activeWindow
            ? { attempts, blockedUntil, expiresAt }
            : { windowStartedAt: now, attempts, blockedUntil, expiresAt }
        });
        return blockedUntil
          ? { allowed: false, retryAfterSeconds: retryAfterSeconds(blockedUntil, now) }
          : { allowed: true, retryAfterSeconds: 0 };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      const code = (error as Prisma.PrismaClientKnownRequestError)?.code;
      if ((code === "P2002" || code === "P2034") && attempt < 2) continue;
      throw error;
    }
  }
  return { allowed: false, retryAfterSeconds: Math.ceil(policy.blockMs / 1000) };
}

export async function consumeRateLimit(policy: RateLimitPolicy, subject: string) {
  const current = await checkRateLimit(policy, subject);
  return current.allowed ? recordRateLimitFailure(policy, subject) : current;
}

export async function clearRateLimit(policy: RateLimitPolicy, subject: string) {
  await prisma.securityRateLimit.deleteMany({ where: { scope: policy.scope, keyHash: securitySubjectHash(subject) } });
}

export async function pruneExpiredRateLimits() {
  return prisma.securityRateLimit.deleteMany({ where: { expiresAt: { lte: new Date() } } });
}
