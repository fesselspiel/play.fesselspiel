import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { runDueAutomationActions } from "@/lib/session-automation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, { allowUnaccepted: true });
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "scheduledRules");
  if (blocked) return blocked;
  const result = await runDueAutomationActions();
  return NextResponse.json({ ok: true, count: result.length, items: result });
}
