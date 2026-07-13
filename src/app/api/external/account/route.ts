import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { accountDeletionConfirmation, deleteAccount } from "@/lib/compliance/account-deletion";
import { requireApiUser } from "@/lib/external-api";

export const runtime = "nodejs";

const DeleteSchema = z.object({
  confirmation: z.string().max(80)
});

export async function DELETE(request: NextRequest) {
  const auth = await requireApiUser(request, { allowUnaccepted: true });
  if ("response" in auth) return auth.response;
  const parsed = DeleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({
      ok: false,
      error: "confirmation_required",
      confirmationText: accountDeletionConfirmation
    }, { status: 400 });
  }
  try {
    const result = await deleteAccount({
      userId: auth.user.id,
      tenantId: auth.user.tenantId,
      role: auth.user.role,
      confirmation: parsed.data.confirmation
    });
    if (result.blocked) {
      return NextResponse.json({
        ok: false,
        error: "last_admin",
        message: "Bestimme zuerst einen anderen Admin oder loesche die gesamte Seite.",
        jobId: result.job.id
      }, { status: 409 });
    }
    return NextResponse.json({
      ok: true,
      status: result.job.status,
      jobId: result.job.id,
      cleanupPending: result.cleanupPending,
      completedAt: result.job.completedAt?.toISOString() || null
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "deletion_failed";
    const status = code === "confirmation_mismatch" ? 400 : code === "account_not_found" ? 404 : 500;
    return NextResponse.json({ ok: false, error: code }, { status });
  }
}
