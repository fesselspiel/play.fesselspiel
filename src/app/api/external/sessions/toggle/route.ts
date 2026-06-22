import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, dateFromValue, requestValues, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";
import { startTrackerEntry, stopTrackerEntry } from "@/lib/tracker-core";

export const runtime = "nodejs";

async function toggleSession(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "tracker.segufix");
  if (blocked) return blocked;
  const values = await requestValues(request);
  const open = await prisma.trackerEntry.findFirst({
    where: { ownerId: auth.user.id, trackerType: { key: "segufix" }, endTime: null },
    orderBy: { startTime: "desc" }
  });
  if (open) {
    const entry = await stopTrackerEntry({ key: "segufix", user: auth.user, notes: values.get("note") || values.get("notes") || "" });
    return NextResponse.json({ ok: true, action: "stopped", entry });
  }
  const entry = await startTrackerEntry({
    key: "segufix",
    user: auth.user,
    startTime: dateFromValue(values.get("startTime")) || undefined,
    notes: values.get("note") || values.get("notes") || "Per API gestartet"
  });
  return NextResponse.json({ ok: true, action: "started", entry });
}

export async function GET(request: NextRequest) {
  return toggleSession(request);
}

export async function POST(request: NextRequest) {
  return toggleSession(request);
}
