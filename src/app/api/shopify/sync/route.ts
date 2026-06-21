import { NextResponse } from "next/server";
import { currentSessionContext } from "@/lib/auth";
import { featureEnabled } from "@/lib/features";
import { syncShopifyProducts } from "@/lib/shopify";

export const runtime = "nodejs";

export async function POST() {
  const { actor, tenant } = await currentSessionContext();
  if (!actor) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!tenant) return NextResponse.json({ ok: false, error: "tenant_missing" }, { status: 400 });
  if (!featureEnabled(tenant.features, "shopifyBondageSystem")) {
    return NextResponse.json({ ok: false, error: "feature_disabled", feature: "shopifyBondageSystem" }, { status: 403 });
  }
  try {
    const result = await syncShopifyProducts(tenant.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 400 });
  }
}
