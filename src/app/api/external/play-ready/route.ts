import { NextRequest, NextResponse } from "next/server";
import { accessibleOwnerIds } from "@/lib/access";
import { logAction, userDisplayName } from "@/lib/audit";
import { apiFeatureGate, requestValues, requireApiUser } from "@/lib/external-api";
import { effectivePlayReadyState, nextPlayReadyState, playReadyLabel, playReadyRemainingText, playReadyStateToBoolean, type PlayReadyState } from "@/lib/play-ready";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const maxDurationMinutes = 12 * 60;

type ApiPlayReadyUser = {
  id: string;
  tenantId?: string | null;
  circleId?: string | null;
  role?: string | null;
  email?: string | null;
  username?: string | null;
  name?: string | null;
  profile?: { displayName?: string | null } | null;
};

function durationFromValues(values: Map<string, string>) {
  const directMinutes = Number(values.get("expiresMinutes") || values.get("durationMinutes") || "");
  if (Number.isFinite(directMinutes) && directMinutes > 0) return Math.min(maxDurationMinutes, Math.ceil(directMinutes / 15) * 15);
  const hours = Number(values.get("hours") || values.get("expiresHours") || "0");
  const minutes = Number(values.get("minutes") || values.get("expiresMinute") || "0");
  const total = (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
  if (total <= 0) return 0;
  return Math.min(maxDurationMinutes, Math.ceil(total / 15) * 15);
}

function remainingSeconds(expiresAt: Date | null | undefined, now = new Date()) {
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));
}

function remainingMinutes(expiresAt: Date | null | undefined, now = new Date()) {
  const seconds = remainingSeconds(expiresAt, now);
  return seconds === null ? null : Math.ceil(seconds / 60);
}

function stateFromValues(values: Map<string, string>, current: PlayReadyState): PlayReadyState | null {
  const raw = String(values.get("state") || values.get("ready") || values.get("playReady") || "").trim().toLowerCase();
  if (!raw) return null;
  if (["green", "gruen", "grün", "true", "1", "yes", "on", "lust"].includes(raw)) return "green";
  if (["yellow", "gelb", "flexibel", "maybe", "neutral"].includes(raw)) return "yellow";
  if (["red", "rot", "false", "0", "no", "off", "nicht"].includes(raw)) return "red";
  if (raw === "toggle" || raw === "switch") return nextPlayReadyState(current);
  return null;
}

function isoDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function playReadyTargetForState(state: PlayReadyState, expiresAt: Date | null | undefined) {
  return state === "green" ? expiresAt || null : null;
}

function playReadyPerson(
  user: {
    id: string;
    name?: string | null;
    username?: string | null;
    email?: string | null;
    profile?: { displayName?: string | null } | null;
    settings?: { playReady?: boolean | null; playReadyState?: string | null; playReadyExpiresAt?: Date | null } | null;
  },
  now: Date
) {
  const state = effectivePlayReadyState(user.settings);
  const targetAt = playReadyTargetForState(state, user.settings?.playReadyExpiresAt);
  const seconds = targetAt ? remainingSeconds(targetAt, now) : null;
  return {
    id: user.id,
    name: userDisplayName(user),
    state,
    label: playReadyLabel(state),
    playReady: playReadyStateToBoolean(state),
    expiresAt: isoDate(user.settings?.playReadyExpiresAt),
    readyAt: isoDate(targetAt),
    startupEndsAt: isoDate(targetAt),
    remainingSeconds: seconds,
    remainingMinutes: seconds === null ? null : Math.ceil(seconds / 60),
    remainingText: targetAt ? playReadyRemainingText(targetAt, now) : null
  };
}

async function visiblePlayReadyPeople(user: ApiPlayReadyUser, now: Date) {
  const ownerIds = await accessibleOwnerIds(user);
  const people = await prisma.user.findMany({
    where: {
      id: { in: ownerIds },
      active: true,
      ...(user.tenantId ? { memberships: { some: { tenantId: user.tenantId, active: true } } } : {})
    },
    include: { profile: true, settings: true },
    orderBy: [{ name: "asc" }, { username: "asc" }, { email: "asc" }]
  });
  return people.map((person) => playReadyPerson(person, now));
}

async function playReadyPayload(user: ApiPlayReadyUser, now = new Date()) {
  const current = await prisma.user.findUnique({
    where: { id: user.id },
    include: { profile: true, settings: true }
  });
  const currentPerson = playReadyPerson(current || user, now);
  return {
    ok: true,
    user: { id: user.id, name: userDisplayName(current || user) },
    playReady: currentPerson.playReady,
    state: currentPerson.state,
    label: currentPerson.label,
    expiresAt: currentPerson.expiresAt,
    readyAt: currentPerson.readyAt,
    startupEndsAt: currentPerson.startupEndsAt,
    remainingSeconds: currentPerson.remainingSeconds,
    remainingMinutes: currentPerson.remainingMinutes,
    remainingText: currentPerson.remainingText,
    people: await visiblePlayReadyPeople(user, now)
  };
}

async function handlePlayReady(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "playReady");
  if (blocked) return blocked;
  const values = await requestValues(request);
  const existing = await prisma.userSettings.findUnique({ where: { userId: auth.user.id } });
  const previous = effectivePlayReadyState(existing);
  const next = stateFromValues(values, previous);

  if (next === null) {
    return NextResponse.json(await playReadyPayload(auth.user));
  }

  const durationMinutes = durationFromValues(values);
  const existingDuration = existing?.playReadyExpiryMinutes || 360;
  const effectiveDurationMinutes = durationMinutes > 0 ? durationMinutes : existingDuration;
  const tenant = auth.user.tenantId ? await prisma.tenant.findUnique({ where: { id: auth.user.tenantId }, select: { playReadyExpiryEnabled: true } }) : null;
  const expiresAt = next === "green" && tenant?.playReadyExpiryEnabled !== false ? new Date(Date.now() + effectiveDurationMinutes * 60_000) : null;
  const nextReady = playReadyStateToBoolean(next);
  await prisma.userSettings.upsert({
    where: { userId: auth.user.id },
    update: { playReady: nextReady, playReadyState: next, playReadyUpdatedAt: new Date(), playReadyExpiresAt: expiresAt, playReadyExpiryMinutes: effectiveDurationMinutes },
    create: { userId: auth.user.id, playReady: nextReady, playReadyState: next, playReadyUpdatedAt: new Date(), playReadyExpiresAt: expiresAt, playReadyExpiryMinutes: effectiveDurationMinutes }
  });
  await logAction({
    actorId: auth.user.id,
    action: "play_ready_changed_api",
    entityType: "userSettings",
    entityId: auth.user.id,
    title: `Spielampel per API geändert: ${userDisplayName(auth.user)} ist ${playReadyLabel(next)}`,
    details: {
      previous: playReadyLabel(previous),
      next: playReadyLabel(next),
      durationMinutes: expiresAt ? effectiveDurationMinutes : null,
      expiresAt: expiresAt?.toISOString() || null
    },
    href: "/"
  });
  return NextResponse.json({
    ...(await playReadyPayload(auth.user)),
    previous: playReadyLabel(previous),
    durationMinutes: expiresAt ? effectiveDurationMinutes : null
  });
}

export async function GET(request: NextRequest) {
  return handlePlayReady(request);
}

export async function POST(request: NextRequest) {
  return handlePlayReady(request);
}
