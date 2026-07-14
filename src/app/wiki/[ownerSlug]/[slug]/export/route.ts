import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { wikiExportText, wikiOwnerBySlug, wikiPageAccessWhere } from "@/lib/wiki";

export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ ownerSlug: string; slug: string }> }
) {
  const params = await props.params;
  const user = await currentUser();
  if (!user) return new NextResponse("Nicht angemeldet", { status: 401 });
  const owner = await wikiOwnerBySlug(params.ownerSlug, user);
  if (!owner) return new NextResponse("Nicht gefunden", { status: 404 });
  const page = await prisma.wikiPage.findFirst({
    where: { AND: [await wikiPageAccessWhere(user), { ownerId: owner.id, slug: params.slug }] }
  });
  if (!page) return new NextResponse("Nicht gefunden", { status: 404 });
  return new NextResponse(wikiExportText(page), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${page.slug}.wiki"`
    }
  });
}
