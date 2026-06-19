import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import { minutesBetween } from "@/lib/dates";
import { dateFromValue, requestValues, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function startKgSession(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const values = await requestValues(request);
  const open = await prisma.kgSession.findFirst({ where: { ownerId: auth.user.id, endTime: null }, orderBy: { startTime: "desc" } });
  const autoClosedAt = new Date();
  const closedSession = open
    ? await prisma.kgSession.update({
        where: { id: open.id },
        data: {
          endTime: autoClosedAt,
          durationMinutes: minutesBetween(open.startTime, autoClosedAt),
          notes: [open.notes, "Automatisch beendet, weil per API ein neuer KG-Tracker gestartet wurde."].filter(Boolean).join("\n")
        }
      })
    : null;
  if (closedSession) {
    await logAction({
      actorId: auth.user.id,
      action: "kg_auto_closed",
      entityType: "kgSession",
      entityId: closedSession.id,
      title: "Offener KG-Tracker automatisch beendet",
      href: "/sessions?tracker=kg"
    });
  }
  const startTime = dateFromValue(values.get("startTime")) || new Date();
  const session = await prisma.kgSession.create({
    data: {
      ownerId: auth.user.id,
      startTime,
      notes: values.get("note") || values.get("notes") || "Per API gestartet"
    }
  });
  await logAction({
    actorId: auth.user.id,
    action: "kg_started_api",
    entityType: "kgSession",
    entityId: session.id,
    title: "KG-Tracker per API gestartet",
    href: "/sessions?tracker=kg"
  });
  return NextResponse.json({ ok: true, action: closedSession ? "closed_and_started" : "started", closedSession, session });
}

export async function GET(request: NextRequest) {
  return startKgSession(request);
}

export async function POST(request: NextRequest) {
  return startKgSession(request);
}
