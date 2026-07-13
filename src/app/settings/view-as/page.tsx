import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Eye, RotateCcw, UserRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, EmptyState, PageGuide, PageHeader, Panel } from "@/components/ui";
import { logAction, userDisplayName } from "@/lib/audit";
import { createSessionToken, currentSessionContext, requireAdmin, SESSION_COOKIE, sessionCookieOptions, verifySessionToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { primaryTenantDomain } from "@/lib/tenancy";

function currentCookieMaxAge() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) return 60 * 60 * 12;
  return Math.max(60, Math.floor((session.exp - Date.now()) / 1000));
}

async function switchView(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const targetTenantId = String(formData.get("targetTenantId") || "");
  const targetId = String(formData.get("targetUserId") || "");
  const targetTenant = targetTenantId && admin.role === "SUPER_ADMIN"
    ? await prisma.tenant.findUnique({ where: { id: targetTenantId } })
    : null;
  const effectiveTenantId = targetTenant?.id || targetTenantId || admin.tenantId || "";
  const target = targetId
    ? await prisma.user.findFirst({
        where: {
          id: targetId,
          active: true,
          ...(effectiveTenantId ? { memberships: { some: { tenantId: effectiveTenantId, active: true } } } : {})
        },
        include: { profile: true }
      })
    : null;
  if (targetId && !target) redirect("/settings/view-as");
  if (targetTenantId && !targetTenant) redirect("/settings/view-as");
  const viewAsUserId = target && target.id !== admin.id ? target.id : undefined;
  const viewAsTenantId = effectiveTenantId || targetTenant?.id || undefined;
  const token = createSessionToken(admin.id, currentCookieMaxAge() > 60 * 60 * 12, viewAsUserId, viewAsTenantId, admin.sessionRevision);
  cookies().set(SESSION_COOKIE, token, sessionCookieOptions(currentCookieMaxAge()));
  await logAction({
    actorId: admin.id,
    action: "admin_view_as",
    entityType: target ? "user" : "tenant",
    entityId: target?.id || targetTenant?.id || null,
    title: target
      ? `${userDisplayName(admin)} hat die Ansicht von ${userDisplayName(target)} geöffnet`
      : `${userDisplayName(admin)} hat die Seite ${targetTenant?.name || ""} geöffnet`,
    href: "/settings/view-as"
  });
  redirect("/settings/view-as");
}

async function returnToOwnView() {
  "use server";
  const admin = await requireAdmin();
  const token = createSessionToken(admin.id, currentCookieMaxAge() > 60 * 60 * 12, undefined, undefined, admin.sessionRevision);
  cookies().set(SESSION_COOKIE, token, sessionCookieOptions(currentCookieMaxAge()));
  await logAction({
    actorId: admin.id,
    action: "admin_view_own",
    entityType: "user",
    entityId: admin.id,
    title: `${userDisplayName(admin)} ist zur eigenen Ansicht zurückgekehrt`,
    href: "/settings/view-as"
  });
  redirect("/settings/view-as");
}

