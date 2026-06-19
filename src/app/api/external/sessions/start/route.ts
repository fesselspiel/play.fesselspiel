import { NextRequest, NextResponse } from "next/server";
import { dateFromValue, oneOf, requestValues, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function startSession(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const values = await requestValues(request);
  const open = await prisma.segufixSession.findFirst({ where: { ownerId: auth.user.id, endTime: null }, orderBy: { startTime: "desc" } });
  if (open) return NextResponse.json({ ok: true, alreadyOpen: true, session: open });
  const startTime = dateFromValue(values.get("startTime")) || new Date();
  const moodBefore = oneOf(values.get("moodBefore"), ["NEEDS_WORK", "OKAY", "NEUTRAL", "PLEASANT", "VERY_PLEASANT"] as const);
  const session = await prisma.segufixSession.create({
    data: {
      ownerId: auth.user.id,
      startTime,
      notes: values.get("note") || values.get("notes") || "Per API gestartet",
      moodBefore,
      moodBeforeText: values.get("moodBeforeText") || null
    }
  });
  return NextResponse.json({ ok: true, action: "started", session });
}

export async function GET(request: NextRequest) {
  return startSession(request);
}

export async function POST(request: NextRequest) {
  return startSession(request);
}
