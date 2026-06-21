import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import { minutesBetween } from "@/lib/dates";
import { apiFeatureGate, dateFromValue, oneOf, requestValues, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function stopSession(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "tracker.segufix");
  if (blocked) return blocked;
  const values = await requestValues(request);
  const session = await prisma.segufixSession.findFirst({ where: { ownerId: auth.user.id, endTime: null }, orderBy: { startTime: "desc" } });
  if (!session) return NextResponse.json({ ok: false, error: "Keine laufende Session gefunden" }, { status: 404 });
  const endTime = dateFromValue(values.get("endTime")) || new Date();
  const note = [values.get("note") || values.get("notes") || "", values.get("moodAfterText") ? `Nachher: ${values.get("moodAfterText")}` : ""].filter(Boolean).join("\n");
  const moodAfter = oneOf(values.get("moodAfter"), ["WORSE", "UNCHANGED", "SLIGHTLY_BETTER", "MUCH_BETTER", "RELAXED"] as const);
  const updated = await prisma.segufixSession.update({
    where: { id: session.id },
    data: {
      endTime,
      durationMinutes: minutesBetween(session.startTime, endTime),
      notes: [session.notes, note].filter(Boolean).join("\n"),
      moodAfter,
      moodAfterText: null
    }
  });
  await logAction({
    actorId: auth.user.id,
    action: "session_stopped_api",
    entityType: "session",
    entityId: updated.id,
    title: "Session per API beendet",
    href: updated.slug ? `/sessions/${updated.slug}` : null
  });
  return NextResponse.json({ ok: true, action: "stopped", session: updated });
}

export async function GET(request: NextRequest) {
  return stopSession(request);
}

export async function POST(request: NextRequest) {
  return stopSession(request);
}
