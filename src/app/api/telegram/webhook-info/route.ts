import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { currentTenant } from "@/lib/tenancy";
import { resolveTelegramSettingsForScope } from "@/lib/tenant-telegram";
import { getTelegramWebhookInfo } from "@/lib/telegram";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const scope = params.get("scope") === "user" ? "user" : "tenant";
  const tenant = await currentTenant();
  const settings = await resolveTelegramSettingsForScope(tenant.id, user.id, { scope, botId: params.get("botId") });
  if (!settings?.telegramBotTokenEnc) return NextResponse.json({ error: "Telegram Token fehlt" }, { status: 400 });
  const info = await getTelegramWebhookInfo(settings.telegramBotTokenEnc);
  return NextResponse.json(info);
}
