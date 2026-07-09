import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { ownerScope } from "@/lib/access";
import { logAction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function ids(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((entry) => entry.trim()).filter(Boolean);
  return String(value || "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const kind = String(body.kind || body.type || "").trim().toLowerCase();
  if (kind !== "toy" && kind !== "toys" && kind !== "position" && kind !== "positions") {
    return NextResponse.json({ ok: false, error: "invalid_kind" }, { status: 400 });
  }
  const itemIds = ids(body.ids || body.itemIds || body.order);
  if (!itemIds.length) return NextResponse.json({ ok: false, error: "ids_required" }, { status: 400 });
  const scope = await ownerScope(auth.user);
  const model = kind.startsWith("toy") ? prisma.toy : prisma.position;
  const existing = await (model as any).findMany({ where: { ...scope, id: { in: itemIds } }, select: { id: true } });
  const allowed = new Set(existing.map((entry: { id: string }) => entry.id));
  await prisma.$transaction(itemIds.filter((id) => allowed.has(id)).map((id, index) => (model as any).update({ where: { id }, data: { sortOrder: (index + 1) * 10 } })));
  await logAction({
    actorId: auth.user.id,
    action: kind.startsWith("toy") ? "toy_reordered_api" : "position_reordered_api",
    entityType: kind.startsWith("toy") ? "toy" : "position",
    title: kind.startsWith("toy") ? "Spielsachen per API sortiert" : "Szenen per API sortiert",
    href: kind.startsWith("toy") ? "/toys" : "/positions",
    details: { ids: itemIds.filter((id) => allowed.has(id)) }
  });
  return NextResponse.json({ ok: true, count: allowed.size, ids: itemIds.filter((id) => allowed.has(id)) });
}
