import { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { requireCircleChatScope, serializeCircleChatMessage } from "@/lib/circle-chat";
import { featureEnabled } from "@/lib/feature-utils";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function event(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return new Response("Nicht angemeldet", { status: 401 });
  if (!featureEnabled(user.tenant?.features, "circleChat")) return new Response("Feature deaktiviert", { status: 403 });
  const scope = await requireCircleChatScope(user).catch(() => null);
  if (!scope) return new Response("Kein Zirkel für den Chat zugeordnet", { status: 403 });
  const encoder = new TextEncoder();
  let lastSeen = request.nextUrl.searchParams.get("after") || new Date(Date.now() - 30_000).toISOString();
  let closed = false;
  request.signal.addEventListener("abort", () => {
    closed = true;
  });

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(event({ ok: true, type: "connected" })));
      while (!closed) {
        const messages = await prisma.circleChatMessage.findMany({
          where: {
            tenantId: scope.tenantId,
            circleId: scope.circleId,
            deletedAt: null,
            createdAt: { gt: new Date(lastSeen) }
          },
          include: { sender: { include: { profile: true } }, file: true, receipts: { include: { user: { include: { profile: true } } } } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 50
        });
        if (messages.length) {
          lastSeen = messages[messages.length - 1].createdAt.toISOString();
          controller.enqueue(encoder.encode(event({
            ok: true,
            type: "messages",
            items: messages.map((message) => serializeCircleChatMessage(message, user.id, user.role))
          })));
        } else {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      controller.close();
    },
    cancel() {
      closed = true;
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
