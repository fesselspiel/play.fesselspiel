import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTelegramUpdates, toChatCandidate } from "@/lib/telegram";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  if (!settings?.telegramBotTokenEnc) return NextResponse.json({ error: "Telegram Token fehlt" }, { status: 400 });
  const updates = await getTelegramUpdates(settings.telegramBotTokenEnc);
  const candidates = updates.result.map(toChatCandidate).filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
  return NextResponse.json({ ok: updates.ok, candidates });
}
