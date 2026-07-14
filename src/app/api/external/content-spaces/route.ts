import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { logAction } from "@/lib/audit";
import {
  contentSpaceAccessWhere,
  contentSpaceInclude,
  ensureDefaultContentSpaces,
  parseContentSpaceKind,
  parseContentSpaceVisibility,
  replaceContentSpaceShares,
  serializeContentSpace,
  stringIds
} from "@/lib/content-spaces";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "wiki");
  if (blocked) return blocked;
  await ensureDefaultContentSpaces(auth.user);
  const spaces = await prisma.contentSpace.findMany({
    where: await contentSpaceAccessWhere(auth.user),
    include: contentSpaceInclude,
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }]
  });
  return NextResponse.json({ ok: true, count: spaces.length, items: spaces.map((space) => serializeContentSpace(space, auth.user)) });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "wiki");
  if (blocked) return blocked;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
  const visibility = parseContentSpaceVisibility(body.visibility);
  const allowedUserIds = stringIds(body.allowedUserIds);
  const allowedCircleIds = stringIds(body.allowedCircleIds);
  let space;
  try {
    space = await prisma.contentSpace.create({
      data: {
        tenantId: auth.user.tenantId || undefined,
        ownerId: auth.user.id,
        name,
        kind: parseContentSpaceKind(body.kind || body.templateKey),
        icon: String(body.icon || "").trim() || null,
        sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 100,
        visibility
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ ok: false, error: "name_exists" }, { status: 409 });
    }
    throw error;
  }
  await replaceContentSpaceShares(
    space.id,
    auth.user,
    visibility === "USERS" ? allowedUserIds : [],
    visibility === "CIRCLES" ? allowedCircleIds : []
  );
  const created = await prisma.contentSpace.findUniqueOrThrow({ where: { id: space.id }, include: contentSpaceInclude });
  await logAction({
    actorId: auth.user.id,
    action: "content_space_created",
    entityType: "contentSpace",
    entityId: created.id,
    title: `Inhaltsbereich angelegt: ${created.name}`,
    href: "/wiki"
  });
  return NextResponse.json({ ok: true, item: serializeContentSpace(created, auth.user) }, { status: 201 });
}
