import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Eye, RotateCcw, UserRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, EmptyState, PageGuide, PageHeader, Panel } from "@/components/ui";
import { logAction, userDisplayName } from "@/lib/audit";
import { createSessionToken, currentSessionContext, requireAdmin, SESSION_COOKIE, sessionCookieOptions, verifySessionToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  const target = targetId
    ? await prisma.user.findFirst({
        where: {
          id: targetId,
          active: true,
          ...(admin.role === "SUPER_ADMIN" ? {} : { tenantId: admin.tenantId || undefined })
        },
        include: { profile: true, tenant: true }
      })
    : null;
  if (targetId && !target) redirect("/settings/view-as");
  if (targetTenantId && !targetTenant) redirect("/settings/view-as");
  const viewAsUserId = target && target.id !== admin.id ? target.id : undefined;
  const viewAsTenantId = target?.tenantId || targetTenant?.id || undefined;
  const token = createSessionToken(admin.id, currentCookieMaxAge() > 60 * 60 * 12, viewAsUserId, viewAsTenantId);
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
  const token = createSessionToken(admin.id, currentCookieMaxAge() > 60 * 60 * 12);
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
    ? await prisma.tenant.findMany({ include: { domains: true, _count: { select: { users: true } } }, orderBy: { name: "asc" } })
    : [];
  const users = await prisma.user.findMany({
    where: {
      active: true,
      ...(actor.role === "SUPER_ADMIN" ? (tenant?.id ? { tenantId: tenant.id } : {}) : { tenantId: actor.tenantId || undefined })
    },
    include: { profile: true, circle: true, tenant: true },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }]
  });
  const viewingOtherUser = Boolean(user && user.id !== actor.id);

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
                {tenant ? <> · Seite <strong className="text-ink">{tenant.name}</strong></> : null}
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
              {tenants.map((entry) => (
                <form key={entry.id} action={switchView} className={`rounded-md border p-3 ${tenant?.id === entry.id && !viewingOtherUser ? "border-redbrand bg-redbrand/5" : "border-line bg-paper"}`}>
                  <input type="hidden" name="targetTenantId" value={entry.id} />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <strong className="block truncate text-ink">{entry.name}</strong>
                      <span className="block truncate text-sm text-graphite">{entry.domains.find((domain) => domain.primary)?.hostname || entry.domains[0]?.hostname || "Keine Domain"}</span>
                      <span className="block text-xs text-graphite">{entry._count.users} Benutzer</span>
                    </div>
                    <Button variant={tenant?.id === entry.id && !viewingOtherUser ? "secondary" : "primary"} type="submit">Seite öffnen</Button>
                  </div>
                </form>
              ))}
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
