import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { currentTenant } from "@/lib/tenancy";
import { resolveTelegramSettingsForScope } from "@/lib/tenant-telegram";
import { getTelegramUpdates, toChatCandidate } from "@/lib/telegram";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const scope = params.get("scope") === "user" ? "user" : "tenant";
  const tenant = await currentTenant();
  const settings = await resolveTelegramSettingsForScope(tenant.id, user.id, { scope, botId: params.get("botId") });
  if (!settings?.telegramBotTokenEnc) return NextResponse.json({ error: "Telegram Token fehlt" }, { status: 400 });
  try {
    const updates = await getTelegramUpdates(settings.telegramBotTokenEnc);
    const candidates = updates.result.map(toChatCandidate).filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
    return NextResponse.json({ ok: updates.ok, candidates });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Telegram konnte nicht gelesen werden.";
    if (message.includes("409") || message.toLowerCase().includes("webhook")) {
      return NextResponse.json(
        {
          ok: false,
          candidates: [],
          error: "Telegram gibt keine Testnachrichten aus, solange der Webhook aktiv ist. Lösche den Webhook kurz, sende eine Testnachricht und lies danach erneut ein."
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: false, candidates: [], error: "Telegram konnte gerade keine Testnachrichten liefern." }, { status: 502 });
  }
}
