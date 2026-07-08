import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { shareItem } from "@/lib/share";

export const runtime = "nodejs";

const channels = new Set(["email", "telegram", "push", "all"]);
const targetTypes = new Set(["user", "circle"]);

function text(value: unknown) {
  return String(value || "").trim();
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  const payload = await request.json().catch(() => ({}));
  const channel = text(payload.channel || "all");
  const targetType = text(payload.targetType);
  const targetId = text(payload.targetId);
  const entityType = text(payload.entityType);
  const entityId = text(payload.entityId);
  const title = text(payload.title);
  const href = text(payload.href);
  if (!channels.has(channel)) return NextResponse.json({ ok: false, error: "channel_invalid" }, { status: 400 });
  if (!targetTypes.has(targetType) || !targetId) return NextResponse.json({ ok: false, error: "target_required" }, { status: 400 });
  if (!entityType || !entityId || !title || !href) return NextResponse.json({ ok: false, error: "item_incomplete" }, { status: 400 });
  if (!href.startsWith("/") || href.startsWith("//")) return NextResponse.json({ ok: false, error: "href_must_be_internal" }, { status: 400 });
  try {
    const results = await shareItem({
      actor: auth.user,
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
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "share_failed" }, { status: 400 });
  }
}
