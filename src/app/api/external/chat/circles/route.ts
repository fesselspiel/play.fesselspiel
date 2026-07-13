import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { accessibleCircleChats } from "@/lib/circle-chat";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "circleChat");
  if (blocked) return blocked;
  const circles = await accessibleCircleChats(auth.user);
  const currentCircleId = circles.some((circle) => circle.id === auth.user.circleId)
    ? auth.user.circleId
    : circles[0]?.id || null;
  return NextResponse.json({
    ok: true,
    count: circles.length,
    currentCircleId,
    circles
  });
}
