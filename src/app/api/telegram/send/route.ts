import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";

const Body = z.object({
  chatId: z.string().min(1),
  threadId: z.string().optional().nullable(),
  text: z.string().min(1)
});

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Ungueltige Eingabe" }, { status: 400 });
  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  if (!settings?.telegramBotTokenEnc) return NextResponse.json({ error: "Telegram Token fehlt" }, { status: 400 });
  const result = await sendTelegramMessage(settings.telegramBotTokenEnc, parsed.data.chatId, parsed.data.threadId, parsed.data.text, { parseMode: "HTML", disableWebPagePreview: true });
  return NextResponse.json(result);
}
