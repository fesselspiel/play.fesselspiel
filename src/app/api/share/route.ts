import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { shareItem } from "@/lib/share";

export const runtime = "nodejs";

const channels = new Set(["email", "telegram", "push", "all"]);
const targetTypes = new Set(["user", "circle"]);

function text(value: unknown) {
  return String(value || "").trim();
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Nicht angemeldet" }, { status: 401 });
  const payload = await request.json().catch(() => ({}));
  const channel = text(payload.channel);
  const targetType = text(payload.targetType);
  const targetId = text(payload.targetId);
  const entityType = text(payload.entityType);
  const entityId = text(payload.entityId);
  const title = text(payload.title);
  const href = text(payload.href);
  if (!channels.has(channel)) return NextResponse.json({ ok: false, error: "Kanal fehlt" }, { status: 400 });
  if (!targetTypes.has(targetType) || !targetId) return NextResponse.json({ ok: false, error: "Ziel fehlt" }, { status: 400 });
  if (!entityType || !entityId || !title || !href) return NextResponse.json({ ok: false, error: "Eintrag unvollständig" }, { status: 400 });
  if (!href.startsWith("/") || href.startsWith("//")) return NextResponse.json({ ok: false, error: "Nur interne Links können geteilt werden" }, { status: 400 });
  try {
    const results = await shareItem({
      actor: user,
      channel: channel as "email" | "telegram" | "push" | "all",
      targetType: targetType as "user" | "circle",
      targetId,
      entityType,
      entityId,
      title,
      href,
      text: text(payload.text)
    });
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Teilen fehlgeschlagen" }, { status: 400 });
  }
}
