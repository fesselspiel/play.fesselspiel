import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requestValues, requireApiUser } from "@/lib/external-api";
import { stopTrackerEntry } from "@/lib/tracker-core";

export const runtime = "nodejs";

async function stopSession(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "tracker.segufix");
  if (blocked) return blocked;
  const values = await requestValues(request);
  const entry = await stopTrackerEntry({
    key: "segufix",
    user: auth.user,
    notes: values.get("note") || values.get("notes") || ""
  });
  if (!entry) return NextResponse.json({ ok: false, error: "Keine laufende Segufix-Zeit gefunden" }, { status: 404 });
  await logAction({
    actorId: auth.user.id,
    action: "tracker_segufix_stopped_api",
    entityType: "trackerEntry",
    entityId: entry.id,
    title: "Segufix per API beendet",
    href: `/trackers/segufix/${entry.slug || entry.id}`
  });
  return NextResponse.json({ ok: true, action: "stopped", entry });
}

export async function GET(request: NextRequest) {
  return stopSession(request);
}

export async function POST(request: NextRequest) {
  return stopSession(request);
}
