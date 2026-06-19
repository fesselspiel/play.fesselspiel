import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ available: false }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ available: false }, { status: 403 });
  const url = new URL(request.url);
  const username = String(url.searchParams.get("username") || "").trim();
  if (!username) return NextResponse.json({ available: false });
  const existing = await prisma.user.findUnique({ where: { username } });
  return NextResponse.json({ available: !existing });
}
