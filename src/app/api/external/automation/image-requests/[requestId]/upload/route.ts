import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { serializeAutomationImageRequest } from "@/lib/external-automation-serializers";
import { prisma } from "@/lib/prisma";
import { attachAutomationImage } from "@/lib/session-automation";

export const runtime = "nodejs";

export async function POST(request: NextRequest, props: { params: Promise<{ requestId: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request, { allowUnaccepted: true });
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "trackers");
  if (blocked) return blocked;
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    const item = await attachAutomationImage({
      tenantId: auth.user.tenantId,
      requestId: params.requestId,
      ownerId: auth.user.id,
      bytes,
      originalName: file.name || `${params.requestId}.jpg`,
      mimeType: file.type || "application/octet-stream",
      metadata: Object.fromEntries([...form.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    });
    const full = await prisma.automationImageRequest.findUnique({
      where: { id: item.id },
      include: {
        file: true,
        device: true,
        capability: { include: { device: { select: { name: true } } } },
        requester: { include: { profile: true } }
      }
    });
    return NextResponse.json({ ok: true, item: full ? serializeAutomationImageRequest(request, full) : serializeAutomationImageRequest(request, item) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "image_upload_failed" }, { status: 400 });
  }
}
