import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { absolutePathForAsset, fileAssetForAccess } from "@/lib/files";

export const runtime = "nodejs";

export async function GET(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await currentUser();
  if (!user) return new NextResponse("Nicht angemeldet", { status: 401 });
  const asset = await fileAssetForAccess(user, params.id);
  if (!asset) return new NextResponse("Nicht gefunden", { status: 404 });

  try {
    const file = await readFile(absolutePathForAsset(asset.storagePath));
    return new NextResponse(file, {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(asset.sizeBytes),
        "Content-Disposition": `inline; filename="${encodeURIComponent(asset.originalName)}"`,
        "Cache-Control": "private, max-age=60"
      }
    });
  } catch {
    return new NextResponse("Datei fehlt", { status: 404 });
  }
}
