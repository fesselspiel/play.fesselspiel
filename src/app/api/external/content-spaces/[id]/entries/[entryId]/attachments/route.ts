import { NextRequest, NextResponse } from "next/server";
import { POST as uploadWikiAttachment } from "@/app/api/external/wiki/[id]/attachments/route";
import { editableContentSpace } from "@/lib/content-spaces";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

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
  if (entry.sourceType !== "WIKI_PAGE") return NextResponse.json({ ok: false, error: "legacy_idea_attachment_uses_ideas_api" }, { status: 409 });
  return uploadWikiAttachment(request, { params: Promise.resolve({ id: entry.sourceId }) });
}
