import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/external-api";
import { fileAssetUrl, saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const formData = await request.formData();
  const asset = await saveUploadedFile(auth.user.id, formData.get("file") as File | null);
  if (!asset) return NextResponse.json({ ok: false, error: "Keine Datei erhalten" }, { status: 400 });
  const url = fileAssetUrl(asset.id);
  const media = await prisma.media.create({
    data: {
      ownerId: auth.user.id,
      title: String(formData.get("title") || asset.originalName || "API Upload").trim(),
      kind: asset.mimeType.startsWith("video/") ? "VIDEO" : "IMAGE",
      url,
      visibility: String(formData.get("visibility") || "PRIVATE") as "PRIVATE" | "PARTNER" | "SHARED"
    }
  });
  return NextResponse.json({
    ok: true,
    media,
    file: {
      id: asset.id,
      url,
      originalName: asset.originalName,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes
    }
  });
}
