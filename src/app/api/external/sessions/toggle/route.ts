import { NextRequest, NextResponse } from "next/server";
import { minutesBetween } from "@/lib/dates";
import { apiFeatureGate, dateFromValue, requestValues, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";
import { uniqueSessionSlug } from "@/lib/session-slug";

export const runtime = "nodejs";

async function toggleSession(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "tracker.segufix");
  if (blocked) return blocked;
  const values = await requestValues(request);
  const open = await prisma.segufixSession.findFirst({ where: { tenantId: auth.user.tenantId || undefined, ownerId: auth.user.id, endTime: null }, orderBy: { startTime: "desc" } });
  if (!open) {
    const startTime = dateFromValue(values.get("startTime")) || new Date();
    const session = await prisma.segufixSession.create({
      data: {
        ownerId: auth.user.id,
        tenantId: auth.user.tenantId || undefined,
        slug: await uniqueSessionSlug(startTime, undefined, auth.user.tenantId),
        startTime,
        notes: values.get("note") || values.get("notes") || "Per API gestartet"
      }
    });
    return NextResponse.json({ ok: true, action: "started", session });
  }
  const endTime = dateFromValue(values.get("endTime")) || new Date();
  const note = values.get("note") || values.get("notes") || "";
  const session = await prisma.segufixSession.update({
    where: { id: open.id },
    data: {
      endTime,
      durationMinutes: minutesBetween(open.startTime, endTime),
      notes: [open.notes, note].filter(Boolean).join("\n")
    }
  });
  return NextResponse.json({ ok: true, action: "stopped", session });
}

export async function GET(request: NextRequest) {
  return toggleSession(request);
}

export async function POST(request: NextRequest) {
  return toggleSession(request);
}
