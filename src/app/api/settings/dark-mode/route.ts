import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const current = await prisma.userSettings.findUnique({ where: { userId: user.id }, select: { darkMode: true } });
  const darkMode = !Boolean(current?.darkMode);
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: { darkMode },
    create: { userId: user.id, darkMode }
  });
  return NextResponse.json({ ok: true, darkMode });
}
