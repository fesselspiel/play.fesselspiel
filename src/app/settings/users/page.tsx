import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { MailCheck, Trash2, UserPlus, UsersRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { FileUploadField } from "@/components/file-upload-field";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Button, Field, inputClass, PageGuide, PageHeader, Panel, selectClass } from "@/components/ui";
import { UsernameField } from "@/components/username-field";
import { currentSessionContext, currentUser, requireAdmin } from "@/lib/auth";
import { appTimeZone, formatDateTime } from "@/lib/dates";
import { sendEmailConfirmation } from "@/lib/email-confirmation";
import { sendTemplateEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { deleteOwnedFile, fileAssetUrl, fileIdFromUrl, saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";

async function adoptUploadedProfileImage(targetUserId: string, uploadedUrl: string) {
  const fileId = fileIdFromUrl(uploadedUrl);
  if (!fileId) return null;
  const asset = await prisma.fileAsset.findUnique({ where: { id: fileId }, select: { id: true, ownerId: true } });
  if (!asset) return null;
  if (asset.ownerId !== targetUserId) {
    await prisma.fileAsset.update({ where: { id: asset.id }, data: { ownerId: targetUserId } });
  }
  return fileAssetUrl(asset.id);
}

async function createUser(formData: FormData) {
  "use server";
  await requireAdmin();
  const { tenant } = await currentSessionContext();
  if (!tenant) redirect("/settings/users?error=tenant");
  const rawEmail = String(formData.get("email") || "").trim().toLowerCase();
  const username = String(formData.get("username") || "").trim() || null;
  if (!rawEmail && !username) redirect("/settings/users?error=missing-login");
  if (rawEmail) {
    const existingEmail = await prisma.user.findUnique({ where: { email: rawEmail } });
    if (existingEmail) redirect("/settings/users?error=email-exists");
  }
  if (username) {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) redirect("/settings/users?error=username-exists");
  }
  const email = rawEmail || `${username}@local.fesselspiel`;
  const password = String(formData.get("password") || "");
  if (!password && !rawEmail) redirect("/settings/users?error=missing-password");
  const uploadedProfileImageUrl = String(formData.get("newProfileImageUploadedUrl") || "");
  if (uploadedProfileImageUrl && !fileIdFromUrl(uploadedProfileImageUrl)) redirect("/settings/users?error=upload");
  const passwordHash = await bcrypt.hash(password || randomBytes(24).toString("base64url"), 12);
  const user = await prisma.user.create({
    data: {
      email,
      username,
      name: String(formData.get("name") || "").trim(),
      passwordHash,
      tenantId: tenant.id,
      role: String(formData.get("role") || "USER") as "ADMIN" | "USER",
      circleId: String(formData.get("circleId") || "") || null,
      active: true,
      emailVerifiedAt: rawEmail ? null : new Date(),
      profile: { create: { displayName: String(formData.get("name") || "").trim() } },
      settings: { create: {} }
    }
  });
  await prisma.tenantMembership.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      role: String(formData.get("role") || "USER") as "ADMIN" | "USER",
      circleId: String(formData.get("circleId") || "") || null,
      active: true
    }
  });
  const adoptedImageUrl = uploadedProfileImageUrl ? await adoptUploadedProfileImage(user.id, uploadedProfileImageUrl) : null;
  const image = adoptedImageUrl ? null : await saveUploadedFile(user.id, formData.get("profileImage") as File | null);
  if (uploadedProfileImageUrl && !adoptedImageUrl) redirect("/settings/users?error=upload");
  if (adoptedImageUrl || image) await prisma.profile.update({ where: { userId: user.id }, data: { imageUrl: adoptedImageUrl || fileAssetUrl(image!.id) } });
  if (rawEmail) {
    await sendEmailConfirmation(user);
  } else {
    await sendTemplateEmail({
      key: "user_created",
      to: null,
      variables: {
        userName: user.name || user.username || user.email,
        loginIdentifier: user.username || user.email,
        appUrl: env.appUrl,
        profileUrl: `${env.appUrl}/profile`,
        confirmUrl: ""
      }
    });
  }
  redirect(`/settings/users#user-${user.id}`);
}

