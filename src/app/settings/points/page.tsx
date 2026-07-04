import Link from "next/link";
import { redirect } from "next/navigation";
import { Save, Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Field, inputClass, PageGuide, PageHeader, Panel } from "@/components/ui";
import { logAction, userDisplayName } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { notificationActionOptions } from "@/lib/notification-actions";
import { prisma } from "@/lib/prisma";
import { tenantPointTotals } from "@/lib/points";
import { currentTenant } from "@/lib/tenancy";

async function savePointRules(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/");
  const tenant = await currentTenant();
  if (!tenant) redirect("/");
  const actions = formData.getAll("actions").map(String).filter(Boolean);
  await prisma.$transaction(actions.map((action) => {
    const points = Math.max(-10000, Math.min(10000, Number(formData.get(`points:${action}`) || 0)));
    const active = formData.get(`active:${action}`) === "on";
    return prisma.pointRule.upsert({
      where: { tenantId_action: { tenantId: tenant.id, action } },
      update: { points, active },
      create: { tenantId: tenant.id, action, points, active }
    });
  }));
  await logAction({
    actorId: user.id,
    action: "point_rules_updated",
    entityType: "pointRule",
    title: "Punkteregeln aktualisiert",
    href: "/settings/points",
    details: { count: actions.length }
  });
  redirect("/settings/points?saved=1");
}

