import { NextRequest, NextResponse } from "next/server";
import { accountDeletionSummary } from "@/lib/compliance/account-deletion";
import { requireApiUser } from "@/lib/external-api";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, { allowUnaccepted: true });
  if ("response" in auth) return auth.response;
  const job = await accountDeletionSummary(auth.user.id);
  return NextResponse.json({ ok: true, job });
}
