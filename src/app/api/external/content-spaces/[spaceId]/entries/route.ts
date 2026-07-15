import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import {
  contentSpaceAccess,
  blockedContentOwnerIds,
  hiddenContentIds,
  serializeContentEntry
} from "@/lib/content-spaces";
import { apiFeatureGate, dateFromValue, requireApiUser } from "@/lib/external-api";
import { saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function requestBody(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const values = new Map<string, string>();
    form.forEach((value, key) => {
      if (typeof value === "string") values.set(key, value);
    });
    return { values, files: form.getAll("file").filter((entry): entry is File => entry instanceof File && entry.size > 0) };
  }
  const json = await request.json().catch(() => ({})) as Record<string, unknown>;
  const values = new Map(Object.entries(json).map(([key, value]) => [key, String(value ?? "")]));
  return { values, files: [] as File[] };
}

export async function GET(request: NextRequest, props: { params: Promise<{ spaceId: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;

  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 50)));
  const cursor = searchParams.get("cursor") || undefined;
  const q = String(searchParams.get("q") || "").trim();
  const excludedOwnerIds = await blockedContentOwnerIds(auth.user);
  const hiddenEntryIds = await hiddenContentIds(auth.user, "contentEntry");

  const resolved = await contentSpaceAccess(auth.user, params.spaceId);
  if (!resolved || !("space" in resolved) || !resolved.space) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const { space } = resolved;
  const entries = await prisma.contentEntry.findMany({
    where: {
      spaceId: space.id,
      ownerId: { notIn: excludedOwnerIds },
      id: { notIn: hiddenEntryIds },
      ...(auth.user.tenantId ? { tenantId: auth.user.tenantId } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }] } : {})
    },
    include: { owner: { include: { profile: true } }, space: true, attachments: { include: { file: true }, orderBy: { createdAt: "asc" } } },
    orderBy: [{ calendarDate: "desc" }, { updatedAt: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  });
  const pageItems = entries.slice(0, limit);
  return NextResponse.json({ ok: true, count: pageItems.length, nextCursor: entries.length > limit ? entries[limit].id : null, items: pageItems.map((entry) => serializeContentEntry(request, entry, auth.user)) });
}

export async function POST(request: NextRequest, props: { params: Promise<{ spaceId: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;

  const { values, files } = await requestBody(request);
  const title = String(values.get("title") || "").trim();
  if (!title) return NextResponse.json({ ok: false, error: "title_required", message: "Titel fehlt" }, { status: 400 });
  const content = String(values.get("content") || values.get("text") || "").trim();
  const calendarDate = dateFromValue(values.get("calendarDate") || values.get("date"));
  const visibility = String(values.get("visibility") || "").trim();

  const resolved = await contentSpaceAccess(auth.user, params.spaceId);
  if (!resolved || !("space" in resolved) || !resolved.space) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const { space } = resolved;
  const entry = await prisma.contentEntry.create({
    data: {
      tenantId: auth.user.tenantId || undefined,
      ownerId: auth.user.id,
      spaceId: space.id,
      title,
      content,
      calendarDate: calendarDate || undefined,
      visibility: visibility ? visibility : null
    },
    include: { owner: { include: { profile: true } }, space: true, attachments: { include: { file: true }, orderBy: { createdAt: "asc" } } }
  });
  for (const file of files) {
    const asset = await saveUploadedFile(auth.user.id, file, auth.user.tenantId);
    if (asset) await prisma.contentEntryAttachment.create({ data: { tenantId: auth.user.tenantId || undefined, ownerId: auth.user.id, entryId: entry.id, fileId: asset.id, title: file.name || asset.originalName } });
  }
  const refreshed = await prisma.contentEntry.findUnique({ where: { id: entry.id }, include: { owner: { include: { profile: true } }, space: true, attachments: { include: { file: true }, orderBy: { createdAt: "asc" } } } });
  await logAction({ actorId: auth.user.id, action: "content_entry_created_api", entityType: "contentEntry", entityId: entry.id, title: `Inhalt angelegt: ${entry.title}`, href: `/content-spaces/${entry.spaceId}/entries/${entry.id}` });
  return NextResponse.json({ ok: true, item: refreshed ? serializeContentEntry(request, refreshed, auth.user) : null }, { status: 201 });
}
