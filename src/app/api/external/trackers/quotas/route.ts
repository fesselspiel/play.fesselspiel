import { NextRequest, NextResponse } from "next/server";
import { entityLikeStateForEntity } from "@/lib/entity-likes";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { quotaSummaryText, trackerQuotaStatusForUser } from "@/lib/tracker-quotas";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers");
  if (blocked) return blocked;
  const trackerKey = request.nextUrl.searchParams.get("trackerKey")?.trim().toLowerCase();
  const quotas = await trackerQuotaStatusForUser(auth.user);
  const filteredQuotas = quotas
    .filter((entry) => entry.hasQuota)
    .filter((entry) => !trackerKey || entry.tracker.key.toLowerCase() === trackerKey || entry.tracker.title.toLowerCase().includes(trackerKey));
  const items = await Promise.all(filteredQuotas.map(async (entry) => {
    const state = await entityLikeStateForEntity({
      entityType: "trackerQuota",
      entityId: entry.quotaEntityId,
      ownerId: auth.user.id,
      tenantId: auth.user.tenantId,
      title: `Kontingent: ${entry.tracker.title}`,
      href: `/sessions/${entry.tracker.key}`
    }, auth.user.id);
    return {
      tracker: entry.tracker,
      daily: entry.daily,
      weekly: entry.weekly,
      weeklyMode: entry.weeklyMode,
      weekStartsOn: entry.weekStartsOn,
      periods: entry.periods,
      monthlyMinutes: entry.monthlyMinutes,
      monthlyDays: entry.monthlyDays,
      complete: entry.complete,
      summary: quotaSummaryText(entry),
      eventId: state.eventId,
      canLike: state.canLike,
      likedByMe: state.likedByMe,
      likeCount: state.likeCount,
      canComment: state.canComment,
      commentCount: state.commentCount,
      engagement: {
        likes: state.likes,
        comments: state.comments
      }
    };
  }));
  return NextResponse.json({
    ok: true,
    quotas: items
  });
}
