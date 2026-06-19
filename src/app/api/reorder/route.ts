import { NextResponse } from "next/server";
import { ownerScope } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type ReorderKind = "toys" | "positions";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const body = await request.json().catch(() => null) as { kind?: ReorderKind; ids?: string[] } | null;
  const kind = body?.kind;
  const ids = Array.isArray(body?.ids) ? body.ids.map(String).filter(Boolean) : [];
  if (!kind || !["toys", "positions"].includes(kind) || !ids.length) {
    return NextResponse.json({ error: "Ungueltige Sortierung" }, { status: 400 });
  }

  const scope = await ownerScope(user);
  const accessible = kind === "toys"
    ? await prisma.toy.findMany({ where: { ...scope, id: { in: ids } }, select: { id: true } })
    : await prisma.position.findMany({ where: { ...scope, id: { in: ids } }, select: { id: true } });
  const allowed = new Set(accessible.map((entry) => entry.id));
  if (allowed.size !== ids.length) return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });

  await prisma.$transaction(
    ids.map((id, index) =>
      kind === "toys"
        ? prisma.toy.update({ where: { id }, data: { sortOrder: index + 1 } })
        : prisma.position.update({ where: { id }, data: { sortOrder: index + 1 } })
    )
  );
  return NextResponse.json({ ok: true });
}