export default async function PointsSettingsPage({ searchParams }: { searchParams?: { saved?: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/");
  const tenant = await currentTenant();
  if (!tenant) redirect("/");

  const [existingActions, pointRules, totals, memberships, recentEntries] = await Promise.all([
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.pointRule.findMany({ where: { tenantId: tenant.id }, orderBy: { action: "asc" } }),
    tenantPointTotals(tenant.id),
    prisma.tenantMembership.findMany({
      where: { tenantId: tenant.id, active: true, user: { active: true } },
      include: { user: { include: { profile: true } } },
      orderBy: [{ user: { name: "asc" } }, { user: { username: "asc" } }]
    }),
    prisma.pointEntry.findMany({
      where: { tenantId: tenant.id },
      include: { user: { include: { profile: true } }, auditLog: true },
      orderBy: { createdAt: "desc" },
      take: 30
    })
  ]);
  const actionOptions = await notificationActionOptions({
    tenantId: tenant.id,
    auditActions: [...existingActions.map((entry) => entry.action), ...pointRules.map((rule) => rule.action)]
  });
  const ruleByAction = new Map(pointRules.map((rule) => [rule.action, rule]));
  const totalsByUser = new Map(totals.map((entry) => [entry.userId, entry]));
  const leaderboard = memberships.map((membership) => ({
    user: membership.user,
    points: totalsByUser.get(membership.userId)?.points || 0,
    entries: totalsByUser.get(membership.userId)?.entries || 0
  })).sort((a, b) => b.points - a.points || userDisplayName(a.user).localeCompare(userDisplayName(b.user)));
  const activeRules = pointRules.filter((rule) => rule.active && rule.points !== 0).length;

  return (
    <AppShell>
      <PageHeader title="Punkte" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel>
          <div className="flex items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-redbrand text-white">
              <Trophy className="h-6 w-6" />
            </span>
            <div>
              <div className="text-2xl font-semibold text-ink">{activeRules}</div>
              <div className="text-sm text-graphite">aktive Punkteregeln</div>
            </div>
          </div>
        </Panel>
        <Panel>
          <div className="text-2xl font-semibold text-ink">{leaderboard.reduce((sum, entry) => sum + entry.points, 0)}</div>
          <div className="text-sm text-graphite">Punkte auf dieser Seite</div>
        </Panel>
        <Panel>
          <div className="text-2xl font-semibold text-ink">{recentEntries.length}</div>
          <div className="text-sm text-graphite">letzte Buchungen geladen</div>
        </Panel>
      </div>

      {searchParams?.saved ? (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          Punkteregeln gespeichert.
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel>
          <h2 className="text-lg font-semibold text-ink">Punkte pro Aktion</h2>
          <p className="mt-2 text-sm leading-6 text-graphite">
            Jede protokollierte Aktion kann Punkte geben oder abziehen. Sobald eine Aktion im Protokoll entsteht, bucht das System die Punkte automatisch für den auslösenden Benutzer.
          </p>
          <form action={savePointRules} className="mt-5 space-y-3">
            <div className="grid gap-3">
              {actionOptions.map((option) => {
                const rule = ruleByAction.get(option.action);
                return (
                  <div key={option.action} className="grid gap-3 rounded-md border border-line bg-paper p-3 sm:grid-cols-[minmax(0,1fr)_120px_120px] sm:items-center">
                    <input type="hidden" name="actions" value={option.action} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink">{option.label}</div>
                      <div className="truncate font-mono text-xs text-graphite">{option.action}</div>
                    </div>
                    <Field label="Punkte">
                      <input className={inputClass} name={`points:${option.action}`} type="number" min="-10000" max="10000" step="1" defaultValue={rule?.points || 0} />
                    </Field>
                    <label className="flex min-h-10 items-center gap-2 rounded-md bg-surface px-3 text-sm font-semibold text-ink">
                      <input name={`active:${option.action}`} type="checkbox" defaultChecked={rule?.active ?? true} className="h-4 w-4 accent-redbrand" />
                      Aktiv
                    </label>
                  </div>
                );
              })}
            </div>
            <SubmitButton pendingLabel="Punkte werden gespeichert...">
              <Save className="h-4 w-4" />
              Punkteregeln speichern
            </SubmitButton>
          </form>
        </Panel>

        <div className="space-y-6">
          <Panel>
            <h2 className="text-lg font-semibold text-ink">Benutzerpunkte</h2>
            <div className="mt-4 space-y-3">
              {leaderboard.map((entry, index) => (
                <div key={entry.user.id} className="flex items-center justify-between gap-3 rounded-md bg-paper p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">{index + 1}. {userDisplayName(entry.user)}</div>
                    <div className="text-xs text-graphite">{entry.entries} Buchung{entry.entries === 1 ? "" : "en"}</div>
                  </div>
                  <Badge tone={entry.points > 0 ? "green" : entry.points < 0 ? "red" : "neutral"}>{entry.points} Punkte</Badge>
                </div>
              ))}
              {!leaderboard.length ? <p className="text-sm text-graphite">Noch keine aktiven Benutzer auf dieser Seite.</p> : null}
            </div>
          </Panel>

          <Panel>
            <h2 className="text-lg font-semibold text-ink">Letzte Buchungen</h2>
            <div className="mt-4 space-y-3">
              {recentEntries.map((entry) => (
                <div key={entry.id} className="rounded-md bg-paper p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-ink">{userDisplayName(entry.user)}</span>
                    <Badge tone={entry.points >= 0 ? "green" : "red"}>{entry.points > 0 ? "+" : ""}{entry.points}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-graphite">{formatDateTime(entry.createdAt)}</div>
                  <div className="mt-1 truncate text-xs text-graphite">{entry.note || entry.action}</div>
                  {entry.auditLog?.href ? <Link href={entry.auditLog.href} className="mt-1 inline-block text-xs font-semibold text-redbrand">Aktion öffnen</Link> : null}
                </div>
              ))}
              {!recentEntries.length ? <p className="text-sm text-graphite">Noch keine Punkte gebucht.</p> : null}
            </div>
          </Panel>
        </div>
      </div>

      <PageGuide title="Punktesystem">
        Admins definieren hier, welche Aktion wie viele Punkte wert ist. Die Buchung passiert automatisch über das Protokollsystem und gilt nur für die aktuelle Seite.
      </PageGuide>
    </AppShell>
  );
}
