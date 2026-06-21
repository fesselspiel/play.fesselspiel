import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { buildDataExport, importDataArchive } from "@/lib/data-transfer";
import { featureEnabled } from "@/lib/features";

export const runtime = "nodejs";

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

export async function GET() {
  const user = await currentUser();
  if (!user) return new NextResponse("Nicht angemeldet", { status: 401 });
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") return new NextResponse("Nicht berechtigt", { status: 403 });
  if (!featureEnabled(user.tenant?.features, "dataTransfer")) return new NextResponse("Feature nicht aktiv", { status: 403 });
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
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") return NextResponse.redirect(new URL("/", request.url));
  if (!featureEnabled(user.tenant?.features, "dataTransfer")) return NextResponse.redirect(new URL("/feature-disabled?feature=dataTransfer", request.url));
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
