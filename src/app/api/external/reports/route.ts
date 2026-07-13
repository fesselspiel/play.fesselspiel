import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveReportTarget } from "@/lib/compliance/ugc";
import { requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const ReportSchema = z.object({
  entityType: z.string().trim().min(1).max(64),
  entityId: z.string().trim().min(1).max(128),
  reason: z.enum(["NUDITY_OR_EXPLICIT", "NON_CONSENSUAL", "HARASSMENT_OR_THREAT", "MINOR_SAFETY", "VIOLENCE_OR_DANGER", "ILLEGAL_CONTENT", "SHARED_WITHOUT_CONSENT", "SPAM", "COPYRIGHT", "OTHER"]),
  details: z.string().trim().max(1000).optional()
});

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 409 });
  const parsed = ReportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  const target = await resolveReportTarget({ user: auth.user, entityType: parsed.data.entityType, entityId: parsed.data.entityId });
  if (!target) return NextResponse.json({ ok: false, error: "content_not_found" }, { status: 404 });
  if (target.reportedUserId === auth.user.id) return NextResponse.json({ ok: false, error: "own_content" }, { status: 400 });
  const priority = parsed.data.reason === "MINOR_SAFETY" || parsed.data.reason === "NON_CONSENSUAL" || parsed.data.reason === "ILLEGAL_CONTENT" ? "URGENT" : "NORMAL";
  const report = await prisma.contentReport.create({
    data: {
      tenantId: auth.user.tenantId,
      reporterId: auth.user.id,
      reportedUserId: target.reportedUserId,
      entityType: target.entityType,
      entityId: target.entityId,
      reason: parsed.data.reason,
      details: parsed.data.details || null,
      priority
    }
  });
  return NextResponse.json({ ok: true, report: { id: report.id, status: report.status, priority, createdAt: report.createdAt.toISOString() } });
}
