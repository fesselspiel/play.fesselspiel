import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { acceptLegalDocuments } from "@/lib/compliance/legal";
import { requireApiUser } from "@/lib/external-api";

export const runtime = "nodejs";

const AcceptSchema = z.object({
  documentIds: z.array(z.string().min(1)).min(1).max(8),
  ageConfirmed: z.boolean(),
  country: z.string().trim().min(2).max(2).optional(),
  source: z.string().trim().max(32).optional()
});

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, { allowUnaccepted: true });
  if ("response" in auth) return auth.response;
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 409 });
  const parsed = AcceptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  try {
    const compliance = await acceptLegalDocuments({
      userId: auth.user.id,
      tenantId: auth.user.tenantId,
      ...parsed.data
    });
    return NextResponse.json({ ok: true, compliance });
  } catch (error) {
    const code = error instanceof Error ? error.message : "acceptance_failed";
    const status = code === "age_confirmation_required" ? 400 : code === "invalid_legal_document" ? 404 : 500;
    return NextResponse.json({ ok: false, error: code }, { status });
  }
}
