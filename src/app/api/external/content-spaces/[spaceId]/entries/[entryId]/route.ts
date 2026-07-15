import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import { canEditContentEntry, contentEntryAccess, serializeContentEntry } from "@/lib/content-spaces";
import { apiFeatureGate, dateFromValue, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest, props: { params: Promise<{ spaceId: string; entryId: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;

  const resolved = await contentEntryAccess(auth.user, params.spaceId, params.entryId);
  if (!resolved) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, item: serializeContentEntry(request, resolved.entry, auth.user) });
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ spaceId: string; entryId: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;

  const resolved = await contentEntryAccess(auth.user, params.spaceId, params.entryId);
  if (!resolved || !canEditContentEntry(auth.user, resolved.entry, resolved.space)) return NextResponse.json({ ok: false, error: "not_found_or_readonly" }, { status: 404 });
  const entry = await prisma.contentEntry.update({
    where: { id: resolved.entry.id },
    data: {
      ...(body.title !== undefined ? { title: String(body.title || "").trim() || resolved.entry.title } : {}),
      ...(body.content !== undefined || body.text !== undefined ? { content: String(body.content || body.text || "").trim() } : {}),
      ...(body.calendarDate !== undefined || body.date !== undefined ? { calendarDate: dateFromValue(String(body.calendarDate || body.date || "")) } : {}),
      ...(body.visibility !== undefined ? { visibility: String(body.visibility || "").trim() || null } : {})
    },
    include: { owner: { include: { profile: true } }, space: true, attachments: { include: { file: true }, orderBy: { createdAt: "asc" } } }
  });
  await logAction({ actorId: auth.user.id, action: "content_entry_updated_api", entityType: "contentEntry", entityId: entry.id, title: `Inhalt geändert: ${entry.title}`, href: `/content-spaces/${entry.spaceId}/entries/${entry.id}` });
  return NextResponse.json({ ok: true, item: serializeContentEntry(request, entry, auth.user) });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ spaceId: string; entryId: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;

  const resolved = await contentEntryAccess(auth.user, params.spaceId, params.entryId);
  if (!resolved || !canEditContentEntry(auth.user, resolved.entry, resolved.space)) return NextResponse.json({ ok: false, error: "not_found_or_readonly" }, { status: 404 });
  await prisma.contentEntry.delete({ where: { id: resolved.entry.id } });
  await logAction({ actorId: auth.user.id, action: "content_entry_deleted_api", entityType: "contentEntry", entityId: resolved.entry.id, title: `Inhalt gelöscht: ${resolved.entry.title}` });
  return NextResponse.json({ ok: true });
}
