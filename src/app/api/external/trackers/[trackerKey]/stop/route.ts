import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requestValues, requireApiUser } from "@/lib/external-api";
import { stopTrackerEntry } from "@/lib/tracker-core";

export const runtime = "nodejs";

async function stopTracker(request: NextRequest, trackerKey: string) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers", `tracker.${trackerKey}`);
  if (blocked) return blocked;
  const values = await requestValues(request);
  const entry = await stopTrackerEntry({
    key: trackerKey,
    user: auth.user,
    notes: values.get("note") || values.get("notes") || ""
  });
  if (!entry) return NextResponse.json({ ok: false, error: "Kein laufender Tracker gefunden" }, { status: 404 });
  await logAction({
    actorId: auth.user.id,
    action: `tracker_${trackerKey}_stopped_api`,
    entityType: "trackerEntry",
    entityId: entry.id,
    title: `${trackerKey}-Tracker per API beendet`,
    href: `/trackers/${trackerKey}/${entry.slug || entry.id}`
  });
  return NextResponse.json({ ok: true, entry });
}

export async function GET(request: NextRequest, { params }: { params: { trackerKey: string } }) {
  return stopTracker(request, params.trackerKey);
}

export async function POST(request: NextRequest, { params }: { params: { trackerKey: string } }) {
  return stopTracker(request, params.trackerKey);
}
