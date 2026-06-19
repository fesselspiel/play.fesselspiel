import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { UserPlus, UsersRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, Button, Field, inputClass, PageGuide, PageHeader, Panel, selectClass } from "@/components/ui";
import { currentUser, requireAdmin } from "@/lib/auth";
import { appTimeZone, formatDateTime } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

async function createUser(formData: FormData) {
  "use server";
  await requireAdmin();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const username = String(formData.get("username") || "").trim() || null;
  const password = String(formData.get("password") || "");
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      username,
      name: String(formData.get("name") || "").trim(),
      passwordHash,
      role: String(formData.get("role") || "USER") as "ADMIN" | "USER",
      circleId: String(formData.get("circleId") || "") || null,
      active: true,
      profile: { create: { displayName: String(formData.get("name") || "").trim() } },
      settings: { create: {} }
    }
  });
  redirect(`/settings/users#user-${user.id}`);
}

async function createCircle(formData: FormData) {
  "use server";
  await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  if (name) await prisma.circle.upsert({ where: { name }, update: {}, create: { name } });
  redirect("/settings/users");
}

async function updateCircle(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const memberIds = formData.getAll("memberIds").map(String).filter(Boolean);
  const circle = await prisma.circle.findUnique({ where: { id } });
  if (!circle || !name) redirect("/settings/users");
  await prisma.$transaction([
    prisma.circle.update({ where: { id }, data: { name } }),
    prisma.user.updateMany({ where: { circleId: id, id: { notIn: memberIds } }, data: { circleId: null } }),
    ...(memberIds.length ? [prisma.user.updateMany({ where: { id: { in: memberIds } }, data: { circleId: id } })] : [])
  ]);
  redirect(`/settings/users#circle-${id}`);
}

async function updateUser(formData: FormData) {
  "use server";
  await requireAdmin();
  await prisma.user.update({
    where: { id: String(formData.get("id")) },
    data: {
      role: String(formData.get("role") || "USER") as "ADMIN" | "USER",
      circleId: String(formData.get("circleId") || "") || null,
      active: formData.get("active") === "on"
    }
  });
  redirect("/settings/users");
}

