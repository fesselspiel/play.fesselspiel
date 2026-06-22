import { NextResponse } from "next/server";
import { ownerScope } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type ReorderKind = "toys" | "positions" | "bondageSystem";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const body = await request.json().catch(() => null) as { kind?: ReorderKind; ids?: string[] } | null;
  const kind = body?.kind;
  if (["toys", "positions", "bondageSystem"].includes(String(kind)) && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  const ids = Array.isArray(body?.ids) ? body.ids.map(String).filter(Boolean) : [];
  if (!kind || !["toys", "positions", "bondageSystem"].includes(kind) || !ids.length) {
    return NextResponse.json({ error: "Ungültige Sortierung" }, { status: 400 });
  }

  const scope = await ownerScope(user);
  const accessible = kind === "toys"
    ? await prisma.toy.findMany({ where: { ...scope, id: { in: ids } }, select: { id: true } })
    : kind === "positions"
      ? await prisma.position.findMany({ where: { ...scope, id: { in: ids } }, select: { id: true } })
      : await prisma.bondageSystemItem.findMany({ where: { tenantId: user.tenantId || undefined, id: { in: ids } }, select: { id: true } });
  const allowed = new Set(accessible.map((entry) => entry.id));
  if (allowed.size !== ids.length) return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });

  await prisma.$transaction(
    ids.map((id, index) =>
      kind === "toys"
        ? prisma.toy.update({ where: { id }, data: { sortOrder: index + 1 } })
        : kind === "positions"
          ? prisma.position.update({ where: { id }, data: { sortOrder: index + 1 } })
          : prisma.bondageSystemItem.update({ where: { id }, data: { sortOrder: index + 1 } })
    )
  );
  return NextResponse.json({ ok: true });
}