async function createCircle(formData: FormData) {
  "use server";
  await requireAdmin();
  const { tenant } = await currentSessionContext();
  if (!tenant) redirect("/settings/users?error=tenant");
  const name = String(formData.get("name") || "").trim();
  if (name) await prisma.circle.upsert({ where: { tenantId_name: { tenantId: tenant.id, name } }, update: {}, create: { tenantId: tenant.id, name } });
  redirect("/settings/users");
}

async function updateCircle(formData: FormData) {
  "use server";
  await requireAdmin();
  const { tenant } = await currentSessionContext();
  if (!tenant) redirect("/settings/users?error=tenant");
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const memberIds = formData.getAll("memberIds").map(String).filter(Boolean);
  const circle = await prisma.circle.findFirst({ where: { id, tenantId: tenant.id } });
  if (!circle || !name) redirect("/settings/users");
  await prisma.$transaction([
    prisma.circle.update({ where: { id }, data: { name } }),
    prisma.tenantMembership.updateMany({ where: { tenantId: tenant.id, circleId: id, userId: { notIn: memberIds } }, data: { circleId: null } }),
    ...(memberIds.length ? [prisma.tenantMembership.updateMany({ where: { tenantId: tenant.id, userId: { in: memberIds } }, data: { circleId: id } })] : [])
  ]);
  redirect(`/settings/users#circle-${id}`);
}

async function updateUser(formData: FormData) {
  "use server";
  await requireAdmin();
  const { tenant } = await currentSessionContext();
  if (!tenant) redirect("/settings/users?error=tenant");
  const id = String(formData.get("id"));
  const membership = await prisma.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId: tenant.id, userId: id } } });
  if (!membership) redirect("/settings/users?error=user-delete");
  const existing = await prisma.user.findUnique({ where: { id }, include: { profile: true } });
  if (!existing) redirect("/settings/users");
  const nextEmail = String(formData.get("email") || "").trim().toLowerCase();
  if (!nextEmail || !nextEmail.includes("@")) redirect("/settings/users?error=email-invalid");
  const emailChanged = nextEmail !== existing.email;
  if (emailChanged) {
    const duplicate = await prisma.user.findFirst({ where: { email: nextEmail, id: { not: id } }, select: { id: true } });
    if (duplicate) redirect("/settings/users?error=email-exists");
  }
  const updatedUser = await prisma.user.update({
    where: { id },
    data: {
      email: nextEmail,
      emailVerifiedAt: emailChanged ? (nextEmail.endsWith("@local.fesselspiel") ? new Date() : null) : existing.emailVerifiedAt,
      active: formData.get("active") === "on"
    },
    include: { profile: true }
  });
  await prisma.tenantMembership.update({
    where: { id: membership.id },
    data: {
      role: String(formData.get("role") || "USER") as "ADMIN" | "USER",
      circleId: String(formData.get("circleId") || "") || null,
      active: formData.get("active") === "on"
    }
  });
  if (emailChanged && !nextEmail.endsWith("@local.fesselspiel")) await sendEmailConfirmation(updatedUser);
  const uploadedProfileImageUrl = String(formData.get("profileImageUploadedUrl") || "");
  if (uploadedProfileImageUrl && !fileIdFromUrl(uploadedProfileImageUrl)) redirect(`/settings/users?error=upload#user-${id}`);
  const adoptedImageUrl = uploadedProfileImageUrl ? await adoptUploadedProfileImage(id, uploadedProfileImageUrl) : null;
  if (uploadedProfileImageUrl && !adoptedImageUrl) redirect(`/settings/users?error=upload#user-${id}`);
  const image = adoptedImageUrl ? null : await saveUploadedFile(id, formData.get("profileImage") as File | null);
  if (adoptedImageUrl || image) {
    const previousFileId = fileIdFromUrl(existing.profile?.imageUrl);
    const nextFileId = fileIdFromUrl(adoptedImageUrl || fileAssetUrl(image!.id));
    await prisma.profile.upsert({
      where: { userId: id },
      update: { imageUrl: adoptedImageUrl || fileAssetUrl(image!.id) },
      create: { userId: id, displayName: existing.name, imageUrl: adoptedImageUrl || fileAssetUrl(image!.id) }
    });
    if (previousFileId && previousFileId !== nextFileId) await deleteOwnedFile(id, previousFileId);
  } else if (formData.get("removeProfileImage") === "on") {
    const previousFileId = fileIdFromUrl(existing.profile?.imageUrl);
    await prisma.profile.upsert({
      where: { userId: id },
      update: { imageUrl: null },
      create: { userId: id, displayName: existing.name, imageUrl: null }
    });
    if (previousFileId) await deleteOwnedFile(id, previousFileId);
  }
  redirect(`/settings/users?saved=user#user-${id}`);
}

