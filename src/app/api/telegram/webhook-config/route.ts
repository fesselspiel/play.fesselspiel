import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { deleteTelegramWebhook, setTelegramWebhook } from "@/lib/telegram";

const Body = z.object({
  action: z.enum(["set", "delete"])
});

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Ungueltige Eingabe" }, { status: 400 });
  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  if (!settings?.telegramBotTokenEnc) return NextResponse.json({ error: "Telegram Token fehlt" }, { status: 400 });
  const result =
    parsed.data.action === "set"
      ? await setTelegramWebhook(settings.telegramBotTokenEnc, `${env.appUrl}/api/telegram/webhook`)
      : await deleteTelegramWebhook(settings.telegramBotTokenEnc);
  return NextResponse.json(result);
}
