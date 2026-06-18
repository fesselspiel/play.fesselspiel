import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { UserPlus, UsersRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, Button, Field, inputClass, PageGuide, PageHeader, Panel, selectClass } from "@/components/ui";
import { currentUser, requireAdmin } from "@/lib/auth";
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
  return (
    <AppShell>
      <PageHeader title="Benutzerverwaltung" subtitle="Benutzer anlegen, Rollen vergeben, Kreise fuer Paare/Gruppen verwalten und Konten deaktivieren." />
      <PageGuide>
        Diese Seite ist fuer Admins gedacht. Lege neue Konten an, erstelle einen Kreis fuer ein Paar oder eine Gruppe und ordne Benutzer diesem Kreis zu. Mitglieder desselben Kreises sehen automatisch gemeinsame Inhalte.
      </PageGuide>
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-6">
          <Panel>
            <h2 className="mb-4 text-lg font-semibold">Kreis anlegen</h2>
            <form action={createCircle} className="space-y-4">
              <Field label="Name"><input className={inputClass} name="name" placeholder="Anna & Gabriel" required /></Field>
              <Button><UsersRound className="h-4 w-4" /> Kreis anlegen</Button>
            </form>
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
