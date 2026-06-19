import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const Body = z.object({
  chatId: z.string().min(1),
  threadId: z.string().nullable().optional(),
  title: z.string().optional()
});

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Ungueltige Eingabe" }, { status: 400 });
  const settings = await prisma.userSettings.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
  const threadId = parsed.data.threadId || null;
  const existing = await prisma.telegramChat.findFirst({ where: { settingsId: settings.id, chatId: parsed.data.chatId, threadId } });
  const chat = existing
    ? await prisma.telegramChat.update({
        where: { id: existing.id },
        data: { title: parsed.data.title || existing.title, status: "ACTIVE", targetUserId: existing.targetUserId || user.id, lastMessageAt: new Date() }
      })
    : await prisma.telegramChat.create({
        data: {
          settingsId: settings.id,
          targetUserId: user.id,
          chatId: parsed.data.chatId,
          threadId,
          title: parsed.data.title || parsed.data.chatId,
          status: "ACTIVE",
          lastMessageAt: new Date()
        }
      });
  return NextResponse.json({ ok: true, chat });
}
