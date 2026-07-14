import { NextRequest, NextResponse } from "next/server";
import { POST as transcribeWiki } from "@/app/api/external/wiki/transcribe/route";
import { editableContentSpace, legacyVisibility } from "@/lib/content-spaces";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function forwardedRequest(request: NextRequest, formData: FormData) {
  const headers = new Headers();
  for (const key of ["authorization", "x-playplaner-view-context"]) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  return new NextRequest(new URL("/api/external/wiki/transcribe", request.url), { method: "POST", headers, body: formData });
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "wiki");
  if (blocked) return blocked;
  const space = await editableContentSpace(auth.user, params.id);
  if (!space) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ ok: false, error: "invalid_multipart", message: "multipart/form-data erwartet" }, { status: 400 });
  formData.set("mode", "create");
  formData.set("visibility", legacyVisibility(space.visibility));
  const calendarDateValue = String(formData.get("calendarDate") || "").trim();
  const calendarDate = calendarDateValue ? new Date(calendarDateValue) : new Date();
  if (Number.isNaN(calendarDate.getTime())) return NextResponse.json({ ok: false, error: "invalid_calendar_date" }, { status: 400 });
  const response = await transcribeWiki(forwardedRequest(request, formData));
  if (!response) return NextResponse.json({ ok: false, error: "transcription_failed" }, { status: 502 });
  const payload = await response.json().catch(() => null) as { ok?: boolean; item?: { id?: string }; page?: { id?: string } } | null;
  if (!response.ok || !payload?.ok) return NextResponse.json(payload || { ok: false, error: "transcription_failed" }, { status: response.status });
  const pageId = payload.item?.id || payload.page?.id;
  if (!pageId) return NextResponse.json({ ok: false, error: "invalid_transcription_response" }, { status: 502 });
  const entry = await prisma.contentSpaceEntry.create({ data: { spaceId: space.id, sourceType: "WIKI_PAGE", sourceId: pageId, calendarDate } });
  return NextResponse.json({ ...payload, entryId: entry.id, spaceId: space.id }, { status: response.status });
}
