import { NextRequest, NextResponse } from "next/server";
import { userFromApiToken } from "@/lib/api-tokens";
import { featureEnabled } from "@/lib/features";
import { complianceStatusForUser } from "@/lib/compliance/legal";

export async function requireApiUser(request: NextRequest | Request, options: { ignoreViewContext?: boolean; allowUnaccepted?: boolean } = {}) {
  const auth = await userFromApiToken(request, options);
  if (!auth) return { response: NextResponse.json({ ok: false, error: "Ungültiger oder fehlender API Token" }, { status: 401 }) };
  if (!options.allowUnaccepted) {
    const compliance = await complianceStatusForUser(auth.user.id, auth.user.tenantId);
    if (!compliance.accessGranted) {
      return {
        response: NextResponse.json({
          ok: false,
          error: "legal_acceptance_required",
          compliance
        }, { status: 428 })
      };
    }
  }
  return { user: auth.user };
}

export function apiFeatureGate(user: { tenant?: { features?: { key: string; enabled: boolean }[] } | null }, ...features: string[]) {
  for (const feature of features) {
    if (!featureEnabled(user.tenant?.features, feature)) {
      return NextResponse.json({ ok: false, error: "feature_disabled", feature }, { status: 403 });
    }
  }
  return null;
}

export async function requestValues(request: NextRequest) {
  const values = new Map<string, string>();
  const url = new URL(request.url);
  url.searchParams.forEach((value, key) => values.set(key, value));
  if (request.method !== "GET") {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({})) as Record<string, unknown>;
      Object.entries(body).forEach(([key, value]) => values.set(key, String(value ?? "")));
    } else if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      form.forEach((value, key) => {
        if (typeof value === "string") values.set(key, value);
      });
    }
  }
  return values;
}

export function dateFromValue(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]) {
  return value && (allowed as readonly string[]).includes(value) ? value as T : null;
}