export default async function UsersPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/");
  const [users, circles] = await Promise.all([
    prisma.user.findMany({ include: { profile: true, circle: true }, orderBy: { createdAt: "asc" } }),
    prisma.circle.findMany({ orderBy: { name: "asc" } })
  ]);
  const serverNow = new Date();
  return (
    <AppShell>
      <PageHeader title="Benutzerverwaltung" />
      <PageGuide title="Benutzer, Rollen und Kreise verwalten">
        Diese Seite ist fuer Admins gedacht. Lege neue Konten an, erstelle einen Kreis fuer ein Paar oder eine Gruppe und ordne Benutzer diesem Kreis zu. Mitglieder desselben Kreises sehen automatisch gemeinsame Inhalte.
      </PageGuide>
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-6">
          <Panel>
            <h2 className="mb-3 text-lg font-semibold">Systemzeit</h2>
            <div className="space-y-1 text-sm text-graphite">
              <div>App-Zeitzone: <strong className="text-ink">{appTimeZone}</strong></div>
              <div>Anzeigezeit: <strong className="text-ink">{formatDateTime(serverNow)}</strong></div>
              <div>Server UTC: <strong className="text-ink">{serverNow.toISOString()}</strong></div>
            </div>
          </Panel>
          <Panel>
            <h2 className="mb-4 text-lg font-semibold">Kreis anlegen</h2>
            <form action={createCircle} className="space-y-4">
              <Field label="Name"><input className={inputClass} name="name" placeholder="Anna & Gabriel" required /></Field>
              <Button><UsersRound className="h-4 w-4" /> Kreis anlegen</Button>
            </form>
          </Panel>
          <Panel>
            <details className="group" open={circles.length <= 1}>
              <summary className="focus-ring flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-1 text-lg font-semibold text-ink hover:text-redbrand [&::-webkit-details-marker]:hidden">
                Kreise bearbeiten
                <span className="text-sm font-medium text-graphite group-open:hidden">aufklappen</span>
                <span className="hidden text-sm font-medium text-graphite group-open:inline">einklappen</span>
              </summary>
              <div className="mt-4 space-y-3">
                {circles.map((circle) => {
                  const members = users.filter((entry) => entry.circleId === circle.id);
                  const circleEditor = (
                    <form action={updateCircle} className="space-y-3 border-t border-line p-3">
                      <input name="id" type="hidden" value={circle.id} />
                      <Field label="Kreisname"><input className={inputClass} name="name" defaultValue={circle.name} required /></Field>
                      <div>
                        <div className="mb-2 text-sm font-medium text-graphite">Mitglieder</div>
                        <div className="space-y-2">
                          {users.map((entry) => {
                            const label = entry.profile?.displayName || entry.name || entry.email;
                            return (
                              <label key={entry.id} className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-3 py-2 text-sm">
                                <span className="min-w-0">
                                  <span className="block truncate font-semibold text-ink">{label}</span>
                                  <span className="block truncate text-xs text-graphite">{entry.email}</span>
                                </span>
                                <input name="memberIds" type="checkbox" value={entry.id} defaultChecked={entry.circleId === circle.id} className="h-4 w-4 shrink-0 accent-redbrand" />
                              </label>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-graphite">{members.length} Mitglied{members.length === 1 ? "" : "er"}</p>
                        <Button>Kreis speichern</Button>
                      </div>
                    </form>
                  );
                  return (
                    <details key={circle.id} id={`circle-${circle.id}`} className="group/circle overflow-hidden rounded-md border border-line bg-paper" open={circles.length === 1}>
                      <summary className="focus-ring flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-ink hover:bg-surface [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0">
                          <span className="block truncate">{circle.name}</span>
                          <span className="block text-xs font-medium text-graphite">{members.length} Mitglied{members.length === 1 ? "" : "er"}</span>
                        </span>
                        <span className="text-xs text-graphite group-open/circle:hidden">bearbeiten</span>
                        <span className="hidden text-xs text-graphite group-open/circle:inline">schliessen</span>
                      </summary>
                      {circleEditor}
                    </details>
                  );
                })}
                {!circles.length ? <p className="text-sm text-graphite">Noch kein Kreis angelegt.</p> : null}
              </div>
            </details>
          </Panel>
          <Panel>
            <h2 className="mb-4 text-lg font-semibold">Benutzer anlegen</h2>
            <form action={createUser} className="space-y-4">
              <Field label="Name"><input className={inputClass} name="name" /></Field>
              <Field label="E-Mail"><input className={inputClass} name="email" type="email" required /></Field>
              <Field label="Benutzername"><input className={inputClass} name="username" /></Field>
              <Field label="Passwort"><input className={inputClass} name="password" type="password" required minLength={8} /></Field>
              <Field label="Rolle"><select className={selectClass} name="role"><option value="USER">Benutzer</option><option value="ADMIN">Admin</option></select></Field>
              <Field label="Kreis">
                <select className={selectClass} name="circleId" defaultValue="">
                  <option value="">Kein Kreis</option>
                  {circles.map((circle) => <option key={circle.id} value={circle.id}>{circle.name}</option>)}
                </select>
              </Field>
              <Button><UserPlus className="h-4 w-4" /> Anlegen</Button>
            </form>
          </Panel>
        </div>
        <Panel>
          <div className="space-y-3">
            {users.map((entry) => (
              <form key={entry.id} id={`user-${entry.id}`} action={updateUser} className="grid gap-3 rounded-md border border-line p-3 xl:grid-cols-[1fr_140px_180px_110px_auto] xl:items-center">
                <input name="id" value={entry.id} type="hidden" />
                <div>
                  <strong>{entry.name || entry.email}</strong>
                  <p className="text-sm text-graphite">{entry.email}</p>
                  <p className="text-xs text-graphite">{entry.circle?.name || "Kein Kreis"}</p>
                </div>
                <select className={selectClass} name="role" defaultValue={entry.role}>
                  <option value="USER">Benutzer</option>
                  <option value="ADMIN">Admin</option>
                </select>
                <select className={selectClass} name="circleId" defaultValue={entry.circleId || ""}>
                  <option value="">Kein Kreis</option>
                  {circles.map((circle) => <option key={circle.id} value={circle.id}>{circle.name}</option>)}
                </select>
                <label className="flex items-center gap-2 text-sm text-graphite">
                  <input name="active" type="checkbox" defaultChecked={entry.active} className="h-4 w-4 accent-redbrand" />
                  aktiv
                </label>
                <div className="flex items-center gap-2">
                  <Badge tone={entry.active ? "green" : "neutral"}>{entry.active ? "aktiv" : "inaktiv"}</Badge>
                  <Button>Speichern</Button>
                </div>
              </form>
            ))}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
