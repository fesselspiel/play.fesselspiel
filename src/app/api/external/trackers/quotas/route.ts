import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { quotaSummaryText, trackerQuotaStatusForUser } from "@/lib/tracker-quotas";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers");
  if (blocked) return blocked;
  const trackerKey = request.nextUrl.searchParams.get("trackerKey")?.trim().toLowerCase();
  const quotas = await trackerQuotaStatusForUser(auth.user);
  const filteredQuotas = quotas
    .filter((entry) => entry.hasQuota)
    .filter((entry) => !trackerKey || entry.tracker.key.toLowerCase() === trackerKey || entry.tracker.title.toLowerCase().includes(trackerKey));
  return NextResponse.json({
    ok: true,
    quotas: filteredQuotas.map((entry) => ({
      tracker: entry.tracker,
      daily: entry.daily,
      weekly: entry.weekly,
      monthlyMinutes: entry.monthlyMinutes,
      monthlyDays: entry.monthlyDays,
      complete: entry.complete,
      summary: quotaSummaryText(entry)
    }))
  });
}
