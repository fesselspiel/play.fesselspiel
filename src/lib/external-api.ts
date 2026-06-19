import { NextRequest, NextResponse } from "next/server";
import { userFromApiToken } from "@/lib/api-tokens";

export async function requireApiUser(request: NextRequest | Request) {
  const auth = await userFromApiToken(request);
  if (!auth) return { response: NextResponse.json({ ok: false, error: "Ungueltiger oder fehlender API Token" }, { status: 401 }) };
  return { user: auth.user };
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
