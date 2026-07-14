import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { accessibleOwnerIds } from "@/lib/access";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { actionLabel, notificationActionAliases } from "@/lib/notification-actions";
import { defaultFeedBodyTemplate, defaultFeedTitleTemplate, renderFeedTemplate } from "@/lib/feed";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function displayName(user?: { profile?: { displayName?: string | null } | null; name?: string | null; username?: string | null; email?: string | null } | null) {
  return user?.profile?.displayName || user?.name || user?.username || user?.email || null;
}

function publicOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  if (host && !host.startsWith("0.0.0.0")) return `${forwardedProto}://${host}`;
  return env.appUrl || new URL(request.url).origin;
}

function absoluteUrl(request: NextRequest, href?: string | null) {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  return new URL(href.startsWith("/") ? href : `/${href}`, publicOrigin(request)).toString();
}

function actionFilter(searchParams: URLSearchParams) {
  const raw = [
    ...searchParams.getAll("action"),
    ...String(searchParams.get("actions") || "").split(",")
  ]
    .map((entry) => entry.trim())
    .filter(Boolean);
  return raw.length ? Array.from(new Set(raw)) : [];
}

function parseDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function boolParam(searchParams: URLSearchParams, key: string, defaultValue: boolean) {
  const raw = searchParams.get(key);
  if (raw == null) return defaultValue;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "auditLog");
  if (blocked) return blocked;

  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 50)));
  const cursor = String(searchParams.get("cursor") || "").trim();
  const since = parseDate(searchParams.get("since") || searchParams.get("after"));
  const includeDelivery = boolParam(searchParams, "includeDelivery", false);
  const includeDismissed = boolParam(searchParams, "includeDismissed", false);
  const includeDetails = boolParam(searchParams, "includeDetails", true);
  const actions = actionFilter(searchParams);
  const ownerIds = await accessibleOwnerIds(auth.user);

  const where: Prisma.AuditLogWhereInput = {
    actorId: { in: ownerIds },
    ...(includeDismissed ? {} : { feedDismissals: { none: { userId: auth.user.id } } }),
    ...(actions.length ? { action: { in: actions } } : {}),
    ...(since ? { createdAt: { gt: since } } : {}),
    ...(includeDelivery ? {} : {
      NOT: {
        action: {
          in: [
            "email_sent",
            "email_failed",
            "email_skipped",
            "telegram_notification_sent",
            "telegram_notification_failed",
            "external_push_sent",
            "external_push_failed",
            "native_push_device_deleted",
            "entity_like_anchor",
            "tracker_quota_reminder",
            "play_ready_expired"
          ]
        }
      }
    })
  };

  const entries = await prisma.auditLog.findMany({
    where,
    include: {
      actor: { include: { profile: true } },
      feedLikes: { include: { user: { include: { profile: true } } }, orderBy: { createdAt: "asc" } },
      feedDismissals: { where: { userId: auth.user.id }, select: { id: true, createdAt: true } },
      feedComments: { include: { author: { include: { profile: true } } }, orderBy: { createdAt: "asc" } }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  });
  const pageEntries = entries.slice(0, limit);
  const nextCursor = entries.length > limit ? entries[limit]?.id || null : null;
  const actionKeys = Array.from(new Set(pageEntries.flatMap((entry) => notificationActionAliases(entry.action))));
  const feedRules = actionKeys.length && auth.user.tenantId
    ? await prisma.feedRule.findMany({
        where: { tenantId: auth.user.tenantId, active: true, action: { in: actionKeys } }
      })
    : [];
  const feedRuleByAction = new Map(feedRules.map((rule) => [rule.action, rule]));

  return NextResponse.json({
    ok: true,
    nextCursor,
    count: pageEntries.length,
    filters: {
      limit,
      cursor: cursor || null,
      since: since?.toISOString() || null,
      actions,
      includeDelivery,
      includeDetails
    },
    items: pageEntries.map((entry) => {
      const actor = entry.actor;
      const rule = notificationActionAliases(entry.action).map((action) => feedRuleByAction.get(action)).find(Boolean);
      const href = entry.href || null;
      const url = absoluteUrl(request, href);
      const notificationTitle = renderFeedTemplate(rule?.titleTemplate || defaultFeedTitleTemplate(), entry, actor);
      const notificationBody = renderFeedTemplate(rule?.bodyTemplate || defaultFeedBodyTemplate(), entry, actor);
      const likedByMe = entry.feedLikes.some((like) => like.userId === auth.user.id);
      const dismissedForMe = entry.feedDismissals.length > 0;
      return {
        id: entry.id,
        action: entry.action,
        actionLabel: actionLabel(entry.action),
        title: entry.title,
        createdAt: entry.createdAt.toISOString(),
        href,
        url,
        entity: {
          type: entry.entityType,
          id: entry.entityId
        },
        actor: actor ? {
          id: actor.id,
          username: actor.username,
          displayName: displayName(actor),
          imageUrl: actor.profile?.imageUrl || null
        } : null,
        notification: {
          title: notificationTitle,
          body: notificationBody,
          url,
          deepLink: href
        },
        canLike: true,
        likedByMe,
        likeCount: entry.feedLikes.length,
        canComment: true,
        commentCount: entry.feedComments.length,
        dismissedForMe,
        engagement: {
          likes: entry.feedLikes.map((like) => ({
            id: like.id,
            createdAt: like.createdAt.toISOString(),
            own: like.userId === auth.user.id,
            user: like.user ? {
              id: like.user.id,
              username: like.user.username,
              displayName: displayName(like.user),
              imageUrl: like.user.profile?.imageUrl || null
            } : null
          })),
          comments: entry.feedComments.map((comment) => ({
            id: comment.id,
            body: comment.body,
            createdAt: comment.createdAt.toISOString(),
            author: comment.author ? {
              id: comment.author.id,
              username: comment.author.username,
              displayName: displayName(comment.author),
              imageUrl: comment.author.profile?.imageUrl || null
            } : null
          }))
        },
        details: includeDetails ? entry.details : undefined
      };
    })
  });
}
