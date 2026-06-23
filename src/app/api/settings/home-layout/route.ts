import { NextRequest, NextResponse } from "next/server";
import { currentSessionContext } from "@/lib/auth";
import { logAction, userDisplayName } from "@/lib/audit";
import { normalizeHomeLayout } from "@/lib/home-layout";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { actor, tenant } = await currentSessionContext();
  if (!actor || !tenant) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  const body = await request.json().catch(() => null) as { keys?: unknown } | null;
  const layout = normalizeHomeLayout(Array.isArray(body?.keys) ? body.keys : []);
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { homeLayout: layout }
  });
  await logAction({
    actorId: actor.id,
    action: "home_layout_updated",
    entityType: "tenant",
    entityId: tenant.id,
    title: `${userDisplayName(actor)} hat die Startseite sortiert`,
    href: "/settings/home",
    details: { layout }
  });
  return NextResponse.json({ ok: true, layout });
}
