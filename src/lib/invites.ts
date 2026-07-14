import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import type { Role } from "@prisma/client";
import { logAction, userDisplayName } from "@/lib/audit";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { sendTemplateEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { passwordPolicyError } from "@/lib/password-policy";

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteUrl(token: string) {
  return `${env.appUrl}/invite/${encodeURIComponent(token)}`;
}

export function canCreateUnlimitedInvites(user: { role: Role | string }) {
  return user.role === "ADMIN" || user.role === "SUPER_ADMIN";
}

export async function inviteUsage(user: { id: string; role: Role | string; settings?: { inviteQuota?: number | null } | null }) {
  const used = await prisma.userInvite.count({ where: { invitedById: user.id, status: { in: ["OPEN", "ACCEPTED"] } } });
  const quota = canCreateUnlimitedInvites(user) ? null : Math.max(0, user.settings?.inviteQuota ?? 3);
  return { used, quota, remaining: quota === null ? null : Math.max(0, quota - used) };
}

export async function createInvite(input: {
  tenantId: string;
  invitedBy: { id: string; role: Role | string; settings?: { inviteQuota?: number | null } | null; profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null };
  email?: string | null;
  name?: string | null;
  sendEmail?: boolean;
  bcc?: string | string[] | null;
}) {
  const usage = await inviteUsage(input.invitedBy);
  if (usage.remaining !== null && usage.remaining <= 0) return { ok: false as const, error: "quota_exhausted", usage };
  const token = randomBytes(32).toString("base64url");
  const invite = await prisma.userInvite.create({
    data: {
      tenantId: input.tenantId,
      invitedById: input.invitedBy.id,
      email: input.email?.trim().toLowerCase() || null,
      name: input.name?.trim() || null,
      tokenHash: tokenHash(token),
      tokenEnc: encryptSecret(token),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
    }
  });
  const url = inviteUrl(token);
  await logAction({
    actorId: input.invitedBy.id,
    action: "invite_created",
    entityType: "invite",
    entityId: invite.id,
    title: `Einladung erstellt${input.name ? `: ${input.name}` : ""}`,
    details: { email: invite.email, name: invite.name, expiresAt: invite.expiresAt.toISOString() },
    href: "/settings/invites"
  });
  if (input.sendEmail && invite.email) {
    await sendTemplateEmail({
      key: "user_invite_link",
      to: invite.email,
      bcc: input.bcc,
      actorId: input.invitedBy.id,
      source: "invite-create",
      entityType: "invite",
      entityId: invite.id,
      variables: {
        userName: invite.name || invite.email,
        inviterName: userDisplayName(input.invitedBy),
        inviteUrl: url,
        appUrl: env.appUrl
      }
    });
  }
  return { ok: true as const, invite, token, url, usage };
}

export async function resendInviteEmail(input: {
  tenantId: string;
  inviteId: string;
  actor: { id: string; role: Role | string; profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null };
}) {
  const invite = await prisma.userInvite.findFirst({
    where: { id: input.inviteId, tenantId: input.tenantId, invitedById: input.actor.id, status: "OPEN" },
    include: { invitedBy: { include: { profile: true } } }
  });
  if (!invite) return { ok: false as const, error: "not_found" };
  if (!invite.email) return { ok: false as const, error: "missing_email" };
  let token = decryptSecret(invite.tokenEnc);
  let expiresAt = invite.expiresAt;
  if (!token) {
    token = randomBytes(32).toString("base64url");
    expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);
    await prisma.userInvite.update({
      where: { id: invite.id },
      data: { tokenHash: tokenHash(token), tokenEnc: encryptSecret(token), expiresAt }
    });
  }
  const url = inviteUrl(token);
  const result = await sendTemplateEmail({
    key: "user_invite_link",
    to: invite.email,
    actorId: input.actor.id,
    source: "invite-resend",
    entityType: "invite",
    entityId: invite.id,
    variables: {
      userName: invite.name || invite.email,
      inviterName: userDisplayName(input.actor),
      inviteUrl: url,
      appUrl: env.appUrl
    }
  });
  await logAction({
    actorId: input.actor.id,
    action: "invite_email_resent",
    entityType: "invite",
    entityId: invite.id,
    title: `Einladung erneut per E-Mail gesendet: ${invite.name || invite.email}`,
    details: { email: invite.email, sent: result.sent, skipped: "skipped" in result ? result.skipped : null, expiresAt: expiresAt.toISOString() },
    href: "/settings/invites"
  });
  return { ok: true as const, sent: result.sent, url };
}

export async function findValidInvite(token: string) {
  if (!token) return null;
  return prisma.userInvite.findFirst({
    where: { tokenHash: tokenHash(token), status: "OPEN", expiresAt: { gt: new Date() } },
    include: { tenant: true, invitedBy: { include: { profile: true } } }
  });
}

export async function acceptInvite(input: {
  token: string;
  name: string;
  email: string;
  username?: string | null;
  password: string;
}) {
  const invite = await findValidInvite(input.token);
  if (!invite) return { ok: false as const, error: "invalid" };
  const email = input.email.trim().toLowerCase();
  const username = input.username?.trim() || null;
  if (!email.includes("@") || !input.password) return { ok: false as const, error: "missing" };
  const passwordError = passwordPolicyError(input.password);
  if (passwordError) return { ok: false as const, error: passwordError };
  if (invite.email && invite.email !== email) return { ok: false as const, error: "email_mismatch" };
  const [existingEmail, existingUsername] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    username ? prisma.user.findUnique({ where: { username }, select: { id: true } }) : Promise.resolve(null)
  ]);
  if (existingEmail) return { ok: false as const, error: "email_exists" };
  if (existingUsername) return { ok: false as const, error: "username_exists" };
  const user = await prisma.user.create({
    data: {
      tenantId: invite.tenantId,
      email,
      username,
      name: input.name.trim(),
      passwordHash: await bcrypt.hash(input.password, 12),
      role: "USER",
      active: true,
      emailVerifiedAt: new Date(),
      profile: { create: { displayName: input.name.trim() } },
      settings: { create: {} },
      memberships: { create: { tenantId: invite.tenantId, role: "USER", active: true } }
    }
  });
  await prisma.userInvite.update({
    where: { id: invite.id },
    data: { status: "ACCEPTED", acceptedById: user.id, acceptedAt: new Date() }
  });
  await logAction({
    actorId: user.id,
    action: "invite_accepted",
    entityType: "invite",
    entityId: invite.id,
    title: `Einladung angenommen: ${input.name.trim()}`,
    details: { invitedById: invite.invitedById, email },
    href: "/settings/invites"
  });
  return { ok: true as const, user };
}
