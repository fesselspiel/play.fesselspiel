import { NextRequest, NextResponse } from "next/server";
import { logAction, userDisplayName } from "@/lib/audit";
import { apiFeatureGate, requestValues, requireApiUser } from "@/lib/external-api";
import { effectivePlayReadyState, nextPlayReadyState, playReadyLabel, playReadyRemainingText, playReadyStateToBoolean, type PlayReadyState } from "@/lib/play-ready";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const maxDurationMinutes = 12 * 60;

function durationFromValues(values: Map<string, string>) {
  const directMinutes = Number(values.get("expiresMinutes") || values.get("durationMinutes") || "");
  if (Number.isFinite(directMinutes) && directMinutes > 0) return Math.min(maxDurationMinutes, Math.ceil(directMinutes / 15) * 15);
  const hours = Number(values.get("hours") || values.get("expiresHours") || "0");
  const minutes = Number(values.get("minutes") || values.get("expiresMinute") || "0");
  const total = (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
  if (total <= 0) return 0;
  return Math.min(maxDurationMinutes, Math.ceil(total / 15) * 15);
}

function remainingMinutes(expiresAt: Date | null | undefined, now = new Date()) {
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 60_000));
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
    const remaining = remainingMinutes(existing?.playReadyExpiresAt);
    return NextResponse.json({
      ok: true,
      user: { id: auth.user.id, name: userDisplayName(auth.user) },
      playReady: playReadyStateToBoolean(previous),
      state: previous,
      label: playReadyLabel(previous),
      expiresAt: existing?.playReadyExpiresAt || null,
      remainingMinutes: previous === "green" ? remaining : null,
      remainingText: previous === "green" && existing?.playReadyExpiresAt ? playReadyRemainingText(existing.playReadyExpiresAt, new Date()) : null
    });
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
    ok: true,
    playReady: nextReady,
    state: next,
    label: playReadyLabel(next),
    previous: playReadyLabel(previous),
    expiresAt,
    durationMinutes: expiresAt ? effectiveDurationMinutes : null,
    remainingMinutes: expiresAt ? effectiveDurationMinutes : null,
    remainingText: expiresAt ? playReadyRemainingText(expiresAt, new Date()) : null
  });
}

export async function GET(request: NextRequest) {
  return handlePlayReady(request);
}

export async function POST(request: NextRequest) {
  return handlePlayReady(request);
}
