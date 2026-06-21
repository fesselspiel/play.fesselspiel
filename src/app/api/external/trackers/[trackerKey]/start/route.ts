import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import { dateFromValue, requestValues, requireApiUser } from "@/lib/external-api";
import { startTrackerEntry } from "@/lib/tracker-core";

export const runtime = "nodejs";

async function startTracker(request: NextRequest, trackerKey: string) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const values = await requestValues(request);
  const entry = await startTrackerEntry({
    key: trackerKey,
    user: auth.user,
    startTime: dateFromValue(values.get("startTime")) || undefined,
    notes: values.get("note") || values.get("notes") || "Per API gestartet"
  });
  if (!entry) return NextResponse.json({ ok: false, error: "Tracker nicht gefunden oder deaktiviert" }, { status: 404 });
  await logAction({
    actorId: auth.user.id,
    action: `tracker_${trackerKey}_started_api`,
    entityType: "trackerEntry",
    entityId: entry.id,
    title: `${trackerKey}-Tracker per API gestartet`,
    href: `/trackers/${trackerKey}/${entry.slug || entry.id}`
  });
  return NextResponse.json({ ok: true, entry });
}

export async function GET(request: NextRequest, { params }: { params: { trackerKey: string } }) {
  return startTracker(request, params.trackerKey);
}

export async function POST(request: NextRequest, { params }: { params: { trackerKey: string } }) {
  return startTracker(request, params.trackerKey);
}

