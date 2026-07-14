import { NextRequest, NextResponse } from "next/server";
import { mediaVisibilityScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "media");
  if (blocked) return blocked;
  const media = await prisma.media.findFirst({ where: { id: params.id, ...(await mediaVisibilityScope(auth.user)) }, select: { id: true, title: true } });
  if (!media) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const text = String(body.body || body.comment || body.text || "").trim();
  if (!text) return NextResponse.json({ ok: false, error: "comment_required" }, { status: 400 });
  const comment = await prisma.mediaComment.create({
    data: { mediaId: media.id, ownerId: auth.user.id, body: text },
    include: { owner: { include: { profile: true } } }
  });
  await logAction({ actorId: auth.user.id, action: "media_commented", entityType: "media", entityId: media.id, title: `Kommentar zu ${media.title}`, href: "/settings/media" });
  return NextResponse.json({
    ok: true,
    comment: {
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      owner: {
        id: comment.owner.id,
        username: comment.owner.username,
        displayName: comment.owner.profile?.displayName || comment.owner.name || comment.owner.username || comment.owner.email
      }
    }
  }, { status: 201 });
}
