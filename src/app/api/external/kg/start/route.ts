import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, dateFromValue, requestValues, requireApiUser } from "@/lib/external-api";
import { startTrackerEntry } from "@/lib/tracker-core";

export const runtime = "nodejs";

async function startKg(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "tracker.kg");
  if (blocked) return blocked;
  const values = await requestValues(request);
  const entry = await startTrackerEntry({
    key: "kg",
    user: auth.user,
    startTime: dateFromValue(values.get("startTime")) || undefined,
    notes: values.get("note") || values.get("notes") || "Per API gestartet"
  });
  if (!entry) return NextResponse.json({ ok: false, error: "Tracker nicht gefunden" }, { status: 404 });
  await logAction({
    actorId: auth.user.id,
    action: "tracker_kg_started_api",
    entityType: "trackerEntry",
    entityId: entry.id,
    title: "KG per API gestartet",
    href: `/trackers/kg/${entry.slug || entry.id}`
  });
  return NextResponse.json({ ok: true, action: "started", entry });
}

export async function GET(request: NextRequest) {
  return startKg(request);
}

export async function POST(request: NextRequest) {
  return startKg(request);
}
