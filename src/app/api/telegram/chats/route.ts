import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const Body = z.object({
  chatId: z.string().min(1),
  threadId: z.string().nullable().optional(),
  title: z.string().optional(),
  chatTitle: z.string().optional(),
  threadTitle: z.string().nullable().optional(),
  lastMessageText: z.string().optional(),
  lastMessageFrom: z.string().optional()
});

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  const settings = await prisma.userSettings.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
  const threadId = parsed.data.threadId || null;
  const chatTitle = parsed.data.chatTitle || parsed.data.title || parsed.data.chatId;
  const threadTitle = parsed.data.threadTitle || null;
  const existing = await prisma.telegramChat.findFirst({ where: { settingsId: settings.id, chatId: parsed.data.chatId, threadId } });
  const detectedMessage = {
    lastMessageText: parsed.data.lastMessageText || null,
    lastMessageFrom: parsed.data.lastMessageFrom || null,
    lastMessageAt: new Date()
  };
  const chat = existing
    ? await prisma.telegramChat.update({
        where: { id: existing.id },
        data: {
          title: threadTitle || existing.threadTitle || null,
          chatTitle: chatTitle || existing.chatTitle,
          threadTitle: threadTitle || existing.threadTitle,
          status: "ACTIVE",
          targetUserId: existing.targetUserId || user.id,
          ...detectedMessage
        }
      })
    : await prisma.telegramChat.create({
        data: {
          settingsId: settings.id,
          targetUserId: user.id,
          chatId: parsed.data.chatId,
          threadId,
          title: threadTitle || null,
          chatTitle,
          threadTitle,
          status: "ACTIVE",
          ...detectedMessage
        }
      });
  return NextResponse.json({ ok: true, chat });
}
