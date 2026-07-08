import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requestValues, requireApiUser } from "@/lib/external-api";
import { decryptSecret } from "@/lib/crypto";
import { createInvite, inviteUrl, inviteUsage } from "@/lib/invites";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function handleInvite(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "invites");
  if (blocked) return blocked;
  if (request.method === "GET" && !new URL(request.url).searchParams.get("create")) {
    const usage = await inviteUsage(auth.user);
    const invites = await prisma.userInvite.findMany({
      where: {
        tenantId: auth.user.tenantId || undefined,
        ...(auth.user.role === "ADMIN" || auth.user.role === "SUPER_ADMIN" ? {} : { invitedById: auth.user.id })
      },
      include: {
        invitedBy: { include: { profile: true } },
        acceptedBy: { include: { profile: true } }
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100
    });
    const items = invites.map((invite) => {
      const token = decryptSecret(invite.tokenEnc);
      const url = token && invite.status === "OPEN" ? inviteUrl(token) : null;
      return {
        id: invite.id,
        name: invite.name,
        email: invite.email,
        status: invite.status,
        inviteUrl: url,
        url,
        token: token || null,
        createdAt: invite.createdAt.toISOString(),
        updatedAt: invite.updatedAt.toISOString(),
        expiresAt: invite.expiresAt.toISOString(),
        acceptedAt: invite.acceptedAt?.toISOString() || null,
        usedAt: invite.acceptedAt?.toISOString() || null,
        invitedBy: {
          id: invite.invitedBy.id,
          username: invite.invitedBy.username,
          displayName: invite.invitedBy.profile?.displayName || invite.invitedBy.name || invite.invitedBy.username || invite.invitedBy.email
        },
        acceptedBy: invite.acceptedBy ? {
          id: invite.acceptedBy.id,
          username: invite.acceptedBy.username,
          displayName: invite.acceptedBy.profile?.displayName || invite.acceptedBy.name || invite.acceptedBy.username || invite.acceptedBy.email
        } : null
      };
    });
    return NextResponse.json({ ok: true, usage, count: items.length, items, invites: items });
  }
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_missing" }, { status: 400 });
  const values = await requestValues(request);
  const result = await createInvite({
    tenantId: auth.user.tenantId,
    invitedBy: auth.user,
    email: values.get("email"),
    name: values.get("name"),
    sendEmail: values.get("sendEmail") === "1" || values.get("sendEmail") === "true",
    bcc: values.get("bcc")
  });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error, usage: result.usage }, { status: 403 });
  return NextResponse.json({ ok: true, inviteId: result.invite.id, inviteUrl: result.url, expiresAt: result.invite.expiresAt });
}

export async function GET(request: NextRequest) {
  return handleInvite(request);
}

export async function POST(request: NextRequest) {
  return handleInvite(request);
}
