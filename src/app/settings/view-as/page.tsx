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
  const targetId = String(formData.get("targetUserId") || "");
  const target = await prisma.user.findFirst({ where: { id: targetId, active: true }, include: { profile: true } });
  if (!target) redirect("/settings/view-as");
  const viewAsUserId = target.id === admin.id ? undefined : target.id;
  const token = createSessionToken(admin.id, currentCookieMaxAge() > 60 * 60 * 12, viewAsUserId);
  cookies().set(SESSION_COOKIE, token, sessionCookieOptions(currentCookieMaxAge()));
  await logAction({
    actorId: admin.id,
    action: "admin_view_as",
    entityType: "user",
    entityId: target.id,
    title: `${userDisplayName(admin)} hat die Ansicht von ${userDisplayName(target)} geöffnet`,
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
  const { actor, user } = await currentSessionContext();
  if (!actor) redirect("/login");
  if (actor.role !== "ADMIN") redirect("/");

  const users = await prisma.user.findMany({
    where: { active: true },
    include: { profile: true, circle: true },
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
                {viewingOtherUser && user ? <> · Ansicht von <strong className="text-ink">{userDisplayName(user)}</strong></> : <> · eigene Ansicht</>}
              </p>
            </div>
            {viewingOtherUser ? (
              <form action={returnToOwnView}>
                <Button variant="secondary"><RotateCcw className="h-4 w-4" /> Eigene Ansicht</Button>
              </form>
            ) : null}
          </div>

          <div className="space-y-3">
            {users.map((entry) => {
              const active = user?.id === entry.id;
              const label = userDisplayName(entry);
              return (
                <form key={entry.id} action={switchView} className={`rounded-md border p-3 ${active ? "border-redbrand bg-redbrand/5" : "border-line bg-paper"}`}>
                  <input type="hidden" name="targetUserId" value={entry.id} />
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
                        <div className="truncate text-xs text-graphite">{entry.circle?.name || "Kein Kreis"} · {entry.role === "ADMIN" ? "Admin" : "Benutzer"}</div>
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
