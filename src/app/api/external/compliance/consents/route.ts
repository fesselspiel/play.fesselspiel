import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { complianceStatusForUser, setConsentPreference } from "@/lib/compliance/legal";
import { requireApiUser } from "@/lib/external-api";

export const runtime = "nodejs";

const ConsentSchema = z.object({
  kind: z.enum(["TELEGRAM", "OPENAI", "PUSH", "ANALYTICS"]),
  granted: z.boolean(),
  version: z.string().trim().min(1).max(64),
  source: z.string().trim().max(32).optional()
});

export async function PATCH(request: NextRequest) {
  const auth = await requireApiUser(request, { allowUnaccepted: true });
  if ("response" in auth) return auth.response;
  const parsed = ConsentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  await setConsentPreference({ userId: auth.user.id, ...parsed.data });
  const compliance = await complianceStatusForUser(auth.user.id, auth.user.tenantId);
  return NextResponse.json({ ok: true, compliance });
}
