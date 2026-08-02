import { NextResponse } from "next/server";
import { hashApiToken } from "@/lib/api-tokens";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") || "");
  if (token) {
    await prisma.apiToken.updateMany({
      where: { tokenHash: hashApiToken(token), active: true },
      data: { active: false }
    });
  }
  return new NextResponse(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}
