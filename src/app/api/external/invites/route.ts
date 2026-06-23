import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requestValues, requireApiUser } from "@/lib/external-api";
import { createInvite, inviteUsage } from "@/lib/invites";

export const runtime = "nodejs";

async function handleInvite(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "invites");
  if (blocked) return blocked;
  if (request.method === "GET" && !new URL(request.url).searchParams.get("create")) {
    return NextResponse.json({ ok: true, usage: await inviteUsage(auth.user) });
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