async function resendUserEmailConfirmation(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const user = await prisma.user.findUnique({ where: { id }, include: { profile: true } });
  if (!user) redirect("/settings/users?error=email-confirmation");
  if (user.emailVerifiedAt || !user.email || user.email.endsWith("@local.fesselspiel")) redirect(`/settings/users#user-${id}`);
  await sendEmailConfirmation(user);
  redirect(`/settings/users?saved=email-confirmation#user-${id}`);
}

async function deleteUser(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const { tenant } = await currentSessionContext();
  if (!tenant) redirect("/settings/users?error=tenant");
  const id = String(formData.get("id") || "");
  if (!id || id === admin.id) redirect("/settings/users?error=user-self-delete");
  const membership = await prisma.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId: tenant.id, userId: id } } });
  if (!membership) redirect("/settings/users?error=user-delete");
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!target) redirect("/settings/users?error=user-delete");
  if (membership.role === "ADMIN" || target.role === "SUPER_ADMIN") {
    const adminCount = await prisma.tenantMembership.count({ where: { tenantId: tenant.id, active: true, OR: [{ role: "ADMIN" }, { user: { role: "SUPER_ADMIN" } }] } });
    if (adminCount <= 1) redirect("/settings/users?error=last-admin");
  }
  const membershipCount = await prisma.tenantMembership.count({ where: { userId: id } });
  if (membershipCount > 1) {
    await prisma.tenantMembership.delete({ where: { id: membership.id } });
    redirect("/settings/users?saved=user-deleted");
  }
  const files = await prisma.fileAsset.findMany({ where: { ownerId: id }, select: { id: true } });
  for (const file of files) {
    await deleteOwnedFile(id, file.id);
  }
  await prisma.user.delete({ where: { id } });
  redirect("/settings/users?saved=user-deleted");
}

async function adoptExistingUser(formData: FormData) {
  "use server";
  await requireAdmin();
  const { tenant } = await currentSessionContext();
  if (!tenant) redirect("/settings/users?error=tenant");
  const userId = String(formData.get("userId") || "");
  const target = await prisma.user.findFirst({ where: { id: userId, active: true }, select: { id: true } });
  if (!target) redirect("/settings/users?error=user-delete");
  await prisma.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId } },
    update: {
      active: true,
      role: String(formData.get("role") || "USER") as "ADMIN" | "USER",
      circleId: String(formData.get("circleId") || "") || null
    },
    create: {
      tenantId: tenant.id,
      userId,
      role: String(formData.get("role") || "USER") as "ADMIN" | "USER",
      circleId: String(formData.get("circleId") || "") || null,
      active: true
    }
  });
  redirect(`/settings/users?saved=user#user-${userId}`);
}

async function updateTimeSettings(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const timeOffsetMinutes = Number(formData.get("timeOffsetMinutes") || 0) || 0;
  await prisma.userSettings.upsert({
    where: { userId: admin.id },
    update: { timeOffsetMinutes },
    create: { userId: admin.id, timeOffsetMinutes }
  });
  redirect("/settings/users#systemzeit");
}

