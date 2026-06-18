import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTelegramWebhookInfo } from "@/lib/telegram";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  if (!settings?.telegramBotTokenEnc) return NextResponse.json({ error: "Telegram Token fehlt" }, { status: 400 });
  const info = await getTelegramWebhookInfo(settings.telegramBotTokenEnc);
  return NextResponse.json(info);
}
