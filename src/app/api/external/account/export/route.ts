import { NextRequest, NextResponse } from "next/server";
import { buildPersonalDataExport } from "@/lib/data-transfer";
import { requireApiUser } from "@/lib/external-api";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, { allowUnaccepted: true, ignoreViewContext: true });
  if ("response" in auth) return auth.response;
  const archive = await buildPersonalDataExport(auth.user);
  await logAction({
    actorId: auth.user.id,
    action: "personal_data_exported",
    entityType: "user",
    entityId: auth.user.id,
    title: "Persoenliche Daten exportiert"
  });
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(archive, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="playplaner-daten-${date}.zip"`,
      "Cache-Control": "no-store"
    }
  });
}
