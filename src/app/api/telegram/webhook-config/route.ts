import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { currentTenant } from "@/lib/tenancy";
import { resolveTelegramSettingsForScope } from "@/lib/tenant-telegram";
import { deleteTelegramWebhook, setTelegramWebhook } from "@/lib/telegram";

const Body = z.object({
  action: z.enum(["set", "delete"]),
  scope: z.enum(["tenant", "user"]).optional(),
  botId: z.string().optional()
});

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  const scope = parsed.data.scope === "user" ? "user" : "tenant";
  const tenant = await currentTenant();
  const settings = await resolveTelegramSettingsForScope(tenant.id, user.id, { scope, botId: parsed.data.botId });
  if (!settings?.telegramBotTokenEnc) return NextResponse.json({ error: "Telegram Token fehlt" }, { status: 400 });
  const webhookUrl = `${env.appUrl}/api/telegram/webhook?tenantTelegramSettingsId=${settings.id}`;
  const result =
    parsed.data.action === "set"
      ? await setTelegramWebhook(settings.telegramBotTokenEnc, webhookUrl)
      : await deleteTelegramWebhook(settings.telegramBotTokenEnc);
  return NextResponse.json(result);
}
