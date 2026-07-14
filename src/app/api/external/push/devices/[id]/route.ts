import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { deleteVisiblePushDevice } from "@/lib/native-push-devices";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;

  const device = await deleteVisiblePushDevice(auth.user, params.id);
  if (!device) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, id: device.id });
}
