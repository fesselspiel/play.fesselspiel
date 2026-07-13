import { NextRequest } from "next/server";
import { ownerScope } from "@/lib/access";
import { formatDateInput } from "@/lib/dates";
import { entityLikeStateForEntity, entityLikeStateMap } from "@/lib/entity-likes";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";
import { quotaSummaryText, trackerQuotaStatusForUser } from "@/lib/tracker-quotas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function openTrackerUrl(key: string, slug?: string | null, id?: string) {
  return `/trackers/${key}/${slug || id}`;
}

async function trackerSnapshot(user: any) {
  const scope = await ownerScope(user);
  const [openTrackers, recentTrackerEntries, quotas] = await Promise.all([
    prisma.trackerEntry.findMany({
      where: { ownerId: user.id, tenantId: user.tenantId || undefined, endTime: null, allDay: false, trackerType: { enabled: true } },
      include: { trackerType: true },
      orderBy: { startTime: "desc" }
    }),
    prisma.trackerEntry.findMany({
      where: { ...scope, trackerType: { enabled: true } },
      include: { trackerType: true },
      orderBy: [{ updatedAt: "desc" }, { startTime: "desc" }],
      take: 20
    }),
    trackerQuotaStatusForUser(user)
  ]);

  const openTrackerStates = await entityLikeStateMap("trackerEntry", openTrackers.map((entry) => entry.id), user.id, openTrackers.map((entry) => ({
    entityType: "trackerEntry",
    entityId: entry.id,
    ownerId: entry.ownerId,
    tenantId: entry.tenantId,
    title: entry.title || entry.trackerType.title,
    href: openTrackerUrl(entry.trackerType.key, entry.slug, entry.id)
  })));

  const mappedOpenTrackers = openTrackers.map((entry) => {
    const state = openTrackerStates.get(entry.id);
    return {
      id: entry.id,
      key: entry.trackerType.key,
      trackerKey: entry.trackerType.key,
      title: entry.title || entry.trackerType.title,
      trackerTitle: entry.trackerType.title,
      color: entry.trackerType.color,
      colorHex: entry.trackerType.color,
      tracker: {
        id: entry.trackerType.id,
        key: entry.trackerType.key,
        title: entry.trackerType.title,
        color: entry.trackerType.color,
        colorHex: entry.trackerType.color
      },
      startTime: entry.startTime.toISOString(),
      startedAt: entry.startTime.toISOString(),
      url: openTrackerUrl(entry.trackerType.key, entry.slug, entry.id),
      eventId: state?.eventId || null,
      canLike: state?.canLike ?? true,
      likedByMe: state?.likedByMe ?? false,
      likeCount: state?.likeCount ?? 0,
      canComment: state?.canComment ?? true,
      commentCount: state?.commentCount ?? 0,
      engagement: {
        likes: state?.likes || [],
        comments: state?.comments || []
      }
    };
  });

  const mappedRecent = recentTrackerEntries.map((entry) => ({
    id: entry.id,
    trackerKey: entry.trackerType.key,
    key: entry.trackerType.key,
    trackerTitle: entry.trackerType.title,
    trackerName: entry.trackerType.title,
    color: entry.trackerType.color,
    colorHex: entry.trackerType.color,
    tracker: {
      id: entry.trackerType.id,
      key: entry.trackerType.key,
      title: entry.trackerType.title,
      color: entry.trackerType.color,
      colorHex: entry.trackerType.color
    },
    title: entry.title || entry.trackerType.title,
    notes: entry.notes || "",
    startedAt: entry.startTime.toISOString(),
    startTime: entry.startTime.toISOString(),
    date: formatDateInput(entry.startTime),
    calendarDate: formatDateInput(entry.startTime),
    endedAt: entry.endTime?.toISOString() || null,
    endTime: entry.endTime?.toISOString() || null,
    durationMinutes: entry.durationMinutes,
    minutes: entry.durationMinutes,
    allDay: entry.allDay,
    href: openTrackerUrl(entry.trackerType.key, entry.slug, entry.id),
    url: openTrackerUrl(entry.trackerType.key, entry.slug, entry.id),
    updatedAt: entry.updatedAt.toISOString()
  }));

  const mappedQuotas = await Promise.all(quotas.filter((entry) => entry.hasQuota).map(async (entry) => {
    const state = await entityLikeStateForEntity({
      entityType: "trackerQuota",
      entityId: entry.quotaEntityId,
      ownerId: user.id,
      tenantId: user.tenantId,
      title: `Kontingent: ${entry.tracker.title}`,
      href: `/sessions/${entry.tracker.key}`
    }, user.id);
    return {
      tracker: entry.tracker,
      complete: entry.complete,
      summary: quotaSummaryText(entry),
      daily: entry.daily,
      weekly: entry.weekly,
      weeklyMode: entry.weeklyMode,
      weekStartsOn: entry.weekStartsOn,
      periods: entry.periods,
      monthlyMinutes: entry.monthlyMinutes,
      monthlyDays: entry.monthlyDays,
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

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    openTrackers: mappedOpenTrackers,
    recentTrackerEntries: mappedRecent,
    quotas: mappedQuotas
  };
}

function signature(snapshot: Awaited<ReturnType<typeof trackerSnapshot>>) {
  return JSON.stringify({
    open: snapshot.openTrackers.map((entry) => [entry.id, entry.startTime]),
    recent: snapshot.recentTrackerEntries.map((entry) => [entry.id, entry.updatedAt, entry.endTime, entry.durationMinutes]),
    quotas: snapshot.quotas.map((entry) => [entry.tracker?.key, entry.complete, entry.summary])
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers");
  if (blocked) return blocked;

  const encoder = new TextEncoder();
  let closed = false;
  let lastSignature = "";
  request.signal.addEventListener("abort", () => {
    closed = true;
  });

  const stream = new ReadableStream({
    async start(controller) {
      const initial = await trackerSnapshot(auth.user);
      lastSignature = signature(initial);
      controller.enqueue(encoder.encode(sse({
        ok: true,
        type: "snapshot",
        status: initial,
        openTrackers: initial.openTrackers,
        quotas: initial.quotas
      })));

      while (!closed) {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        if (closed) break;
        const next = await trackerSnapshot(auth.user);
        const nextSignature = signature(next);
        if (nextSignature !== lastSignature) {
          lastSignature = nextSignature;
          controller.enqueue(encoder.encode(sse({
            ok: true,
            type: "tracker_updated",
            status: next,
            openTrackers: next.openTrackers,
            quotas: next.quotas
          })));
        } else {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        }
      }
      controller.close();
    },
    cancel() {
      closed = true;
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Content-Encoding": "none",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive"
    }
  });
}
