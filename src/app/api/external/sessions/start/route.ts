import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import { minutesBetween } from "@/lib/dates";
import { apiFeatureGate, dateFromValue, oneOf, requestValues, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";
import { uniqueSessionSlug } from "@/lib/session-slug";

export const runtime = "nodejs";

async function startSession(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "tracker.segufix");
  if (blocked) return blocked;
  const values = await requestValues(request);
  const open = await prisma.segufixSession.findFirst({ where: { tenantId: auth.user.tenantId || undefined, ownerId: auth.user.id, endTime: null }, orderBy: { startTime: "desc" } });
  const autoClosedAt = new Date();
  const closedSession = open
    ? await prisma.segufixSession.update({
        where: { id: open.id },
        data: {
          endTime: autoClosedAt,
          durationMinutes: minutesBetween(open.startTime, autoClosedAt),
          notes: [open.notes, "Automatisch beendet, weil per API eine neue Session gestartet wurde."].filter(Boolean).join("\n")
        }
      })
    : null;
  if (closedSession) {
    await logAction({
      actorId: auth.user.id,
      action: "session_auto_closed",
      entityType: "session",
      entityId: closedSession.id,
      title: "Offene Session automatisch beendet",
      href: closedSession.slug ? `/sessions/${closedSession.slug}` : null,
      details: { reason: "Neue Session per API gestartet" }
    });
  }
  const startTime = dateFromValue(values.get("startTime")) || new Date();
  const moodBefore = oneOf(values.get("moodBefore"), ["NEEDS_WORK", "OKAY", "NEUTRAL", "PLEASANT", "VERY_PLEASANT"] as const);
  const notes = [values.get("note") || values.get("notes") || "Per API gestartet", values.get("moodBeforeText") ? `Vorher: ${values.get("moodBeforeText")}` : ""].filter(Boolean).join("\n");
  const session = await prisma.segufixSession.create({
    data: {
      ownerId: auth.user.id,
      tenantId: auth.user.tenantId || undefined,
      slug: await uniqueSessionSlug(startTime, undefined, auth.user.tenantId),
      startTime,
      notes,
      moodBefore,
      moodBeforeText: null
    }
  });
  await logAction({
    actorId: auth.user.id,
    action: "session_started_api",
    entityType: "session",
    entityId: session.id,
    title: "Session per API gestartet",
    href: session.slug ? `/sessions/${session.slug}` : null
  });
  return NextResponse.json({ ok: true, action: closedSession ? "closed_and_started" : "started", closedSession, session });
}

export async function GET(request: NextRequest) {
  return startSession(request);
}

export async function POST(request: NextRequest) {
  return startSession(request);
}
