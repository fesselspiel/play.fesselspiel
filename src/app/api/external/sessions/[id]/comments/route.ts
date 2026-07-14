import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";
import { findExternalSession, serializeExternalSession } from "../../_helpers";

export const runtime = "nodejs";

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "activities");
  if (blocked) return blocked;
  const session = await findExternalSession(auth.user, params.id);
  if (!session) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const text = String(body.body || body.text || "").trim();
  if (!text) return NextResponse.json({ ok: false, error: "body_required" }, { status: 400 });
  const comment = await prisma.activityComment.create({ data: { activityId: session.id, ownerId: auth.user.id, body: text } });
  await logAction({ actorId: auth.user.id, action: "activity_session_commented_api", entityType: "activity", entityId: session.id, title: `Session per API kommentiert: ${session.title}`, href: `/activities/${session.slug}`, details: { commentId: comment.id } });
  const updated = await findExternalSession(auth.user, session.id);
  return NextResponse.json({ ok: true, commentId: comment.id, item: updated ? serializeExternalSession(request, updated, auth.user.id) : null }, { status: 201 });
}
