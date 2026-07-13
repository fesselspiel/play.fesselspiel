import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/external-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const UpdateSchema = z.object({
  status: z.enum(["OPEN", "IN_REVIEW", "ESCALATED", "RESOLVED", "DISMISSED"]),
  action: z.enum(["NONE", "HIDE_CONTENT", "DELETE_CONTENT", "WARN_USER", "SUSPEND_USER", "DEACTIVATE_USER", "REMOVE_CIRCLE_ACCESS", "ESCALATE_SAFETY_LEGAL"]).optional(),
  moderationNote: z.string().trim().max(2000).optional()
});

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  if (auth.user.role !== "ADMIN" && auth.user.role !== "SUPER_ADMIN") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 409 });
  const parsed = UpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  const report = await prisma.contentReport.findFirst({ where: { id: context.params.id, tenantId: auth.user.tenantId } });
  if (!report) return NextResponse.json({ ok: false, error: "report_not_found" }, { status: 404 });
  const action = parsed.data.action || report.action || "NONE";

  await prisma.$transaction(async (tx) => {
    if (action === "HIDE_CONTENT" || action === "DELETE_CONTENT") {
      await tx.moderatedContent.upsert({
        where: { tenantId_entityType_entityId: { tenantId: auth.user.tenantId!, entityType: report.entityType, entityId: report.entityId } },
        update: { hidden: true, reason: report.reason, reportId: report.id, moderatorId: auth.user.id },
        create: { tenantId: auth.user.tenantId!, entityType: report.entityType, entityId: report.entityId, hidden: true, reason: report.reason, reportId: report.id, moderatorId: auth.user.id }
      });
      if (report.entityType === "circleChatMessage") {
        await tx.circleChatMessage.updateMany({ where: { id: report.entityId, tenantId: auth.user.tenantId! }, data: { deletedAt: new Date() } });
      }
      if (report.entityType === "media") {
        await tx.media.updateMany({ where: { id: report.entityId, tenantId: auth.user.tenantId! }, data: { contentClassification: "QUARANTINED" } });
      }
    }
    if ((action === "SUSPEND_USER" || action === "DEACTIVATE_USER") && report.reportedUserId) {
      await tx.user.updateMany({ where: { id: report.reportedUserId }, data: { active: false, sessionRevision: { increment: 1 }, rememberTokenHash: null } });
      await tx.apiToken.updateMany({ where: { userId: report.reportedUserId }, data: { active: false } });
      await tx.nativePushDevice.updateMany({ where: { userId: report.reportedUserId }, data: { disabledAt: new Date() } });
    }
    if (action === "REMOVE_CIRCLE_ACCESS" && report.reportedUserId) {
      await tx.tenantMembership.updateMany({ where: { tenantId: auth.user.tenantId!, userId: report.reportedUserId }, data: { circleId: null } });
      await tx.user.updateMany({ where: { id: report.reportedUserId, tenantId: auth.user.tenantId! }, data: { circleId: null } });
    }
    await tx.contentReport.update({
      where: { id: report.id },
      data: {
        status: parsed.data.status,
        action,
        moderationNote: parsed.data.moderationNote || null,
        moderatorId: auth.user.id,
        resolvedAt: parsed.data.status === "RESOLVED" || parsed.data.status === "DISMISSED" ? new Date() : null
      }
    });
  });
  return NextResponse.json({ ok: true });
}
