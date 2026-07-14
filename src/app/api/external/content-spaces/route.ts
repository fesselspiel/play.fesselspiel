import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import {
  legacySpaceCounts,
  normalizeContentVisibility,
  realSpacesForUser,
  serializeContentSpace
} from "@/lib/content-spaces";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function stringArray(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  return [];
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;

  const [counts, spaces] = await Promise.all([legacySpaceCounts(auth.user), realSpacesForUser(auth.user)]);
  const items = [
    serializeContentSpace(request, "legacy-wiki", counts.wikiCount, auth.user),
    serializeContentSpace(request, "legacy-ideas", counts.ideaCount, auth.user),
    ...spaces.map((space) => serializeContentSpace(request, space, 0, auth.user))
  ];
  return NextResponse.json({ ok: true, count: items.length, items });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ ok: false, error: "name_required", message: "Name fehlt" }, { status: 400 });

  const space = await prisma.contentSpace.create({
    data: {
      tenantId: auth.user.tenantId || undefined,
      ownerId: auth.user.id,
      name,
      kind: String(body.kind || body.templateKey || "custom").trim() || "custom",
      templateKey: body.templateKey ? String(body.templateKey).trim() : null,
      icon: body.icon ? String(body.icon).trim() : null,
      sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
      visibility: normalizeContentVisibility(body.visibility),
      allowedUserIds: stringArray(body.allowedUserIds),
      allowedCircleIds: stringArray(body.allowedCircleIds)
    },
    include: { owner: { include: { profile: true } }, _count: { select: { entries: true } } }
  });
  await logAction({
    actorId: auth.user.id,
    action: "content_space_created_api",
    entityType: "contentSpace",
    entityId: space.id,
    title: `Inhaltsbereich angelegt: ${space.name}`,
    href: `/content-spaces/${space.id}`
  });
  return NextResponse.json({ ok: true, item: serializeContentSpace(request, space, 0, auth.user) }, { status: 201 });
}
