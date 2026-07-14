import { NextRequest, NextResponse } from "next/server";
import { POST as transcribeWiki } from "@/app/api/external/wiki/transcribe/route";
import { editableContentSpace } from "@/lib/content-spaces";
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

export async function POST(request: NextRequest, props: { params: Promise<{ id: string; entryId: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "wiki");
  if (blocked) return blocked;
  const space = await editableContentSpace(auth.user, params.id);
  if (!space) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const entry = await prisma.contentSpaceEntry.findFirst({ where: { id: params.entryId, spaceId: space.id } });
  if (!entry) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (entry.sourceType !== "WIKI_PAGE") return NextResponse.json({ ok: false, error: "legacy_idea_transcription_not_supported" }, { status: 409 });
  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ ok: false, error: "invalid_multipart", message: "multipart/form-data erwartet" }, { status: 400 });
  formData.set("mode", "append");
  formData.set("pageId", entry.sourceId);
  formData.set("insertAt", "append");
  const response = await transcribeWiki(forwardedRequest(request, formData));
  if (!response) return NextResponse.json({ ok: false, error: "transcription_failed" }, { status: 502 });
  const payload = await response.json().catch(() => null);
  return NextResponse.json(payload || { ok: false, error: "transcription_failed" }, { status: response.status });
}