export default async function UsersPage({ searchParams }: { searchParams?: { error?: string; saved?: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/");
  const { tenant } = await currentSessionContext();
  if (!tenant) redirect("/");
  const [memberships, circles, adoptableUsers] = await Promise.all([
    prisma.tenantMembership.findMany({
      where: { tenantId: tenant.id },
      include: { circle: true, user: { include: { profile: true } } },
      orderBy: { createdAt: "asc" }
    }),
    prisma.circle.findMany({ where: { tenantId: tenant.id }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { active: true, memberships: { none: { tenantId: tenant.id } } },
      include: { profile: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      take: 50
    })
  ]);
  const users = memberships.map((membership) => ({
    ...membership.user,
    role: membership.user.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : membership.role,
    active: membership.active && membership.user.active,
    circleId: membership.circleId,
    circle: membership.circle
  }));
  const serverNow = new Date();
  const timeOffsetMinutes = user.settings?.timeOffsetMinutes || 0;
  const adjustedNow = new Date(serverNow.getTime() + timeOffsetMinutes * 60000);
  return (
    <AppShell>
      <PageHeader title="Benutzerverwaltung" />
      <PageGuide title="Benutzer, Rollen und Kreise verwalten">
        Diese Seite ist für Admins gedacht. Lege neue Konten an, erstelle einen Kreis für ein Paar oder eine Gruppe und ordne Benutzer diesem Kreis zu. Mitglieder desselben Kreises sehen automatisch gemeinsame Inhalte.
      </PageGuide>
      {searchParams?.error ? (
        <div className="mb-4 rounded-md border border-redbrand bg-redbrand/10 px-4 py-3 text-sm font-semibold text-redbrand">
          {searchParams.error === "username-exists"
            ? "Der Benutzername ist bereits vergeben."
            : searchParams.error === "email-exists"
              ? "Die E-Mail-Adresse ist bereits vergeben."
              : searchParams.error === "email-invalid"
                ? "Bitte eine gültige E-Mail-Adresse angeben."
                : searchParams.error === "missing-password"
                  ? "Bitte ein Passwort angeben, wenn keine E-Mail-Adresse gesetzt ist."
                  : searchParams.error === "upload"
                    ? "Upload konnte nicht übernommen werden. Bitte das Bild erneut auswählen."
                    : searchParams.error === "tenant"
                      ? "Die aktive Seite konnte nicht ermittelt werden."
                    : searchParams.error === "user-self-delete"
                      ? "Du kannst deinen eigenen Benutzer nicht löschen."
                      : searchParams.error === "last-admin"
                        ? "Der letzte Admin kann nicht gelöscht werden."
                        : searchParams.error === "user-delete"
                          ? "Benutzer konnte nicht gelöscht werden."
                    : "Bitte E-Mail oder Benutzername angeben."}
        </div>
      ) : null}
      {searchParams?.saved === "user" ? (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          Benutzer gespeichert.
        </div>
      ) : null}
      {searchParams?.saved === "email-confirmation" ? (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          Bestätigungs-E-Mail wurde erneut gesendet.
        </div>
      ) : null}
      {searchParams?.saved === "user-deleted" ? (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          Benutzer wurde gelöscht.
        </div>
      ) : null}
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
                                <span className="flex min-w-0 items-center gap-3">
                                  {entry.profile?.imageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={entry.profile.imageUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                                  ) : (
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-redbrand text-xs font-semibold text-white">{label.slice(0, 1).toUpperCase()}</span>
                                  )}
                                  <span className="min-w-0">
                                    <span className="block truncate font-semibold text-ink">{label}</span>
                                    <span className="block truncate text-xs text-graphite">{entry.email}</span>
                                  </span>
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
            <details className="group">
              <summary className="focus-ring flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-1 text-lg font-semibold text-ink hover:text-redbrand [&::-webkit-details-marker]:hidden">
                Benutzer anlegen
                <span className="text-sm font-medium text-graphite group-open:hidden">aufklappen</span>
                <span className="hidden text-sm font-medium text-graphite group-open:inline">einklappen</span>
              </summary>
              <form action={createUser} className="mt-4 space-y-4">
                <Field label="Name"><input className={inputClass} name="name" /></Field>
                <Field label="E-Mail"><input className={inputClass} name="email" type="email" placeholder="Optional, wenn Benutzername gesetzt ist" /></Field>
                <Field label="Benutzername"><UsernameField /></Field>
                <Field label="Startpasswort"><input className={inputClass} name="password" type="password" placeholder="Optional bei E-Mail-Einladung" /></Field>
                <FileUploadField name="profileImage" label="Profilbild" accept="image/*" help="Optionales Profilbild auswählen." uploadedUrlName="newProfileImageUploadedUrl" imageCropAspect="square" />
                <Field label="Rolle"><select className={selectClass} name="role"><option value="USER">Benutzer</option><option value="ADMIN">Admin</option></select></Field>
                <Field label="Kreis">
                  <select className={selectClass} name="circleId" defaultValue="">
                    <option value="">Kein Kreis</option>
                    {circles.map((circle) => <option key={circle.id} value={circle.id}>{circle.name}</option>)}
                  </select>
                </Field>
                <SubmitButton pendingLabel="Benutzer wird angelegt..."><UserPlus className="h-4 w-4" /> Anlegen</SubmitButton>
              </form>
            </details>
          </Panel>
          <Panel>
            <details className="group">
              <summary className="focus-ring flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-1 text-lg font-semibold text-ink hover:text-redbrand [&::-webkit-details-marker]:hidden">
                Bestehenden Benutzer übernehmen
                <span className="text-sm font-medium text-graphite group-open:hidden">aufklappen</span>
                <span className="hidden text-sm font-medium text-graphite group-open:inline">einklappen</span>
              </summary>
              <form action={adoptExistingUser} className="mt-4 space-y-4">
                <Field label="Benutzer">
                  <select className={selectClass} name="userId" required defaultValue="">
                    <option value="">Benutzer auswählen</option>
                    {adoptableUsers.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.profile?.displayName || entry.name || entry.username || entry.email} · {entry.email}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Rolle"><select className={selectClass} name="role"><option value="USER">Benutzer</option><option value="ADMIN">Admin</option></select></Field>
                <Field label="Kreis">
                  <select className={selectClass} name="circleId" defaultValue="">
                    <option value="">Kein Kreis</option>
                    {circles.map((circle) => <option key={circle.id} value={circle.id}>{circle.name}</option>)}
                  </select>
                </Field>
                <SubmitButton pendingLabel="Benutzer wird übernommen..."><UserPlus className="h-4 w-4" /> In diese Seite übernehmen</SubmitButton>
                {!adoptableUsers.length ? <p className="text-sm text-graphite">Keine weiteren vorhandenen Benutzer verfügbar.</p> : null}
              </form>
            </details>
          </Panel>
          <Panel className="order-last" id="systemzeit">
            <details className="group">
              <summary className="focus-ring flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-1 text-lg font-semibold text-ink hover:text-redbrand [&::-webkit-details-marker]:hidden">
                Systemzeit
                <span className="text-sm font-medium text-graphite group-open:hidden">aufklappen</span>
                <span className="hidden text-sm font-medium text-graphite group-open:inline">einklappen</span>
              </summary>
              <div className="mt-4 space-y-1 text-sm text-graphite">
                <div>App-Zeitzone: <strong className="text-ink">{appTimeZone}</strong></div>
                <div>Anzeigezeit: <strong className="text-ink">{formatDateTime(adjustedNow)}</strong></div>
                <div>Server UTC: <strong className="text-ink">{serverNow.toISOString()}</strong></div>
              </div>
              <form action={updateTimeSettings} className="mt-4 space-y-3">
                <Field label="Zeitkorrektur in Minuten">
                  <input className={inputClass} name="timeOffsetMinutes" type="number" step="1" defaultValue={timeOffsetMinutes} />
                </Field>
                <p className="text-xs text-graphite">Beispiel: 60 addiert eine Stunde, -60 zieht eine Stunde ab.</p>
                <SubmitButton pendingLabel="Zeit wird gespeichert...">Zeit speichern</SubmitButton>
              </form>
            </details>
          </Panel>
        </div>
        <Panel>
          <details className="group" open>
            <summary className="focus-ring flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-1 text-lg font-semibold text-ink hover:text-redbrand [&::-webkit-details-marker]:hidden">
              Benutzer bearbeiten
              <span className="text-sm font-medium text-graphite group-open:hidden">aufklappen</span>
              <span className="hidden text-sm font-medium text-graphite group-open:inline">einklappen</span>
            </summary>
            <div className="mt-4 space-y-3">
              {users.map((entry) => (
              <details key={entry.id} id={`user-${entry.id}`} className="overflow-hidden rounded-md border border-line bg-paper">
                <summary className="focus-ring flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 hover:bg-surface [&::-webkit-details-marker]:hidden">
                  <span className="flex min-w-0 items-center gap-3">
                    {entry.profile?.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={entry.profile.imageUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-redbrand text-sm font-semibold text-white">{(entry.profile?.displayName || entry.name || entry.email).slice(0, 1).toUpperCase()}</span>
                    )}
                    <span className="min-w-0">
                      <strong className="block truncate">{entry.profile?.displayName || entry.name || entry.email}</strong>
                      <span className="block truncate text-xs text-graphite">{entry.email}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={entry.active ? "green" : "neutral"}>{entry.active ? "aktiv" : "inaktiv"}</Badge>
                    <Badge tone={entry.emailVerifiedAt ? "green" : "neutral"}>{entry.emailVerifiedAt ? "E-Mail bestätigt" : "unbestätigt"}</Badge>
                  </span>
                </summary>
              <form action={updateUser} className="space-y-4 border-t border-line bg-surface p-3">
                <input name="id" value={entry.id} type="hidden" />
                <div className="grid gap-3 xl:grid-cols-[1fr_220px_140px_180px_110px_auto] xl:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    {entry.profile?.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={entry.profile.imageUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-redbrand text-sm font-semibold text-white">{(entry.profile?.displayName || entry.name || entry.email).slice(0, 1).toUpperCase()}</span>
                    )}
                    <div className="min-w-0">
                      <strong className="block truncate">{entry.profile?.displayName || entry.name || entry.email}</strong>
                      <p className="truncate text-sm text-graphite">{entry.email}</p>
                      <p className="truncate text-xs text-graphite">{entry.circle?.name || "Kein Kreis"}</p>
                      <p className="truncate text-xs text-graphite">{entry.emailVerifiedAt ? `E-Mail bestätigt: ${formatDateTime(entry.emailVerifiedAt)}` : "E-Mail noch nicht bestätigt"}</p>
                    </div>
                  </div>
                  <input className={inputClass} name="email" type="email" defaultValue={entry.email} required />
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
                    <SubmitButton pendingLabel="Benutzer wird gespeichert...">Speichern</SubmitButton>
                  </div>
                </div>
                <FileUploadField
                  name="profileImage"
                  label="Profilbild"
                  accept="image/*"
                  currentUrl={entry.profile?.imageUrl}
                  currentAlt={entry.profile?.displayName || entry.name || ""}
                  removeName="removeProfileImage"
                  uploadedUrlName="profileImageUploadedUrl"
                  removeLabel="Profilbild entfernen"
                  help="Optional neues Profilbild auswählen."
                  imageCropAspect="square"
                />
              </form>
              {!entry.emailVerifiedAt && entry.email && !entry.email.endsWith("@local.fesselspiel") ? (
                <form action={resendUserEmailConfirmation} className="border-t border-line bg-paper p-3">
                  <input name="id" value={entry.id} type="hidden" />
                  <SubmitButton pendingLabel="E-Mail wird gesendet..." className="bg-surface text-redbrand ring-1 ring-line hover:bg-redbrand hover:text-white">
                    <MailCheck className="h-4 w-4" />
                    Bestätigungs-E-Mail erneut senden
                  </SubmitButton>
                </form>
              ) : null}
              {entry.id !== user.id ? (
                <form action={deleteUser} className="border-t border-redbrand/20 bg-redbrand/5 p-3">
                  <input name="id" value={entry.id} type="hidden" />
                  <p className="mb-3 text-sm text-graphite">Löscht den Benutzer inklusive seiner geschützten Dateien. Gemeinsame Inhalte dieses Benutzers verschwinden dadurch ebenfalls.</p>
                  <Button variant="danger"><Trash2 className="h-4 w-4" /> Benutzer löschen</Button>
                </form>
              ) : null}
              </details>
            ))}
            </div>
          </details>
        </Panel>
      </div>
    </AppShell>
  );
}
