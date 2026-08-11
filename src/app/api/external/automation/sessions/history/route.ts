import { NextRequest, NextResponse } from "next/server";
import { ownerScope } from "@/lib/access";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { serializeAutomationSession } from "@/lib/external-automation-serializers";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers");
  if (blocked) return blocked;
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 });

  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 25)));
  const trackerTypeId = url.searchParams.get("trackerTypeId");
  const state = url.searchParams.get("state");
  const includeActive = url.searchParams.get("includeActive") === "true";
  const items = await prisma.automationSession.findMany({
    where: {
      ...(await ownerScope(auth.user)),
      ...(trackerTypeId ? { trackerTypeId } : {}),
      ...(state ? { state } : includeActive ? {} : { state: { notIn: ["RUNNING", "PENDING_END"] } })
    },
    include: {
      trackerType: true,
      trackerEntry: true,
      actions: {
        include: {
          device: true,
          capability: { include: { device: { select: { name: true } } } }
        },
        orderBy: { createdAt: "desc" },
        take: 20
      },
      events: {
        include: {
          actor: { include: { profile: true } },
          device: true,
          capability: { include: { device: { select: { name: true } } } }
        },
        orderBy: { createdAt: "desc" },
        take: 30
      },
      imageRequests: {
        include: {
          file: true,
          device: true,
          capability: { include: { device: { select: { name: true } } } },
          requester: { include: { profile: true } }
        },
        orderBy: { requestedAt: "desc" }
      }
    },
    orderBy: { createdAt: "desc" },
    take: limit
  });

  return NextResponse.json({
    ok: true,
    count: items.length,
    items: items.map((item) => serializeAutomationSession(request, item))
  });
}
