import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidUsername, normalizeUsername } from "@/lib/usernames";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ available: false }, { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") return NextResponse.json({ available: false }, { status: 403 });
  const url = new URL(request.url);
  const username = normalizeUsername(url.searchParams.get("username"));
  const excludeId = String(url.searchParams.get("excludeId") || "").trim();
  if (!username || !isValidUsername(username)) return NextResponse.json({ available: false, username, valid: false });
  const existing = await prisma.user.findUnique({ where: { username } });
  return NextResponse.json({ available: !existing || existing.id === excludeId, username, valid: true });
}
