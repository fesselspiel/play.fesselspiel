import { NextRequest, NextResponse } from "next/server";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { syncShopifyProducts } from "@/lib/shopify";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi", "shopifyBondageSystem");
  if (blocked) return blocked;
  if (auth.user.role !== "ADMIN" && auth.user.role !== "SUPER_ADMIN") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_missing" }, { status: 400 });
  try {
    const result = await syncShopifyProducts(auth.user.tenantId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 });
  }
}
