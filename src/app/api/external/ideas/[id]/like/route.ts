import { NextRequest, NextResponse } from "next/server";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { activityInclude, serializeActivity } from "@/lib/external-mobile-serializers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function findIdea(user: { id: string; tenantId?: string | null; circleId?: string | null; role?: string | null }, id: string) {
  return prisma.activityPlan.findFirst({ where: { id, ...(await ownerScope(user)), category: "IDEA_COLLECTION" }, include: activityInclude });
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "ideas");
  if (blocked) return blocked;
  const idea = await findIdea(auth.user, params.id);
  if (!idea) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const current = idea.likes.some((like) => like.userId === auth.user.id);
  const liked = body.liked === undefined ? !current : Boolean(body.liked);
  if (liked && !current) {
    await prisma.activityLike.create({ data: { tenantId: auth.user.tenantId || undefined, activityId: idea.id, userId: auth.user.id } });
    await logAction({ actorId: auth.user.id, action: "idea_liked", entityType: "activity", entityId: idea.id, title: `Idee geliked: ${idea.title}`, href: `/ideas/${idea.slug}` });
  } else if (!liked && current) {
    await prisma.activityLike.deleteMany({ where: { activityId: idea.id, userId: auth.user.id } });
    await logAction({ actorId: auth.user.id, action: "idea_unliked", entityType: "activity", entityId: idea.id, title: `Like entfernt: ${idea.title}`, href: `/ideas/${idea.slug}` });
  }
  const updated = await findIdea(auth.user, params.id);
  return NextResponse.json({ ok: true, item: updated ? serializeActivity(request, updated) : serializeActivity(request, idea) });
}
