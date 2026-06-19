import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { buildDataExport, importDataArchive } from "@/lib/data-transfer";

export const runtime = "nodejs";

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

export async function GET() {
  const user = await currentUser();
  if (!user) return new NextResponse("Nicht angemeldet", { status: 401 });
  const zip = await buildDataExport(user);
  return new NextResponse(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="fesselspiel-export-${stamp()}.zip"`,
      "Cache-Control": "private, no-store"
    }
  });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  const formData = await request.formData();
  const file = formData.get("archive") as File | null;
  if (!file || file.size === 0) {
    return NextResponse.redirect(new URL("/settings/data?error=missing", request.url));
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const summary = await importDataArchive(user, bytes);
    const target = new URL("/settings/data", request.url);
    target.searchParams.set("imported", "1");
    target.searchParams.set("files", String(summary.files));
    target.searchParams.set("media", String(summary.media));
    target.searchParams.set("toys", String(summary.toys));
    target.searchParams.set("positions", String(summary.positions));
    return NextResponse.redirect(target);
  } catch (error) {
    const target = new URL("/settings/data", request.url);
    target.searchParams.set("error", (error as Error).message || "import");
    return NextResponse.redirect(target);
  }
}
