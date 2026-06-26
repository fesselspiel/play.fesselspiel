import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, FileJson, LinkIcon, Play, Save, Search, Signal, Square, Ticket, Upload, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ApiNativeConsole } from "@/components/api-native-console";
import { CopyLink } from "@/components/copy-link";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Button, Field, inputClass, PageGuide, PageHeader, Panel, selectClass } from "@/components/ui";
import { apiNativeToolCatalog } from "@/lib/api-native-tool-catalog";
import { accessibleOwnerIds, bondageSystemVisibilityScope, mediaVisibilityScope, ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { apiEndpointSpecs, apiVariableNames, publicCapabilitySummary } from "@/lib/capabilities";
import { currentTenant } from "@/lib/tenancy";
import { createInvite, inviteUsage } from "@/lib/invites";
import { ensureDefaultAlbum } from "@/lib/albums";
import { fileAssetUrl, fileIdFromUrl, saveUploadedFile } from "@/lib/files";
import { featureEnabled, requireFeature } from "@/lib/features";
import { MediaKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { startTrackerEntry, stopAllRunningTrackerEntriesForUser, stopTrackerEntry } from "@/lib/tracker-core";
import { quotaSummaryText, trackerQuotaStatusForUser } from "@/lib/tracker-quotas";
import { formatDateTime, parseDateInput, parseDateTimeLocal } from "@/lib/dates";

type ApiControlSearchParams = {
  feedback?: string;
  tracker?: string;
  mediaQ?: string;
  mediaKind?: string;
  mediaAlbum?: string;
  mediaCursor?: string;
  mediaLimit?: string;
  mediaIncludeAlbums?: string;
  inviteUrl?: string;
  quotaTracker?: string;
  imageSource?: string;
  imageQ?: string;
  imageLimit?: string;
  fileQ?: string;
  fileLimit?: string;
  endpointQuery?: string;
  endpointGroup?: string;
};

type EndpointSpec = (typeof apiEndpointSpecs)[number];

type ApiTokenSummary = {
  id: string;
  name: string;
  tokenLastSix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

type ImageFeedItem = {
  id: string;
  source: string;
  entityType: string;
  entityId: string;
  title: string;
  subtitle: string | null;
  href: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  fileId: string | null;
  url: string;
  downloadUrl: string;
  downloadPath: string;
  downloadUrlWithToken: string | null;
  requiresAuthorization: boolean;
  mimeHint: string | null;
  owner: { id: string; username?: string | null; displayName?: string | null } | null;
  meta: Record<string, unknown>;
  portalUrl: string | null;
};

const maxPlayReadyDurationMinutes = 12 * 60;

function clampPlayReadyDurationMinutes(value: number | null | undefined) {
  if (!value || !Number.isFinite(value) || value <= 0) return 30;
  return Math.min(maxPlayReadyDurationMinutes, Math.ceil(value / 15) * 15);
}

function clampMediaLimit(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 12;
  return Math.min(60, Math.max(6, Math.round(parsed)));
}

function clampImageLimit(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 12;
  return Math.min(200, Math.max(6, Math.round(parsed)));
}

function clampFileLimit(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 12;
  return Math.min(60, Math.max(1, Math.round(parsed)));
}

function normalizeImageSource(raw: string | undefined) {
  const value = String(raw || "all").trim().toLowerCase();
  if (!value) return "all";
  if (value === "bondagesystem") return "bondage-system";
  return value;
}

function imageSourceAllows(raw: string, allowed: string[]) {
  return raw === "all" || allowed.includes(raw);
}

function parsePositiveInteger(value: string | null | undefined) {
  const raw = String(value || "").trim();
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseVisibility(value: string | null) {
  if (value === "PRIVATE" || value === "PARTNER" || value === "SHARED") return value;
  return null;
}

function playReadyFromText(value: string, current: boolean): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (["green", "an", "on", "1", "true", "aktiv", "ja"].includes(normalized)) return true;
  if (["red", "aus", "off", "0", "false", "inaktiv", "nein"].includes(normalized)) return false;
  if (["toggle", "switch", "umschalten"].includes(normalized)) return !current;
  return null;
}

function visibilityLabel(value: "PRIVATE" | "PARTNER" | "SHARED") {
  if (value === "PARTNER") return "Zirkel";
  if (value === "SHARED") return "Geteilt";
  return "Privat";
}

function feedbackText(feedback?: string, tracker?: string) {
  if (!feedback) return null;
  if (feedback === "tracker-started") return `Tracker ${tracker ? `„${tracker}“ ` : ""}gestartet.`;
  if (feedback === "tracker-stopped") return `Tracker ${tracker ? `„${tracker}“ ` : ""}gestoppt.`;
  if (feedback === "trackers-stopped-all") return "Alle offenen Tracker-Instanzen wurden gestoppt.";
  if (feedback === "tracker-not-running") return "Kein laufender Tracker für diesen Bereich gefunden.";
  if (feedback === "tracker-unavailable") return "Tracker nicht gefunden oder nicht aktiviert.";
  if (feedback === "playready-on") return "Spielampel wurde auf Grün gesetzt.";
  if (feedback === "playready-off") return "Spielampel wurde auf Rot gesetzt.";
  if (feedback === "playready-nochange") return "Spielampelstatus konnte nicht gelesen werden. Bitte Status angeben.";
  if (feedback === "media-uploaded") return "Datei wurde erfolgreich hochgeladen.";
  if (feedback === "media-upload-failed") return "Upload fehlgeschlagen.";
  if (feedback === "invite-created") return "Einladung wurde erstellt.";
  if (feedback === "invite-quota") return "Einladungskontingent ist aufgebraucht.";
  if (feedback === "invite-revoked") return "Einladung wurde widerrufen.";
  if (feedback === "invite-deleted") return "Einladung wurde gelöscht.";
  return null;
}

function jsonText(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function safeDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function userDisplayName(user: {
  profile?: { displayName?: string | null } | null;
  name?: string | null;
  username?: string | null;
  email?: string | null;
}) {
  return user.profile?.displayName || user.name || user.username || user.email || null;
}

function buildImageFeedItem(
  requestBase: string,
  input: {
    id: string;
    source: string;
    entityType: string;
    entityId: string;
    title: string;
    subtitle?: string | null;
    href?: string | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
    imageUrl?: string | null;
    owner?: { id: string; username?: string | null; displayName?: string | null } | null;
    meta?: Record<string, unknown>;
  }
) {
  const fileId = fileIdFromUrl(input.imageUrl);
  const portalUrl = fileId ? fileAssetUrl(fileId) : null;
  const downloadPath = fileId ? `/api/external/files/${fileId}` : input.imageUrl || "";
  const downloadUrl = fileId ? new URL(downloadPath, requestBase).toString() : input.imageUrl || "";
  return {
    id: input.id,
    source: input.source,
    entityType: input.entityType,
    entityId: input.entityId,
    title: input.title,
    subtitle: input.subtitle || null,
    href: input.href || null,
    createdAt: safeDate(input.createdAt || null),
    updatedAt: safeDate(input.updatedAt || null),
    fileId,
    url: portalUrl || downloadUrl,
    downloadUrl,
    downloadPath,
    downloadUrlWithToken: null,
    requiresAuthorization: Boolean(fileId),
    mimeHint: fileId ? null : null,
    owner: input.owner || null,
    meta: input.meta || {},
    portalUrl
  };
}

function endpointCurl(method: string, path: string) {
  const base = process.env.NEXT_PUBLIC_BASE_URL || "https://playplaner.com";
  return `curl -X ${method} \"${base}${path}\" -H \"Authorization: Bearer <API_TOKEN>\"`;
}

function endpointCurlWithQuery(method: string, path: string) {
  const base = process.env.NEXT_PUBLIC_BASE_URL || "https://playplaner.com";
  const hasTokenPlaceholder = path.includes("token=");
  const route = hasTokenPlaceholder ? path : `${path}${path.includes("?") ? "&" : "?"}token=<API_TOKEN>`;
  return `curl -X ${method} \"${base}${route}\"`;
}

function endpointRequestHint(endpoint: EndpointSpec, method: string) {
  const lowerPath = endpoint.path.toLowerCase();
  if (lowerPath.includes("/api/external/trackers/") && lowerPath.includes("/start")) {
    return method === "POST" ? "Pflicht: trackerKey im Pfad, Token im Header oder als token-Param. Für Ganztag: allDay=true&date=YYYY-MM-DD." : "Starten ohne Startzeit: allDay=true&date=YYYY-MM-DD";
  }
  if (lowerPath.includes("/api/external/trackers/") && lowerPath.includes("/stop")) {
    return "Pflicht: trackerKey im Pfad. Notiz optional über `note=`.";
  }
  if (lowerPath.includes("/api/external/invites")) {
    return lowerPath.includes("create=1")
      ? "Neue Einladung per `create=1` erzeugen (`name` optional, `email` optional)."
      : "GET ohne `create=1` liefert nur Usage und Quota-Status.";
  }
  if (lowerPath.includes("/api/external/media") && method === "POST") {
    return "Multipart-Upload: Felder `file`, optional `title` und `visibility`. Optionaler Album-Switch via sichtbares Standardalbum.";
  }
  if (lowerPath.includes("/api/external/play-ready") && method === "GET") {
    return "GET ohne State-Param: nur den Status lesen. Zum Setzen `state=green|red|toggle` und optional `expiresMinutes=...` oder `hours=...&minutes=...` verwenden.";
  }
  return null;
}

function endpointSampleForPath(
  endpoint: EndpointSpec,
  method: string,
  inviteQuotaSummary?: { used: number; quota: number | null; remaining: number | null }
) {
  const lowerPath = endpoint.path.toLowerCase();
  if (lowerPath.includes("/api/external/trackers/") && lowerPath.includes("/start")) {
    return { ok: true, trackerKey: "segufix", note: "Beispielstart", allDay: false };
  }
  if (lowerPath.includes("/api/external/trackers/") && lowerPath.includes("/stop")) {
    return { ok: true, trackerKey: "segufix", note: "Beispielstop" };
  }
  if (lowerPath.includes("/api/external/invites")) {
    return {
      ok: true,
      usage: inviteQuotaSummary ? {
        quota: inviteQuotaSummary.quota,
        used: inviteQuotaSummary.used,
        remaining: inviteQuotaSummary.remaining
      } : null,
      create: lowerPath.includes("create=1")
        ? { name: "Gast", email: "gast@example.com", sendEmail: true, bcc: "optional@example.com" }
        : { create: false }
    };
  }
  if (lowerPath.includes("/api/external/media") && method === "POST") {
    return {
      ok: true,
      action: "upload",
      fileFields: ["file", "title", "visibility", "albumId", "notes?"],
      message: "Multipart-Upload mit Bearer Token oder token-Query."
    };
  }
  return null;
}

function formatBytes(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let amount = value;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index++;
  }
  return `${index === 0 ? amount : amount.toFixed(1)} ${units[index]}`;
}

function groupedEndpoints() {
  const groups = new Map<string, EndpointSpec[]>();
  for (const endpoint of apiEndpointSpecs) {
    const group = endpoint.capability || "Sonstiges";
    const list = groups.get(group);
    if (list) list.push(endpoint);
    else groups.set(group, [endpoint]);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

async function applyPlayReady(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("externalApi");
  await requireFeature("playReady");

  const tenant = await currentTenant();
  const current = await prisma.userSettings.findUnique({
    where: { userId: user.id },
    select: { playReady: true, playReadyExpiryMinutes: true }
  });

  const nextState = playReadyFromText(String(formData.get("state") || ""), Boolean(current?.playReady));
  if (nextState === null) redirect("/settings/api-control?feedback=playready-nochange");

  const durationMinutesOverride = parsePositiveInteger(String(formData.get("durationMinutes") || undefined));
  const hours = parsePositiveInteger(String(formData.get("durationHours") || undefined)) || 0;
  const mins = parsePositiveInteger(String(formData.get("durationMinutesPart") || undefined)) || 0;
  const combinedDuration = hours > 0 || mins > 0 ? clampPlayReadyDurationMinutes(hours * 60 + mins) : null;
  const explicitDuration = durationMinutesOverride ? clampPlayReadyDurationMinutes(durationMinutesOverride) : combinedDuration;

  const defaultDuration = current?.playReadyExpiryMinutes || 360;
  const durationMinutes = nextState ? explicitDuration || defaultDuration : 0;
  const expiresAt = nextState && tenant?.playReadyExpiryEnabled !== false
    ? new Date(Date.now() + durationMinutes * 60_000)
    : null;

  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: {
      playReady: nextState,
      playReadyUpdatedAt: new Date(),
      playReadyExpiresAt: expiresAt,
      playReadyExpiryMinutes: nextState ? (durationMinutes || defaultDuration) : (current?.playReadyExpiryMinutes || 360)
    },
    create: {
      userId: user.id,
      playReady: nextState,
      playReadyUpdatedAt: new Date(),
      playReadyExpiresAt: expiresAt,
      playReadyExpiryMinutes: nextState ? (durationMinutes || defaultDuration) : (current?.playReadyExpiryMinutes || 360)
    }
  });

  await logAction({
    actorId: user.id,
    action: "play_ready_changed_control",
    entityType: "userSettings",
    entityId: user.id,
    title: `Spielampel durch Kontrollseite gesetzt: ${nextState ? "grün" : "rot"}`,
    details: { state: nextState, expiryMinutes: nextState ? (durationMinutes || defaultDuration) : null },
    href: "/settings/api-control"
  });

  redirect(`/settings/api-control?feedback=${nextState ? "playready-on" : "playready-off"}`);
}

async function startTracker(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("externalApi");

  const trackerKey = String(formData.get("trackerKey") || "").trim();
  if (!trackerKey) redirect("/settings/api-control?feedback=tracker-unavailable");
  await requireFeature(`tracker.${trackerKey}`);

  const note = String(formData.get("note") || "Per API-Kontrolle gestartet").trim();
  const allDay = formData.get("allDay") === "on";
  const dateValue = String(formData.get("date") || "").trim();
  const startTimeValue = String(formData.get("startTime") || "").trim();
  const startTime = allDay
    ? parseDateInput(dateValue)
    : parseDateTimeLocal(startTimeValue) || parseDateInput(dateValue);

  const entry = await startTrackerEntry({ key: trackerKey, user, startTime: startTime || undefined, allDay, notes: note });
  if (!entry) redirect("/settings/api-control?feedback=tracker-unavailable");

  await logAction({
    actorId: user.id,
    action: `tracker_${trackerKey}_started_control`,
    entityType: "trackerEntry",
    entityId: entry.id,
    title: `${entry.title || trackerKey} gestartet`,
    href: `/trackers/${trackerKey}/${entry.slug || entry.id}`
  });

  redirect(`/settings/api-control?feedback=tracker-started&tracker=${encodeURIComponent(trackerKey)}`);
}

async function stopTracker(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("externalApi");

  const trackerKey = String(formData.get("trackerKey") || "").trim();
  if (!trackerKey) redirect("/settings/api-control?feedback=tracker-unavailable");
  await requireFeature(`tracker.${trackerKey}`);

  const note = String(formData.get("note") || "").trim();
  const entry = await stopTrackerEntry({ key: trackerKey, user, notes: note });
  if (!entry) redirect("/settings/api-control?feedback=tracker-not-running");

  await logAction({
    actorId: user.id,
    action: `tracker_${trackerKey}_stopped_control`,
    entityType: "trackerEntry",
    entityId: entry.id,
    title: `${entry.title || trackerKey} gestoppt`,
    href: `/trackers/${trackerKey}/${entry.slug || entry.id}`
  });

  redirect(`/settings/api-control?feedback=tracker-stopped&tracker=${encodeURIComponent(trackerKey)}`);
}

async function stopAllTrackers() {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("externalApi");
  const { openEntries, stopped } = await stopAllRunningTrackerEntriesForUser({ user, notes: "Massenstopp per API-Kontrolle" });
  if (!stopped.length) redirect("/settings/api-control?feedback=tracker-not-running");

  for (const stoppedEntry of stopped) {
    const source = openEntries.find((entry) => entry.id === stoppedEntry.id);
    const key = source?.trackerType.key;
    if (!key) continue;
    await logAction({
      actorId: user.id,
      action: `tracker_${key}_stopped_control`,
      entityType: "trackerEntry",
      entityId: stoppedEntry.id,
      title: `${stoppedEntry.title || key} gestoppt`,
      href: `/trackers/${key}/${stoppedEntry.slug || stoppedEntry.id}`
    });
  }

  redirect("/settings/api-control?feedback=trackers-stopped-all");
}

async function createInviteAction(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("externalApi");
  await requireFeature("invites");

  const tenant = await currentTenant();
  if (!tenant?.id) redirect("/settings/api-control");
  const result = await createInvite({
    tenantId: tenant.id,
    invitedBy: user,
    name: String(formData.get("name") || "").trim() || undefined,
    email: String(formData.get("email") || "").trim() || undefined,
    sendEmail: formData.get("sendEmail") === "on"
  });

  if (!result.ok) redirect("/settings/api-control?feedback=invite-quota");

  redirect(`/settings/api-control?feedback=invite-created&inviteUrl=${encodeURIComponent(result.url)}`);
}

async function revokeInviteAction(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("externalApi");
  await requireFeature("invites");

  const tenant = await currentTenant();
  const id = String(formData.get("id") || "");
  if (!tenant?.id || !id) redirect("/settings/api-control");

  await prisma.userInvite.updateMany({
    where: { id, tenantId: tenant.id, invitedById: user.id, status: "OPEN" },
    data: { status: "REVOKED" }
  });
  redirect("/settings/api-control?feedback=invite-revoked");
}

async function deleteInviteAction(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("externalApi");
  await requireFeature("invites");

  const tenant = await currentTenant();
  const id = String(formData.get("id") || "");
  if (!tenant?.id || !id) redirect("/settings/api-control");

  const invite = await prisma.userInvite.findFirst({ where: { id, tenantId: tenant.id, invitedById: user.id } });
  if (!invite) redirect("/settings/api-control");
  await prisma.userInvite.delete({ where: { id: invite.id } });
  redirect("/settings/api-control?feedback=invite-deleted");
}

async function uploadMedia(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("externalApi");
  await requireFeature("media");

  const file = formData.get("file") as File | null;
  if (!file || file.size <= 0) redirect("/settings/api-control?feedback=media-upload-failed");

  const title = String(formData.get("title") || "").trim() || "API Upload";
  const asset = await saveUploadedFile(user.id, file);
  if (!asset) redirect("/settings/api-control?feedback=media-upload-failed");

  const scope = await ownerScope(user);
  const selectedAlbumId = String(formData.get("albumId") || "");
  const selectedAlbum = selectedAlbumId
    ? await prisma.album.findFirst({ where: { id: selectedAlbumId, ...scope } })
    : null;
  const album = selectedAlbum || (await ensureDefaultAlbum(user.id));
  const visibility = parseVisibility(String(formData.get("visibility"))); // includes default below
  const media = await prisma.media.create({
    data: {
      tenantId: user.tenantId || undefined,
      ownerId: user.id,
      albumId: album.id,
      title,
      kind: file.type.startsWith("video/") ? MediaKind.VIDEO : MediaKind.IMAGE,
      url: fileAssetUrl(asset.id),
      visibility: visibility ?? "PRIVATE"
    }
  });

  await logAction({
    actorId: user.id,
    action: "media_uploaded_via_control",
    entityType: "media",
    entityId: media.id,
    title: `Media Upload: ${media.title}`,
    href: `/media`
  });

  redirect("/settings/api-control?feedback=media-uploaded");
}

export default async function ApiControlPage({ searchParams }: { searchParams: ApiControlSearchParams }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/");

  await requireFeature("externalApi");
  const tenant = await currentTenant();
  const tenantFeatures = tenant?.features || [];
  const canManageMedia = featureEnabled(tenantFeatures, "media");
  const canManageTrackers = featureEnabled(tenantFeatures, "trackers");
  const canManageInvites = featureEnabled(tenantFeatures, "invites");
  const ownerWhere = await ownerScope(user);
  const mediaWhereScope = await mediaVisibilityScope(user);

  const [
    toys,
    positions,
    plannedActivities,
    mediaCount,
    trackerTypes,
    quotas,
    usage,
    openTrackers,
    albums,
    invites,
    apiTokensRaw
  ] = await Promise.all([
    prisma.toy.count({ where: ownerWhere }),
    prisma.position.count({ where: ownerWhere }),
    prisma.activityPlan.count({
      where: {
        ...ownerWhere,
        category: { not: "IDEA_COLLECTION" },
        status: { in: ["REQUESTED", "PLANNED"] }
      }
    }),
    prisma.media.count({ where: mediaWhereScope }),
    prisma.trackerType.findMany({
      where: {
        enabled: true,
        OR: [user.tenantId ? { tenantId: user.tenantId } : { tenantId: null }, { tenantId: null }]
      },
      orderBy: { title: "asc" }
    }),
    trackerQuotaStatusForUser(user),
    inviteUsage(user),
    prisma.trackerEntry.findMany({
      where: { ownerId: user.id, endTime: null, allDay: false },
      include: { trackerType: { select: { key: true, title: true, color: true } } },
      orderBy: { startTime: "desc" }
    }),
    prisma.album.findMany({
      where: ownerWhere,
      orderBy: { title: "asc" },
      select: { id: true, title: true }
    }),
    prisma.userInvite.findMany({
      where: { tenantId: tenant?.id || "", invitedById: user.id },
      include: { acceptedBy: { include: { profile: true } } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.apiToken.findMany({
      where: { userId: user.id, active: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        tokenLastSix: true,
        createdAt: true,
        lastUsedAt: true
      }
    })
  ]);

  const playReadySettings = await prisma.userSettings.findUnique({
    where: { userId: user.id },
    select: {
      playReady: true,
      playReadyExpiresAt: true,
      playReadyExpiryMinutes: true
    }
  });

  const mediaKind = String(searchParams.mediaKind || "").toUpperCase();
  const selectedKind = mediaKind === "VIDEO" ? MediaKind.VIDEO : mediaKind === "IMAGE" ? MediaKind.IMAGE : null;
  const mediaQuery = String(searchParams.mediaQ || "").trim();
  const mediaAlbum = String(searchParams.mediaAlbum || "").trim();
  const mediaLimit = clampMediaLimit(searchParams.mediaLimit);
  const mediaCursor = String(searchParams.mediaCursor || "");
  const mediaIncludeAlbums = !["0", "false", "off", "no"].includes(String(searchParams.mediaIncludeAlbums || "").trim().toLowerCase());
  const quotaTracker = String(searchParams.quotaTracker || "").trim().toLowerCase();
  const imageSource = normalizeImageSource(searchParams.imageSource);
  const imageQ = String(searchParams.imageQ || "").trim();
  const imageLimit = clampImageLimit(searchParams.imageLimit);
  const fileQuery = String(searchParams.fileQ || "").trim();
  const fileLimit = clampFileLimit(searchParams.fileLimit);
  const endpointQuery = String(searchParams.endpointQuery || "").trim().toLowerCase();
  const endpointGroupFilter = String(searchParams.endpointGroup || "").trim().toLowerCase();
  const requestBase = process.env.NEXT_PUBLIC_BASE_URL || "https://playplaner.com";

  const mediaWhere = {
    ...mediaWhereScope,
    ...(selectedKind ? { kind: selectedKind } : {}),
    ...(mediaAlbum ? { albumId: mediaAlbum } : {}),
    ...(mediaQuery ? { title: { contains: mediaQuery, mode: "insensitive" as const } } : {})
  };

  const mediaFeed = await prisma.media.findMany({
    where: mediaWhere,
    include: { album: true, owner: { include: { profile: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: mediaLimit + 1,
    ...(mediaCursor ? { cursor: { id: mediaCursor }, skip: 1 } : {})
  });

  const visibleMedia = mediaFeed.slice(0, mediaLimit);
  const nextMediaCursor = mediaFeed.length > mediaLimit ? mediaFeed[mediaLimit]?.id : null;

  const quotaAll = quotas
    .filter((entry) => entry.hasQuota)
    .map((entry) => ({
      key: entry.tracker.key,
      title: entry.tracker.title,
      daily: entry.daily,
      weekly: entry.weekly,
      monthlyMinutes: entry.monthlyMinutes,
      monthlyDays: entry.monthlyDays,
      complete: entry.complete,
      summary: quotaSummaryText(entry)
    }));

  const apiTokens: ApiTokenSummary[] = apiTokensRaw.map((entry) => ({
    id: entry.id,
    name: entry.name,
    tokenLastSix: entry.tokenLastSix,
    createdAt: safeDate(entry.createdAt) || new Date().toISOString(),
    lastUsedAt: safeDate(entry.lastUsedAt)
  }));

  const quotaPreview = quotaAll.filter((entry) => {
    if (!quotaTracker) return true;
    return entry.key.toLowerCase() === quotaTracker || entry.title.toLowerCase().includes(quotaTracker);
  });

  const imageItems: ImageFeedItem[] = [];
  const imageAdd = (entry: ImageFeedItem | null) => {
    if (entry) imageItems.push(entry);
  };

  const imageFeatures = tenant?.features;
  const fileAssets = await prisma.fileAsset.findMany({
    where: {
      ...(await ownerScope(user)),
      ...(fileQuery ? { originalName: { contains: fileQuery, mode: "insensitive" as const } } : {})
    },
    include: { owner: { include: { profile: true } } },
    orderBy: { createdAt: "desc" },
    take: fileLimit
  });

  const filePayload = {
    ok: true,
    limit: fileLimit,
    count: fileAssets.length,
    query: fileQuery || null,
    items: fileAssets.map((file) => ({
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      sizeHuman: formatBytes(file.sizeBytes),
      owner: file.owner.profile?.displayName || file.owner.name || file.owner.username || file.owner.email || "Unbekannt",
      createdAt: safeDate(file.createdAt),
      localUrl: fileAssetUrl(file.id),
      externalUrl: `/api/external/files/${file.id}`
    }))
  };

  if (imageSourceAllows(imageSource, ["media", "gallery", "bilder"]) && featureEnabled(imageFeatures, "media")) {
    const images = await prisma.media.findMany({
      where: {
        ...(await mediaVisibilityScope(user)),
        kind: MediaKind.IMAGE,
        ...(imageQ ? { title: { contains: imageQ, mode: "insensitive" as const } } : {})
      },
      include: { album: true, owner: { include: { profile: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: imageLimit
    });
    for (const entry of images) {
      imageAdd(buildImageFeedItem(requestBase, {
        id: `media:${entry.id}`,
        source: "media",
        entityType: "media",
        entityId: entry.id,
        title: entry.title,
        subtitle: entry.album?.title,
        href: `/media?view=${entry.id}`,
        imageUrl: entry.url,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        owner: {
          id: entry.owner.id,
          username: entry.owner.username,
          displayName: userDisplayName(entry.owner)
        },
        meta: {
          sourceId: entry.id,
          visibility: entry.visibility,
          effectiveVisibility: entry.visibility || entry.album?.visibility || "PRIVATE"
        }
      }));
    }
  }

  if (imageSourceAllows(imageSource, ["toys", "toy", "spielsachen"]) && featureEnabled(imageFeatures, "toys")) {
    const toysWithImage = await prisma.toy.findMany({
      where: {
        ...(await ownerScope(user)),
        imageUrl: { not: null },
        ...(imageQ ? { title: { contains: imageQ, mode: "insensitive" as const } } : {})
      },
      include: { owner: { include: { profile: true } } },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      take: imageLimit
    });
    for (const toy of toysWithImage) {
      imageAdd(buildImageFeedItem(requestBase, {
        id: `toy:${toy.id}`,
        source: "toys",
        entityType: "toy",
        entityId: toy.id,
        title: toy.title,
        subtitle: toy.description,
        href: `/toys/${toy.slug}`,
        imageUrl: toy.imageUrl,
        createdAt: toy.createdAt,
        updatedAt: toy.updatedAt,
        owner: { id: toy.owner.id, username: toy.owner.username, displayName: userDisplayName(toy.owner) },
        meta: { slug: toy.slug, selfBondageCapable: toy.selfBondageCapable }
      }));
    }
  }

  if (imageSourceAllows(imageSource, ["positions", "position", "scenes", "szenen", "situationen"]) && featureEnabled(imageFeatures, "positions")) {
    const positionsWithImage = await prisma.position.findMany({
      where: {
        ...(await ownerScope(user)),
        imageUrl: { not: null },
        ...(imageQ ? { name: { contains: imageQ, mode: "insensitive" as const } } : {})
      },
      include: { owner: { include: { profile: true } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: imageLimit
    });
    for (const position of positionsWithImage) {
      imageAdd(buildImageFeedItem(requestBase, {
        id: `position:${position.id}`,
        source: "positions",
        entityType: "position",
        entityId: position.id,
        title: position.name,
        subtitle: position.description,
        href: `/positions/${position.slug}`,
        imageUrl: position.imageUrl,
        createdAt: position.createdAt,
        updatedAt: position.updatedAt,
        owner: { id: position.owner.id, username: position.owner.username, displayName: userDisplayName(position.owner) },
        meta: { slug: position.slug, selfBondageCapable: position.selfBondageCapable }
      }));
    }
  }

  if (imageSourceAllows(imageSource, ["ideas", "idea", "ideen"]) && featureEnabled(imageFeatures, "ideas")) {
    const ideaImages = await prisma.activityPlan.findMany({
      where: {
        ...(await ownerScope(user)),
        category: "IDEA_COLLECTION",
        ...(imageQ ? { title: { contains: imageQ, mode: "insensitive" as const } } : {})
      },
      include: { owner: { include: { profile: true } }, images: { include: { file: true }, orderBy: { createdAt: "asc" } } },
      orderBy: [{ updatedAt: "desc" }],
      take: imageLimit
    });
    for (const idea of ideaImages) {
      for (const image of idea.images) {
        imageAdd(buildImageFeedItem(requestBase, {
          id: `idea:${idea.id}:${image.id}`,
          source: "ideas",
          entityType: "idea",
          entityId: idea.id,
          title: image.title || idea.title,
          subtitle: idea.title,
          href: `/ideas/${idea.slug}`,
          imageUrl: fileAssetUrl(image.fileId),
          createdAt: image.createdAt,
          updatedAt: idea.updatedAt,
          owner: { id: idea.owner.id, username: idea.owner.username, displayName: userDisplayName(idea.owner) },
          meta: {
            slug: idea.slug,
            imageId: image.id,
            fileName: image.file.originalName,
            mimeType: image.file.mimeType,
            sizeBytes: image.file.sizeBytes
          }
        }));
      }
    }
  }

  if (imageSourceAllows(imageSource, ["bondageSystem", "bondage-system", "products", "produkte"]) && featureEnabled(imageFeatures, "shopifyBondageSystem")) {
    const bondageItems = await prisma.bondageSystemItem.findMany({
      where: {
        tenantId: user.tenantId || "",
        visible: true,
        ...bondageSystemVisibilityScope(user),
        product: { imageUrl: { not: null }, ...(imageQ ? { title: { contains: imageQ, mode: "insensitive" as const } } : {}) }
      },
      include: { product: true },
      orderBy: [{ sortOrder: "asc" }, { product: { title: "asc" } }],
      take: imageLimit
    });
    for (const item of bondageItems) {
      imageAdd(buildImageFeedItem(requestBase, {
        id: `bondageSystem:${item.id}`,
        source: "bondageSystem",
        entityType: "bondageSystemItem",
        entityId: item.id,
        title: item.product.title,
        subtitle: item.product.vendor,
        href: `/bondage-system/${item.product.slug}`,
        imageUrl: item.product.imageUrl,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        meta: { slug: item.product.slug, visibility: item.visibility, productUrl: item.showExternalLink ? item.product.productUrl : null }
      }));
    }
  }

  if (imageSourceAllows(imageSource, ["profiles", "users", "user", "profile"])) {
    const ownerIds = await accessibleOwnerIds(user);
    const profileImages = await prisma.user.findMany({
      where: {
        id: { in: ownerIds },
        active: true,
        profile: { is: { imageUrl: { not: null } } }
      },
      include: { profile: true },
      orderBy: [{ username: "asc" }],
      take: imageLimit
    });
    for (const profile of profileImages) {
      imageAdd(buildImageFeedItem(requestBase, {
        id: `profile:${profile.id}`,
        source: "profiles",
        entityType: "user",
        entityId: profile.id,
        title: userDisplayName(profile) || profile.username || profile.email || "Benutzer",
        subtitle: undefined,
        href: profile.id === user.id ? "/profile" : undefined,
        imageUrl: profile.profile?.imageUrl,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
        owner: { id: profile.id, username: profile.username, displayName: userDisplayName(profile) },
        meta: { username: profile.username }
      }));
    }
  }

  imageItems.sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
  const visibleImageItems = imageItems.slice(0, imageLimit);

  const quotaMap = new Map(quotas.filter((entry) => entry.hasQuota).map((entry) => [entry.tracker.key, entry]));
  const runningTrackers = new Map(openTrackers.map((entry) => [entry.trackerType?.key, entry]));
  const visibleTrackers = trackerTypes.filter(
    (tracker) => canManageTrackers && featureEnabled(tenantFeatures, `tracker.${tracker.key}`)
  );

  let createdInviteUrl = "";
  if (searchParams.inviteUrl) {
    try {
      createdInviteUrl = decodeURIComponent(searchParams.inviteUrl);
    } catch {
      createdInviteUrl = "";
    }
  }
  const message = feedbackText(searchParams.feedback, searchParams.tracker);
  const endpointGroups = groupedEndpoints();
  const publicCapabilities = publicCapabilitySummary(tenantFeatures, featureEnabled);

  const openTrackerPayload = openTrackers.map((entry) => ({
    id: entry.id,
    key: entry.trackerType?.key,
    title: entry.trackerType?.title || entry.trackerTypeId,
    startTime: safeDate(entry.startTime),
    slug: entry.slug,
    url: entry.slug
      ? `/trackers/${entry.trackerType?.key || entry.trackerTypeId}/${entry.slug}`
      : `/trackers/${entry.trackerType?.key || entry.trackerTypeId}/${entry.id}`
  }));

  const statusPayload = {
    ok: true,
    user: {
      id: user.id,
      displayName: user.profile?.displayName || user.name || user.username || user.email
    },
    counts: {
      toys,
      positions,
      plannedActivities,
      media: mediaCount
    },
    openTrackers: openTrackerPayload,
    quotas: quotaAll
  };

  const playReadyPayload = {
    ok: true,
    playReady: Boolean(playReadySettings?.playReady),
    playReadyLabel: playReadySettings?.playReady ? "gruen" : "rot",
    playReadyExpiresAt: safeDate(playReadySettings?.playReadyExpiresAt),
    playReadyExpiryMinutes: playReadySettings?.playReadyExpiryMinutes || null
  };

  const mediaPayload = {
    ok: true,
    nextCursor: nextMediaCursor,
    count: visibleMedia.length,
    includeAlbums: mediaIncludeAlbums,
    items: visibleMedia.map((entry) => ({
      id: entry.id,
      title: entry.title,
      kind: entry.kind,
      visibility: entry.visibility,
      createdAt: safeDate(entry.createdAt),
      updatedAt: safeDate(entry.updatedAt),
      album: entry.album ? { id: entry.album.id, title: entry.album.title } : null,
      owner: entry.owner?.username || entry.owner?.name || entry.owner?.email,
      url: entry.url
    })),
    albums: mediaIncludeAlbums
      ? albums.map((album) => ({ id: album.id, title: album.title }))
      : null
  };

  const imagePayload = {
    ok: true,
    source: imageSource,
    limit: imageLimit,
    count: visibleImageItems.length,
    q: imageQ || null,
    items: visibleImageItems
  };

  const invitePayload = {
    ok: true,
    usage: {
      quota: usage.quota,
      used: usage.used,
      remaining: usage.remaining
    },
    items: invites.slice(0, 8).map((invite) => ({
      id: invite.id,
      status: invite.status,
      name: invite.name || invite.email,
      email: invite.email,
      acceptedBy: invite.acceptedBy ? (invite.acceptedBy.profile?.displayName || invite.acceptedBy.name || invite.acceptedBy.username || invite.acceptedBy.email) : null,
      expiresAt: safeDate(invite.expiresAt),
      createdAt: safeDate(invite.createdAt)
    }))
  };

  const capabilitiesPayload = {
    ok: true,
    tenantId: tenant?.id || null,
    capabilities: publicCapabilities.map((entry) => ({
      key: entry.key,
      label: entry.label,
      route: entry.route,
      featureKey: entry.featureKey,
      intents: entry.intents,
      actions: entry.actions.map((action) => ({
        key: action.key,
        label: action.label,
        type: action.type,
        description: action.description,
        apiEndpoints: action.apiEndpoints?.map((endpoint) => ({
          method: endpoint.method,
          path: endpoint.path,
          description: endpoint.description
        }))
      }))
    }))
  };

  const endpointPreviews = endpointGroups.flatMap(([group, endpoints]) =>
    endpoints.map((endpoint) => {
      const lowerPath = endpoint.path.toLowerCase();
      let sample: unknown = null;
      if (lowerPath.includes("/api/external/status")) sample = statusPayload;
      else if (lowerPath.includes("/api/external/capabilities")) sample = capabilitiesPayload;
      else if (lowerPath.includes("/api/external/play-ready")) sample = playReadyPayload;
      else if (lowerPath.includes("/api/external/trackers/quotas")) sample = { ok: true, quotas: quotaPreview };
      else if (lowerPath.includes("/api/external/invites")) sample = invitePayload;
      else if (lowerPath.includes("/api/external/files/")) sample = filePayload;
      else if (lowerPath.includes("/api/external/images")) sample = imagePayload;
      else if (lowerPath.includes("/api/external/media")) sample = mediaPayload;
      else sample = endpointSampleForPath(endpoint, endpoint.method, usage);

      const hint = endpointRequestHint(endpoint, endpoint.method);
      const curlBody = lowerPath.startsWith("/api/external/media") && endpoint.method === "POST"
        ? endpointCurl(endpoint.method, endpoint.path) + " -F \"file=@./bild.jpg\" -F \"title=Mein Bild\" -F \"visibility=PRIVATE\""
        : null;
      return { group, endpoint, sample, hint, curlBody };
    })
  );

  const endpointPreviewsFiltered = endpointPreviews.filter(({ group, endpoint }) => {
    const groupQuery = endpointGroupFilter === "" || endpointGroupFilter === "all";
    const matchesGroup = groupQuery || group.toLowerCase() === endpointGroupFilter;
    const query = endpointQuery;
    if (!query) return matchesGroup;
    const payload = `${endpoint.method} ${endpoint.path} ${endpoint.description || ""} ${group} ${endpoint.capability || ""}`.toLowerCase();
    return matchesGroup && payload.includes(query);
  });

  const endpointGroupCounts = endpointPreviews.reduce((acc, current) => {
    acc.set(current.group, (acc.get(current.group) || 0) + 1);
    return acc;
  }, new Map<string, number>());

  const endpointFiltersActive = endpointQuery.length > 0 || (endpointGroupFilter.length > 0 && endpointGroupFilter !== "all");
  const endpointFilterBase = "/settings/api-control?endpointQuery=";
  const encodedEndpointQuery = encodeURIComponent(endpointQuery);

  const externalCapabilityKeys = new Set(
    apiEndpointSpecs
      .filter((endpoint) => endpoint.path.startsWith("/api/external/"))
      .map((endpoint) => `${endpoint.method}:${endpoint.path.split("?")[0]}`)
  );
  const consoleEndpointKeys = new Set(
    apiNativeToolCatalog.flatMap((tool) =>
      (tool.methods?.length ? tool.methods : [tool.method]).map((method) => `${method}:${tool.path.split("?")[0]}`)
    )
  );
  const endpointCoverageMissing = [...externalCapabilityKeys].filter((entry) => !consoleEndpointKeys.has(entry));
  const endpointCoverageExtras = [...consoleEndpointKeys].filter((entry) => !externalCapabilityKeys.has(entry));

  const endpointGroupList = Array.from(new Set(endpointGroups.map(([group]) => group))).sort((a, b) => a.localeCompare(b));

  const navItems = [
    { id: "overview", label: "Übersicht", metric: `${quotaAll.length} Quotas` },
    { id: "console", label: "API Console", metric: `${apiNativeToolCatalog.length} Tools` },
    { id: "playready", label: "Spielampel", metric: playReadySettings?.playReady ? "Grün" : "Rot" },
    { id: "tracker", label: "Tracker", metric: `${runningTrackers.size} aktiv` },
    { id: "einladungen", label: "Einladungen", metric: usage.remaining === null ? "unbegrenzt" : `${usage.remaining} frei` },
    { id: "medien", label: "Medien", metric: `${visibleMedia.length} Treffer` },
    { id: "dateien", label: "Dateien", metric: `${filePayload.count} Dateien` },
    { id: "endpunkte", label: "Endpunkte", metric: `${endpointPreviewsFiltered.length} Treffer` }
  ];

  return (
    <AppShell>
      <PageHeader
        title="API Kontrolle"
        action={
          <Link
            href="/settings/api"
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-paper"
          >
            Tokenverwaltung
          </Link>
        }
      />
      <PageGuide title="Steuerzentrale für externe Aktionen">
        Zentrale Bedienoberfläche für Ampel, Tracker, Einladungen, Medien, und direkte API-Tests mit Beispieldaten.
      </PageGuide>

      <div className="mb-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start">
        <div className="overflow-x-auto pb-1">
          <div className="mb-1 inline-flex min-w-full gap-2 text-sm sm:text-[15px]">
            {navItems.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="inline-flex min-h-10 flex-1 items-center justify-center whitespace-nowrap rounded-md border border-line bg-surface px-3 py-2 font-medium hover:bg-paper"
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 rounded-md border border-line bg-surface p-2 lg:justify-start">
          {navItems.map((item) => (
            <a
              key={`metric-${item.id}`}
              href={`#${item.id}`}
              className="min-h-16 flex min-w-[140px] flex-1 flex-col justify-center rounded-md border border-line bg-paper px-3 py-2 text-left hover:bg-surface"
            >
              <span className="text-xs uppercase tracking-wide text-graphite">{item.label}</span>
              <span className="mt-0.5 text-sm font-semibold text-ink">{item.metric}</span>
            </a>
          ))}
        </div>
      </div>

      {message ? (
        <Panel className="mb-6 border-redbrand/30 bg-redbrand/10 text-sm font-semibold text-graphite">
          {message}
        </Panel>
      ) : null}

      {createdInviteUrl ? (
        <Panel className="mb-6 border-redbrand/30 bg-redbrand/10">
          <h2 className="mb-2 text-lg font-semibold text-ink">Letzter Einladunglink</h2>
          <CopyLink value={createdInviteUrl} label={createdInviteUrl} />
        </Panel>
      ) : null}

      <section id="console" className="mb-6">
        <Panel>
          <h2 className="mb-4 text-lg font-semibold">API Live-Konsole</h2>
          <ApiNativeConsole apiTokens={apiTokens} />
        </Panel>
      </section>

      <section id="overview" className="mb-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <Panel>
          <h2 className="mb-4 text-lg font-semibold">Portalstatus</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-line bg-paper p-3">
              <div className="text-sm text-graphite">Spielsachen</div>
              <div className="mt-2 text-2xl font-semibold">{toys}</div>
            </div>
            <div className="rounded-md border border-line bg-paper p-3">
              <div className="text-sm text-graphite">Szenen</div>
              <div className="mt-2 text-2xl font-semibold">{positions}</div>
            </div>
            <div className="rounded-md border border-line bg-paper p-3">
              <div className="text-sm text-graphite">Planungen</div>
              <div className="mt-2 text-2xl font-semibold">{plannedActivities}</div>
            </div>
            <div className="rounded-md border border-line bg-paper p-3">
              <div className="text-sm text-graphite">Medien</div>
              <div className="mt-2 text-2xl font-semibold">{mediaCount}</div>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">Laufende Tracker</h3>
              {openTrackers.length ? (
                <form action={stopAllTrackers} className="shrink-0">
                  <Button variant="danger" type="submit"><Square className="h-4 w-4" /> Alle stoppen</Button>
                </form>
              ) : null}
            </div>
            {openTrackers.length ? (
              openTrackers.map((entry) => (
                <div key={entry.id} className="rounded-md border border-redbrand/30 bg-redbrand/5 p-3 text-sm">
                  <div className="font-semibold text-ink">{entry.trackerType?.title || entry.trackerTypeId}</div>
                  <div className="text-xs text-graphite">seit {formatDateTime(entry.startTime)}</div>
                </div>
              ))
            ) : (
              <p className="text-sm text-graphite">Kein laufender Tracker.</p>
            )}
          </div>

          <div className="mt-5 space-y-3 text-sm">
            <h3 className="text-sm font-semibold text-ink">Kontingente</h3>
            {quotaAll.length ? quotaAll.map((entry) => (
              <div key={entry.key} className="rounded-md border border-line bg-paper p-3">
                <div className="font-semibold text-ink">{entry.title}</div>
                <p className="mt-1 text-xs text-graphite">{entry.summary}</p>
              </div>
            )) : <p className="text-sm text-graphite">Noch keine Kontingente aktiv.</p>}
          </div>
        </Panel>

        <Panel id="playready">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><Signal className="h-5 w-5 text-redbrand" /> Spielampel</h2>
          <div className="rounded-md border border-line bg-paper p-3 text-sm">
            <p className="font-semibold">Aktuell: {playReadySettings?.playReady ? "Grün" : "Rot"}</p>
            <p className="mt-1 text-graphite">
              {playReadySettings?.playReadyExpiresAt
                ? `Ablauf: ${formatDateTime(playReadySettings.playReadyExpiresAt)}`
                : "Kein Ablauf gesetzt (rot oder Dauer deaktiviert)."}
            </p>
            <p className="mt-1 text-graphite">Standarddauer: {clampPlayReadyDurationMinutes(playReadySettings?.playReadyExpiryMinutes || 360)} Min.</p>
          </div>

          <form action={applyPlayReady} className="mt-4 space-y-4">
            <Field label="Status wechseln">
              <select className={selectClass} name="state" defaultValue="toggle">
                <option value="toggle">Umschalten</option>
                <option value="green">Auf Grün</option>
                <option value="red">Auf Rot</option>
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Minuten (15er Schritte)">
                <input className={inputClass} name="durationMinutes" type="number" step="15" min={15} max={maxPlayReadyDurationMinutes} placeholder="Leer = aktuelle Vorgabe" />
              </Field>
              <Field label="oder Stunden/Minuten">
                <div className="grid grid-cols-2 gap-2">
                  <select className={selectClass} name="durationHours" defaultValue="00">
                    {Array.from({ length: 13 }, (_, hour) => (
                      <option key={hour} value={String(hour)}>{hour} h</option>
                    ))}
                  </select>
                  <select className={selectClass} name="durationMinutesPart" defaultValue="00">
                    {[
                      "00",
                      "15",
                      "30",
                      "45"
                    ].map((value) => <option key={value} value={value}>{value} min</option>)}
                  </select>
                </div>
              </Field>
            </div>
            <SubmitButton className="w-full" pendingLabel="Spielampel wird gesetzt...">
              <Save className="h-4 w-4" /> Ampel setzen
            </SubmitButton>
          </form>
          {!featureEnabled(tenantFeatures, "playReady") ? <p className="mt-3 text-xs text-redbrand">Spielampel ist in dieser Umgebung deaktiviert.</p> : null}

          <div className="mt-6 rounded-md border border-line bg-paper p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-ink">API-Tokens</h3>
              <Link href="/settings/api" className="inline-flex min-h-9 items-center justify-center rounded-md border border-line bg-surface px-3 py-2 text-xs font-semibold">
                Tokenverwaltung öffnen
              </Link>
            </div>
            {apiTokens.length ? (
              <div className="mt-3 space-y-2">
                {apiTokens.slice(0, 3).map((entry) => (
                  <p key={entry.id} className="text-xs text-graphite">
                    <span className="font-semibold text-ink">...{entry.tokenLastSix}</span> · {entry.name}
                    <span className="text-[11px]"> · erstellt {formatDateTime(new Date(entry.createdAt))}</span>
                  </p>
                ))}
                <p className="text-xs text-graphite">Nutze den letzten Tokenanteil zur Verifikation deiner Requests in Tests.</p>
              </div>
            ) : (
              <p className="mt-3 text-xs text-graphite">Noch kein aktiver Token vorhanden. Bitte erstelle einen in der Tokenverwaltung.</p>
            )}
          </div>
        </Panel>
      </section>

      <section id="tracker">
        <div className="mb-6 grid gap-6 xl:grid-cols-[1.1fr_1fr]">
          <Panel>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Tracker Steuerung</h2>
            <Link href="/sessions" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm font-semibold hover:bg-paper">
              Tracker-Zentrum
            </Link>
          </div>
          <div className="space-y-3">
            <form method="get" className="rounded-md border border-line bg-surface p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Tracker-Filter (Quota)">
                  <input className={inputClass} name="quotaTracker" placeholder="z. B. rope" defaultValue={quotaTracker} />
                </Field>
                <div className="flex items-end gap-2">
                  <SubmitButton className="w-full" pendingLabel="Filter wird gesetzt...">Filter</SubmitButton>
                  <a href="/settings/api-control#tracker" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-paper">
                    Zurücksetzen
                  </a>
                </div>
              </div>
            </form>
            {!canManageTrackers ? (
              <p className="rounded-md border border-dashed border-line bg-paper p-3 text-sm text-redbrand">Tracker-Funktion ist in dieser Umgebung deaktiviert.</p>
            ) : visibleTrackers.length ? visibleTrackers.map((tracker) => {
              const running = runningTrackers.get(tracker.key);
              const quota = quotaMap.get(tracker.key);
              return (
                <details key={tracker.id} className="rounded-md border border-line bg-paper p-3">
                  <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 text-sm [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: tracker.color || "#9ca3af" }} />
                      <strong className="text-ink">{tracker.title}</strong>
                    </span>
                    <Badge tone={running ? "red" : quota?.hasQuota ? "green" : "neutral"}>
                      {running ? "läuft" : quota?.complete ? "erfüllt" : quota?.hasQuota ? "offen" : "kein Kontingent"}
                    </Badge>
                  </summary>
                  <div className="mt-3 space-y-3 text-sm">
                    {running ? (
                      <form action={stopTracker} className="space-y-3">
                        <input type="hidden" name="trackerKey" value={tracker.key} />
                        <Field label="Notiz">
                          <input className={inputClass} name="note" placeholder="Warum wird gestoppt?" />
                        </Field>
                        <Button type="submit" variant="danger" className="shrink-0"><Square className="h-4 w-4" /> Stop</Button>
                      </form>
                    ) : (
                      <form action={startTracker} className="space-y-3">
                        <input type="hidden" name="trackerKey" value={tracker.key} />
                        <Field label="Notiz">
                          <input className={inputClass} name="note" placeholder="Optionaler Start-Hinweis" />
                        </Field>
                        <label className="flex items-center gap-2 rounded-md border border-line bg-surface p-3 text-sm">
                          <input type="checkbox" name="allDay" className="h-4 w-4 accent-redbrand" />
                          Ganzer Tag
                        </label>
                        <div className="grid gap-3 md:grid-cols-2">
                          <Field label="Startdatum"><input className={inputClass} type="date" name="date" /></Field>
                          <Field label="Startzeit"><input className={inputClass} type="datetime-local" name="startTime" /></Field>
                        </div>
                        <Button type="submit"><Play className="h-4 w-4" /> Start</Button>
                      </form>
                    )}
                    {quota ? <p className="text-xs text-graphite">{quotaSummaryText(quota)}</p> : <p className="text-xs text-graphite">Kein Kontingent für diesen Tracker.</p>}
                    <Link href={`/sessions?tracker=${encodeURIComponent(tracker.key)}`} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-xs font-semibold">
                      Zum Tracker <CalendarDays className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </details>
              );
            }) : (
              <p className="rounded-md border border-dashed border-line bg-paper p-3 text-sm text-graphite">Keine Tracker oder keine Berechtigung.</p>
            )}
            {!canManageTrackers ? <p className="mt-2 text-xs text-redbrand">Tracker können in den Tenant-Einstellungen freigeschaltet werden.</p> : null}
          </div>
        </Panel>

        <Panel id="einladungen">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Einladungen</h2>
            <Badge tone={canManageInvites ? "green" : "neutral"}>
              {canManageInvites ? `${usage.quota === null ? "unbegrenzt" : `${usage.remaining} von ${usage.quota}`}` : "nicht aktiv"}
            </Badge>
          </div>

          {canManageInvites ? (
            <form action={createInviteAction} className="space-y-3">
              <Field label="Name"><input className={inputClass} name="name" placeholder="Optionaler Anzeigename" /></Field>
              <Field label="E-Mail"><input className={inputClass} name="email" type="email" placeholder="Optional" /></Field>
              <label className="flex items-center gap-2 rounded-md border border-line bg-paper p-3 text-sm">
                <input className="h-4 w-4 accent-redbrand" type="checkbox" name="sendEmail" />
                E-Mail direkt senden
              </label>
              <SubmitButton className="w-full" pendingLabel="Einladung wird erstellt...">
                <Ticket className="h-4 w-4" /> Einladung erstellen
              </SubmitButton>
            </form>
          ) : (
            <p className="rounded-md border border-dashed border-line bg-paper p-3 text-sm text-redbrand">Einladungen sind in dieser Umgebung nicht aktiv.</p>
          )}

          {canManageInvites && invites.length ? (
            <div className="mt-4 space-y-3">
              {invites.slice(0, 8).map((invite) => {
                const statusLabel = invite.status === "ACCEPTED" ? "angenommen" : invite.status === "OPEN" ? "offen" : "widerrufen";
                const acceptedBy = invite.acceptedBy
                  ? invite.acceptedBy.profile?.displayName || invite.acceptedBy.name || invite.acceptedBy.username || invite.acceptedBy.email
                  : "";
                return (
                  <details key={invite.id} className="rounded-md border border-line bg-surface">
                    <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
                      <span className="font-semibold text-ink">{invite.name || invite.email || "Einladung"}</span>
                      <Badge tone={invite.status === "ACCEPTED" ? "green" : invite.status === "OPEN" ? "red" : "neutral"}>{statusLabel}</Badge>
                    </summary>
                    <div className="space-y-2 border-t border-line p-3 text-sm text-graphite">
                      <p>Email: {invite.email || "—"}</p>
                      <p>Läuft bis: {formatDateTime(invite.expiresAt)}</p>
                      {acceptedBy ? <p>Angenommen von: {acceptedBy}</p> : null}
                      <div className="flex flex-wrap gap-2">
                        {invite.status === "OPEN" ? (
                          <>
                            <form action={revokeInviteAction}>
                              <input type="hidden" name="id" value={invite.id} />
                              <Button type="submit" variant="danger" className="gap-2"><X className="h-4 w-4" /> Widerrufen</Button>
                            </form>
                            <form action={deleteInviteAction}>
                              <input type="hidden" name="id" value={invite.id} />
                              <Button type="submit">Löschen</Button>
                            </form>
                          </>
                        ) : (
                          <form action={deleteInviteAction}>
                            <input type="hidden" name="id" value={invite.id} />
                            <Button type="submit">Löschen</Button>
                          </form>
                        )}
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          ) : canManageInvites ? (
            <p className="mt-4 rounded-md border border-dashed border-line bg-paper p-3 text-sm text-graphite">Noch keine Einladungen vorhanden.</p>
          ) : null}
          {!canManageInvites ? <p className="mt-3 text-xs text-redbrand">Einladungen sind in dieser Umgebung nicht aktiv.</p> : null}
        </Panel>
      </div>
      </section>

      <div id="medien" className="mb-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel>
          <h2 className="mb-4 text-lg font-semibold">Medien</h2>
          {canManageMedia ? (
            <form action={uploadMedia} className="mb-4 space-y-3" encType="multipart/form-data">
              <Field label="Datei"><input className={inputClass} name="file" type="file" accept="image/*,video/*" required /></Field>
              <Field label="Titel"><input className={inputClass} name="title" placeholder="Optionaler Titel" /></Field>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Album">
                  <select className={selectClass} name="albumId" defaultValue="">
                    <option value="">Standardalbum</option>
                    {albums.map((album) => <option key={album.id} value={album.id}>{album.title}</option>)}
                  </select>
                </Field>
                <Field label="Sichtbarkeit">
                  <select className={selectClass} name="visibility" defaultValue="PRIVATE">
                    <option value="PRIVATE">Privat</option>
                    <option value="PARTNER">Zirkel</option>
                    <option value="SHARED">Geteilt</option>
                  </select>
                </Field>
              </div>
              <SubmitButton className="w-full" pendingLabel="Datei wird hochgeladen...">
                <Upload className="h-4 w-4" /> Upload
              </SubmitButton>
            </form>
          ) : null}

          <form method="get" className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Suchen">
                <input className={inputClass} name="mediaQ" defaultValue={mediaQuery} placeholder="Titel" />
              </Field>
              <Field label="Typ">
                <select className={selectClass} name="mediaKind" defaultValue={selectedKind || "ALL"}>
                  <option value="ALL">Alle</option>
                  <option value="IMAGE">Bilder</option>
                  <option value="VIDEO">Videos</option>
                </select>
              </Field>
                <Field label="Album">
                <select className={selectClass} name="mediaAlbum" defaultValue={mediaAlbum}>
                  <option value="">Alle</option>
                  {albums.map((album) => <option key={album.id} value={album.id}>{album.title}</option>)}
                </select>
              </Field>
              <label className="flex items-center gap-2 rounded-md border border-line bg-surface p-3 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-redbrand" name="mediaIncludeAlbums" value="1" defaultChecked={mediaIncludeAlbums} />
                Album-Liste im API-Preview ausgeben
              </label>
            </div>
            <Button type="submit"><Search className="h-4 w-4" /> Filtern</Button>
          </form>

          {canManageMedia ? (
            <div className="mt-4 space-y-2">
              {visibleMedia.map((entry) => (
                <div key={entry.id} className="rounded-md border border-line bg-paper p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link href={`/media?view=${entry.id}`} className="font-semibold text-ink hover:text-redbrand">{entry.title || "Unbenannt"}</Link>
                      <p className="text-xs text-graphite">
                        {entry.kind} · {visibilityLabel(entry.visibility || "PRIVATE")} · {entry.createdAt ? formatDateTime(entry.createdAt) : ""}
                      </p>
                    </div>
                    <Link href={entry.url} className="text-sm underline text-graphite">Datei öffnen</Link>
                  </div>
                  <p className="mt-1 text-xs text-graphite">Album: {entry.album?.title || "Standard"} · Besitzer: {entry.owner?.profile?.displayName || entry.owner?.name || entry.owner?.email}</p>
                </div>
              ))}
              {nextMediaCursor ? (
                <form method="get" className="mt-2">
                  <input type="hidden" name="mediaCursor" value={nextMediaCursor} />
                  <input type="hidden" name="mediaQ" value={mediaQuery} />
                  <input type="hidden" name="mediaKind" value={selectedKind || "ALL"} />
                  <input type="hidden" name="mediaAlbum" value={mediaAlbum} />
                  {!mediaIncludeAlbums ? <input type="hidden" name="mediaIncludeAlbums" value="0" /> : null}
                  <Button type="submit">Weitere laden</Button>
                </form>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 rounded-md border border-dashed border-line bg-paper p-3 text-xs text-redbrand">Medienfunktion ist in dieser Umgebung nicht aktiv.</p>
          )}
        </Panel>

        <Panel>
          <h2 className="mb-4 text-lg font-semibold">Image-API Vorschau</h2>
          <form method="get" className="mb-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Quelle">
                <select className={selectClass} name="imageSource" defaultValue={imageSource}>
                  <option value="all">Alle Quellen</option>
                  <option value="media">Medien</option>
                  <option value="toys">Spielsachen</option>
                  <option value="positions">Szenen</option>
                  <option value="ideas">Ideen</option>
                  <option value="bondage-system">Bondage-System</option>
                  <option value="profiles">Profile</option>
                </select>
              </Field>
              <Field label="Suche">
                <input className={inputClass} name="imageQ" defaultValue={imageQ} placeholder="Titel / Suchbegriff" />
              </Field>
              <Field label="Max. Treffer">
                <input className={inputClass} name="imageLimit" type="number" min={6} max={200} defaultValue={imageLimit} />
              </Field>
            </div>
            <div className="flex items-center gap-2">
              <SubmitButton className="w-full" pendingLabel="Bilder werden geladen...">Filtern</SubmitButton>
              <a href="/settings/api-control#medien" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-paper">
                Zurücksetzen
              </a>
            </div>
          </form>

          {visibleImageItems.length ? (
            <div className="space-y-2">
              <p className="text-sm text-graphite">
                Zeige <strong>{visibleImageItems.length}</strong> Ergebnisse aus <strong>{imagePayload.source}</strong>
                {imagePayload.q ? ` für “${imagePayload.q}”` : ""}
              </p>
              {visibleImageItems.map((entry) => (
                <div key={`${entry.id}-${entry.entityId}`} className="rounded-md border border-line bg-surface p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-ink">{entry.title}</p>
                      <p className="text-xs text-graphite">
                        {entry.source} · {entry.entityType} {entry.subtitle ? `· ${entry.subtitle}` : ""}
                      </p>
                      <p className="text-xs text-graphite">Owner: {entry.owner?.displayName || entry.owner?.username || "-"}</p>
                      {entry.createdAt ? <p className="text-xs text-graphite">Erstellt: {formatDateTime(new Date(entry.createdAt))}</p> : null}
                    </div>
                    {entry.portalUrl ? (
                      <a href={entry.portalUrl} className="inline-flex min-h-9 items-center rounded-md border border-line bg-surface px-3 py-1.5 text-xs" target="_blank" rel="noreferrer">
                        Datei
                      </a>
                    ) : null}
                  </div>
                  {entry.href ? <a href={entry.href} className="inline-block mt-1 text-xs underline text-graphite">Zur Quelle</a> : null}
                  {entry.requiresAuthorization ? <p className="mt-1 text-[11px] text-redbrand">API-Download benötigt Token</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-line bg-paper p-3 text-sm text-graphite">Keine Bilder für die Filter gefunden.</p>
          )}
        </Panel>

        <Panel id="dateien">
          <h2 className="mb-4 text-lg font-semibold">Datei-API</h2>
          <form method="get" className="mb-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Dateisuche">
                <input className={inputClass} name="fileQ" defaultValue={fileQuery} placeholder="Dateiname" />
              </Field>
              <Field label="Max. Treffer">
                <input className={inputClass} name="fileLimit" type="number" min={1} max={60} defaultValue={fileLimit} />
              </Field>
            </div>
            <div className="flex items-center gap-2">
              <SubmitButton className="w-full" pendingLabel="Dateien werden geladen...">Filtern</SubmitButton>
              <a href="/settings/api-control#dateien" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-paper">
                Zurücksetzen
              </a>
            </div>
          </form>

          {filePayload.items.length ? (
            <div className="space-y-2">
              <p className="text-sm text-graphite">
                Zeige <strong>{filePayload.items.length}</strong> Dateien aus Deinem Tenant
                {filePayload.query ? ` für „${filePayload.query}“` : ""}.
              </p>
              {filePayload.items.map((entry) => (
                <div key={entry.id} className="rounded-md border border-line bg-surface p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-ink">{entry.originalName}</p>
                      <p className="text-xs text-graphite">{entry.mimeType} · {entry.sizeHuman} · {entry.owner}</p>
                      {entry.createdAt ? <p className="text-xs text-graphite">Erstellt: {formatDateTime(new Date(entry.createdAt))}</p> : null}
                    </div>
                    <a href={entry.localUrl} className="inline-flex min-h-9 items-center rounded-md border border-line bg-surface px-3 py-1.5 text-xs" target="_blank" rel="noreferrer">
                      Lokal öffnen
                    </a>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <a href={entry.localUrl} className="inline-flex min-h-9 items-center rounded-md border border-line bg-surface px-3 py-1.5 text-xs" target="_blank" rel="noreferrer">
                      /api/files/{entry.id}
                    </a>
                    <a href={entry.externalUrl} className="inline-flex min-h-9 items-center rounded-md border border-line bg-surface px-3 py-1.5 text-xs" target="_blank" rel="noreferrer">
                      /api/external/files/{entry.id} (Token)
                    </a>
                  </div>
                  <p className="mt-1 text-[11px] text-redbrand">Externer Download nur mit API-Token nutzbar.</p>
                  <CopyLink value={endpointCurl("GET", entry.externalUrl)} label={`curl GET Dateien (${entry.originalName})`} />
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-line bg-paper p-3 text-sm text-graphite">Keine Dateien gefunden.</p>
          )}
        </Panel>

        <Panel id="endpunkte">
          <h2 className="mb-4 text-lg font-semibold">Externe Endpunkte</h2>
          <p className="mb-3 text-sm text-graphite">Endpunkte aus der Capabilities-Definition, mit Filter und Preview-Daten aus dem aktuellen Zustand.</p>
          <form method="get" className="mb-4 rounded-md border border-line bg-surface p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Endpoint-Suche">
                <input
                  className={inputClass}
                  name="endpointQuery"
                  defaultValue={endpointQuery}
                  placeholder="Pfad, Methode, Beschreibung oder Gruppe"
                />
              </Field>
              <Field label="Gruppe">
                <select className={selectClass} name="endpointGroup" defaultValue={endpointGroupFilter || "all"}>
                  <option value="all">Alle</option>
                  {endpointGroupList.map((group) => (
                    <option key={group} value={group.toLowerCase()}>{group}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <SubmitButton className="gap-2" pendingLabel="Filter wird angewendet...">
                <Search className="h-4 w-4" /> Suchen
              </SubmitButton>
              <a
                href="/settings/api-control#endpunkte"
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink hover:bg-surface"
              >
                Filter löschen
              </a>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {[
                { value: "all", label: "Alle", count: endpointPreviews.length },
                ...endpointGroupList.map((group) => ({ value: group.toLowerCase(), label: group, count: endpointGroupCounts.get(group) || 0 }))
              ].map((entry) => {
                const isActive = entry.value === "all"
                  ? !endpointFiltersActive
                  : endpointGroupFilter === entry.value;
                const href = entry.value === "all"
                  ? `/settings/api-control#endpunkte`
                  : `${endpointFilterBase}${encodedEndpointQuery}&endpointGroup=${encodeURIComponent(entry.value)}#endpunkte`;
                return (
                  <Link
                    key={entry.value}
                    href={href}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 border ${isActive ? "border-redbrand text-redbrand bg-redbrand/10" : "border-line bg-surface text-graphite"}`}
                  >
                    <span>{entry.label}</span>
                    <span className="rounded-full bg-paper px-1.5 py-0.5 text-[11px]">{entry.count}</span>
                  </Link>
                );
              })}
            </div>
          </form>
          {endpointFiltersActive ? (
            <p className="mb-4 rounded-md border border-line bg-surface p-3 text-sm text-graphite">
              Gefiltert nach: {endpointQuery ? `„${endpointQuery}“` : "Gruppe"}
              {endpointGroupFilter && endpointGroupFilter !== "all" ? ` in „${endpointGroupFilter}“` : ""}
              . Treffer: <strong>{endpointPreviewsFiltered.length}</strong>.
            </p>
          ) : null}
          <div className="space-y-3">
            {endpointPreviewsFiltered.length ? (
              endpointPreviewsFiltered.map(({ group, endpoint, sample, hint, curlBody }) => (
                <details key={`${group}-${endpoint.method}-${endpoint.path}`} className="rounded-md border border-line bg-paper">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center gap-2">
                      <Badge tone={endpoint.method === "GET" ? "green" : "neutral"}>{endpoint.method}</Badge>
                      <span className="break-all text-ink font-semibold">{endpoint.path}</span>
                    </span>
                    <Badge>{group}</Badge>
                  </summary>
                  <div className="space-y-2 border-t border-line p-3 text-sm">
                    <p className="text-graphite">{endpoint.description}</p>
                    <div className="flex flex-wrap gap-2">
                      <CopyLink
                        value={endpointCurl(endpoint.method, endpoint.path)}
                        label={`copy: curl ${endpoint.method} ${endpoint.path}`}
                      />
                      <CopyLink
                        value={endpointCurlWithQuery(endpoint.method, endpoint.path)}
                        label={`copy: curl ${endpoint.method} ${endpoint.path} (token in URL)`}
                      />
                      <a
                        href={endpoint.path}
                        className="inline-flex min-h-9 items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-xs"
                      >
                        <LinkIcon className="h-3.5 w-3.5" /> Endpunkt öffnen
                      </a>
                    </div>
                    {hint ? <p className="text-xs text-graphite">Hinweis: {hint}</p> : null}
                    {curlBody ? (
                      <pre className="overflow-auto rounded border border-line bg-surface p-3 text-xs"><code>{curlBody}</code></pre>
                    ) : null}
                    <div className="rounded-md border border-line bg-surface">
                      <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-xs font-semibold text-graphite">
                        <FileJson className="h-3.5 w-3.5" /> Beispiel-Payload
                      </div>
                      <pre className="max-h-56 overflow-auto p-3 text-xs"><code>{jsonText(sample)}</code></pre>
                    </div>
                  </div>
                </details>
              ))
            ) : (
              <div className="rounded-md border border-dashed border-line bg-paper p-3 text-sm text-graphite">
                Keine Endpunkte passen zu den gewählten Filtern.
              </div>
            )}
          </div>
          {endpointCoverageMissing.length ? (
            <div className="mb-4 rounded-md border border-redbrand/30 bg-redbrand/10 p-3 text-sm">
              <p className="font-semibold text-ink">Vollständigkeitscheck</p>
              <p className="mt-1 text-graphite">
                Folgende in den Capabilities gelistete Endpunkte fehlen in der Konsole:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-graphite">
                {endpointCoverageMissing.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-graphite">
              <p className="font-semibold text-ink">Vollständigkeitscheck</p>
              <p className="mt-1">Alle externen Capabilities-Endpunkte sind in der Konsole verfügbar.</p>
            </div>
          )}
          {endpointCoverageExtras.length ? (
            <div className="mb-4 rounded-md border border-line bg-surface p-3 text-sm text-graphite">
              <p className="font-semibold text-ink">Zusätzliche Konsole-Endpoints (für Tests)</p>
              <p className="mt-1 text-graphite">Diese werden nicht in Capabilities gemeldet, sind aber in der Konsole nutzbar:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-graphite">
                {endpointCoverageExtras.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mb-4 space-y-2">
            <p className="text-sm font-semibold text-ink">Verfügbare Fähigkeiten</p>
            {publicCapabilities.length ? (
              publicCapabilities.map((entry) => (
                <details key={`cap-${entry.key}`} className="rounded-md border border-line bg-paper p-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm [&::-webkit-details-marker]:hidden">
                    <span>
                      <strong className="text-ink">{entry.label}</strong>
                      <span className="ml-2 text-xs text-graphite">{entry.route || "-"}</span>
                    </span>
                    <Badge>{entry.featureKey}</Badge>
                  </summary>
                  <div className="mt-2 space-y-2 text-xs">
                    {entry.actions.map((action) => (
                      <p key={`${entry.key}-${action.key}`}>
                        <span className="mr-2 inline-flex min-h-6 items-center rounded-full bg-line px-2 py-1 text-[11px]">{action.type}</span>
                        <span className="font-medium text-ink">{action.label}</span>
                        <span className="text-graphite"> · {action.description}</span>
                      </p>
                    ))}
                  </div>
                </details>
              ))
            ) : (
              <p className="text-sm text-graphite">Keine Funktionen freigeschaltet.</p>
            )}
          </div>
          <p className="mt-3 text-xs text-graphite">
            Häufige Parameter: {apiVariableNames.map((name, index) => (
              <code key={name} className="mx-1 rounded bg-surface px-1.5 py-0.5 text-[11px]">
                {index ? ", " : ""}{name}
              </code>
            ))}
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}
