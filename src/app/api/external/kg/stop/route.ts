import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import { minutesBetween } from "@/lib/dates";
import { apiFeatureGate, dateFromValue, requestValues, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function stopKgSession(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "tracker.kg");
  if (blocked) return blocked;
  const values = await requestValues(request);
  const session = await prisma.kgSession.findFirst({ where: { ownerId: auth.user.id, endTime: null }, orderBy: { startTime: "desc" } });
  if (!session) return NextResponse.json({ ok: false, error: "Kein laufender KG-Tracker gefunden" }, { status: 404 });
  const endTime = dateFromValue(values.get("endTime")) || new Date();
  const note = values.get("note") || values.get("notes") || "";
  const updated = await prisma.kgSession.update({
    where: { id: session.id },
    data: {
      endTime,
      durationMinutes: minutesBetween(session.startTime, endTime),
      notes: [session.notes, note].filter(Boolean).join("\n")
    }
  });
  await logAction({
    actorId: auth.user.id,
    action: "kg_stopped_api",
    entityType: "kgSession",
    entityId: updated.id,
    title: "KG-Tracker per API beendet",
    href: "/sessions?tracker=kg"
  });
  return NextResponse.json({ ok: true, action: "stopped", session: updated });
}

export async function GET(request: NextRequest) {
  return stopKgSession(request);
}

export async function POST(request: NextRequest) {
  return stopKgSession(request);
}
