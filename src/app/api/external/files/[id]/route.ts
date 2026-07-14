import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { absolutePathForAsset, fileAssetForAccess } from "@/lib/files";

export const runtime = "nodejs";

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;

  const asset = await fileAssetForAccess(auth.user, params.id);
  if (!asset) return new NextResponse("Nicht gefunden", { status: 404 });

  try {
    const file = await readFile(absolutePathForAsset(asset.storagePath));
    return new NextResponse(file, {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(asset.sizeBytes),
        "Content-Disposition": `inline; filename="${encodeURIComponent(asset.originalName)}"`,
        "Cache-Control": "private, max-age=300"
      }
    });
  } catch {
    return new NextResponse("Datei fehlt", { status: 404 });
  }
}
