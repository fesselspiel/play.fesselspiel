import { NextRequest, NextResponse } from "next/server";
import { logAction } from "@/lib/audit";
import { apiFeatureGate, requireApiUser } from "@/lib/external-api";
import { notificationActionOptions } from "@/lib/notification-actions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function isAdmin(user: { role?: string | null }) {
  return user.role === "ADMIN" || user.role === "SUPER_ADMIN";
}

function cleanAction(value: unknown) {
  return String(value || "").trim().slice(0, 160);
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  if (!isAdmin(auth.user)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 });
  const [rules, auditActions] = await Promise.all([
    prisma.pointRule.findMany({ where: { tenantId: auth.user.tenantId }, orderBy: { action: "asc" } }),
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { createdAt: "desc" }, take: 500 })
  ]);
  const actions = await notificationActionOptions({
    tenantId: auth.user.tenantId,
    auditActions: [...auditActions.map((entry) => entry.action), ...rules.map((rule) => rule.action)]
  });
  const ruleByAction = new Map(rules.map((rule) => [rule.action, rule]));
  return NextResponse.json({
    ok: true,
    rules: actions.map((option) => {
      const rule = ruleByAction.get(option.action);
      return {
        action: option.action,
        label: option.label,
        points: rule?.points || 0,
        active: rule?.active ?? true,
        configured: Boolean(rule)
      };
    })
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;
  const blocked = apiFeatureGate(auth.user, "externalApi");
  if (blocked) return blocked;
  if (!isAdmin(auth.user)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (!auth.user.tenantId) return NextResponse.json({ ok: false, error: "tenant_required" }, { status: 400 });
  const body = await request.json().catch(() => ({})) as { action?: unknown; points?: unknown; active?: unknown };
  const action = cleanAction(body.action);
  if (!action) return NextResponse.json({ ok: false, error: "action_required" }, { status: 400 });
  const points = Math.max(-10000, Math.min(10000, Number(body.points || 0)));
  const active = body.active !== false;
  const rule = await prisma.pointRule.upsert({
    where: { tenantId_action: { tenantId: auth.user.tenantId, action } },
    update: { points, active },
    create: { tenantId: auth.user.tenantId, action, points, active }
  });
  await logAction({
    actorId: auth.user.id,
    action: "point_rule_updated_api",
    entityType: "pointRule",
    entityId: rule.id,
    title: `Punkteregel per API geändert: ${action}`,
    href: "/settings/points",
    details: { action, points, active }
  });
  return NextResponse.json({
    ok: true,
    rule: { id: rule.id, action: rule.action, points: rule.points, active: rule.active }
  });
}
