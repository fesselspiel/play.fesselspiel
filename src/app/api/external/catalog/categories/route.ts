import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { featureEnabled } from "@/lib/features";
import { catalogCategories, type CatalogCategoryKind } from "@/lib/catalog-categories";

export const runtime = "nodejs";

function requestedKinds(value: string | null, features: { key: string; enabled: boolean }[] | undefined) {
  const raw = String(value || "all").trim().toLowerCase();
  const kinds: CatalogCategoryKind[] = raw === "toy" || raw === "toys"
    ? ["toy"]
    : raw === "position" || raw === "positions" || raw === "scenes" || raw === "szenen"
      ? ["position"]
      : ["toy", "position"];
  return kinds.filter((kind) => kind === "toy" ? featureEnabled(features, "toys") : featureEnabled(features, "positions"));
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;

  const kinds = requestedKinds(request.nextUrl.searchParams.get("kind"), auth.user.tenant?.features);
  const groups = await Promise.all(kinds.map(async (kind) => ({
    kind,
    categories: (await catalogCategories(kind, auth.user.tenantId)).map((category) => ({
      id: category.id,
      kind: category.kind,
      name: category.name,
      sortOrder: category.sortOrder,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString()
    }))
  })));

  return NextResponse.json({
    ok: true,
    tenantId: auth.user.tenantId,
    kinds,
    categories: groups.flatMap((group) => group.categories),
    groups
  });
}
