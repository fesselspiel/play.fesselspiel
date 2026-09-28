import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { dispatchTrackerQuotaTextRule, findTrackerQuotaDeliveryRule } from "@/lib/tracker-quota-deliveries";

export const runtime = "nodejs";

export async function POST(request: NextRequest, props: { params: Promise<{ trackerKey: string }> }) {
  const { trackerKey } = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers", `tracker.${trackerKey}`);
  if (blocked) return blocked;
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 });
  const rule = await findTrackerQuotaDeliveryRule(auth.user.id, auth.user.tenantId, trackerKey);
  if (!rule) return NextResponse.json({ ok: false, delivered: false, message: "Noch kein API-Versand gespeichert." });
  const result = await dispatchTrackerQuotaTextRule(rule, auth.user);
  return NextResponse.json({ ok: true, delivered: result.status === "SENT", message: result.message });
}
