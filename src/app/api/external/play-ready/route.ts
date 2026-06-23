import { NextRequest, NextResponse } from "next/server";
import { logAction, userDisplayName } from "@/lib/audit";
import { apiFeatureGate, requestValues, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const maxDurationMinutes = 12 * 60;

function playReadyLabel(value: boolean) {
  return value ? "voll Lust" : "gerade nicht";
}

function durationFromValues(values: Map<string, string>) {
  const directMinutes = Number(values.get("expiresMinutes") || values.get("durationMinutes") || "");
  if (Number.isFinite(directMinutes) && directMinutes > 0) return Math.min(maxDurationMinutes, Math.ceil(directMinutes / 15) * 15);
  const hours = Number(values.get("hours") || values.get("expiresHours") || "0");
  const minutes = Number(values.get("minutes") || values.get("expiresMinute") || "0");
  const total = (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
  if (total <= 0) return 0;
  return Math.min(maxDurationMinutes, Math.ceil(total / 15) * 15);
}

function stateFromValues(values: Map<string, string>, current: boolean) {
  const raw = String(values.get("state") || values.get("ready") || values.get("playReady") || "").trim().toLowerCase();
  if (!raw) return null;
  if (["green", "gruen", "grün", "true", "1", "yes", "on", "lust"].includes(raw)) return true;
  if (["red", "rot", "false", "0", "no", "off", "nicht"].includes(raw)) return false;
  if (raw === "toggle" || raw === "switch") return !current;
  return null;
}

async function handlePlayReady(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "playReady");
  if (blocked) return blocked;
  const values = await requestValues(request);
  const existing = await prisma.userSettings.findUnique({ where: { userId: auth.user.id } });
  const previous = Boolean(existing?.playReady);
  const next = stateFromValues(values, previous);

  if (next === null) {
    return NextResponse.json({
      ok: true,
      user: { id: auth.user.id, name: userDisplayName(auth.user) },
      playReady: previous,
      label: playReadyLabel(previous),
      expiresAt: existing?.playReadyExpiresAt || null
    });
  }

  const durationMinutes = durationFromValues(values);
  const expiresAt = next && durationMinutes > 0 ? new Date(Date.now() + durationMinutes * 60_000) : null;
  await prisma.userSettings.upsert({
    where: { userId: auth.user.id },
    update: { playReady: next, playReadyUpdatedAt: new Date(), playReadyExpiresAt: expiresAt },
    create: { userId: auth.user.id, playReady: next, playReadyUpdatedAt: new Date(), playReadyExpiresAt: expiresAt }
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
      durationMinutes: expiresAt ? durationMinutes : null,
      expiresAt: expiresAt?.toISOString() || null
    },
    href: "/"
  });
  return NextResponse.json({
    ok: true,
    playReady: next,
    label: playReadyLabel(next),
    previous: playReadyLabel(previous),
    expiresAt,
    durationMinutes: expiresAt ? durationMinutes : null
  });
}

export async function GET(request: NextRequest) {
  return handlePlayReady(request);
}

export async function POST(request: NextRequest) {
  return handlePlayReady(request);
}