export default async function ViewAsPage() {
  const { actor, user, tenant } = await currentSessionContext();
  if (!actor) redirect("/login");
  if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") redirect("/");

  const tenants = actor.role === "SUPER_ADMIN"
    ? await prisma.tenant.findMany({ include: { domains: true, _count: { select: { memberships: true } } }, orderBy: { name: "asc" } })
    : [];
  const memberships = await prisma.tenantMembership.findMany({
    where: {
      active: true,
      tenantId: tenant?.id || actor.tenantId || "",
      user: { active: true }
    },
    include: { circle: true, tenant: true, user: { include: { profile: true } } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }]
  });
  const users = memberships.map((membership) => ({
    ...membership.user,
    tenantId: membership.tenantId,
    tenant: membership.tenant,
    circleId: membership.circleId,
    circle: membership.circle,
    role: membership.user.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : membership.role
  }));
  const viewingOtherUser = Boolean(user && user.id !== actor.id);
  const activeTenantDomain = tenant ? primaryTenantDomain(tenant) : "";

  return (
    <AppShell>
      <PageHeader title="Ansicht wechseln" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel>
          <div className="mb-5 flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink">Aktive Ansicht</h2>
              <p className="mt-1 text-sm text-graphite">
                Eingeloggt als <strong className="text-ink">{userDisplayName(actor)}</strong>
                {tenant ? <> · Seite <strong className="text-ink">{tenant.name}</strong>{activeTenantDomain ? <> · {activeTenantDomain}</> : null}</> : null}
                {viewingOtherUser && user ? <> · Ansicht von <strong className="text-ink">{userDisplayName(user)}</strong></> : <> · eigene Ansicht</>}
              </p>
            </div>
            {viewingOtherUser ? (
              <form action={returnToOwnView}>
                <Button variant="secondary"><RotateCcw className="h-4 w-4" /> Eigene Ansicht</Button>
              </form>
            ) : null}
          </div>
          {tenants.length ? (
            <div className="mb-6 grid gap-3 sm:grid-cols-2">
              {tenants.map((entry) => {
                const activeTenant = tenant?.id === entry.id && !viewingOtherUser;
                return (
                  <form key={entry.id} action={switchView} className={`rounded-md border p-3 ${activeTenant ? "border-redbrand bg-redbrand/5" : "border-line bg-paper"}`}>
                    <input type="hidden" name="targetTenantId" value={entry.id} />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <strong className="block truncate text-ink">{entry.name}</strong>
                        <span className="block truncate text-sm text-graphite">{entry.domains.find((domain) => domain.primary)?.hostname || entry.domains[0]?.hostname || "Keine Domain"}</span>
                        <span className="block text-xs text-graphite">{entry._count.memberships} Benutzer</span>
                      </div>
                      {activeTenant ? (
                        <Button variant="secondary" type="button">Aktive Seite</Button>
                      ) : (
                        <Button type="submit">Seite öffnen</Button>
                      )}
                    </div>
                  </form>
                );
              })}
            </div>
          ) : null}

          <div className="space-y-3">
            {users.map((entry) => {
              const active = user?.id === entry.id;
              const label = userDisplayName(entry);
              return (
                <form key={entry.id} action={switchView} className={`rounded-md border p-3 ${active ? "border-redbrand bg-redbrand/5" : "border-line bg-paper"}`}>
                  <input type="hidden" name="targetUserId" value={entry.id} />
                  <input type="hidden" name="targetTenantId" value={entry.tenantId || ""} />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      {entry.profile?.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={entry.profile.imageUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-redbrand text-sm font-semibold text-white">{label.slice(0, 1).toUpperCase()}</span>
                      )}
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-ink">{label}</div>
                        <div className="truncate text-sm text-graphite">{entry.username || entry.email}</div>
                        <div className="truncate text-xs text-graphite">{entry.tenant?.name || "Default"} · {entry.circle?.name || "Kein Kreis"} · {entry.role === "SUPER_ADMIN" ? "Superadmin" : entry.role === "ADMIN" ? "Admin" : "Benutzer"}</div>
                      </div>
                    </div>
                    <Button variant={active ? "secondary" : "primary"} className="w-full sm:w-auto" type="submit">
                      {active ? <UserRound className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      {active ? "Aktive Ansicht" : "Diese Ansicht öffnen"}
                    </Button>
                  </div>
                </form>
              );
            })}
            {!users.length ? <EmptyState title="Keine aktiven Benutzer" /> : null}
          </div>
        </Panel>
        <PageGuide title="Admin-Ansicht wechseln">
          Dieser Admin-Menüpunkt ist nur für Administratoren sichtbar. Wenn du eine andere Ansicht öffnest, nutzt die App für Listen, Dashboard und Berechtigungen den ausgewählten Benutzer. Über „Eigene Ansicht“ wechselst du zurück zum echten Admin-Benutzer.
        </PageGuide>
      </div>
    </AppShell>
  );
}
