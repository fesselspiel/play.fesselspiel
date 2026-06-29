import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { KeyRound, MailCheck, Save } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { FileUploadField } from "@/components/file-upload-field";
import { SubmitButton } from "@/components/submit-button";
import { ThemePicker } from "@/components/theme-picker";
import { Field, inputClass, PageGuide, PageHeader, Panel } from "@/components/ui";
import { logAction, userDisplayName } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { sendEmailConfirmation } from "@/lib/email-confirmation";
import { deleteOwnedFile, fileAssetUrl, fileIdFromUrl, saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { normalizeTheme, normalizeThemeMode } from "@/lib/themes";

async function existingProfileImageUrl(ownerId: string, url?: string | null) {
  const fileId = fileIdFromUrl(url);
  if (!fileId) return "";
  const asset = await prisma.fileAsset.findFirst({ where: { id: fileId, ownerId } });
  return asset ? url || "" : "";
}

async function saveProfile(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const nextEmail = String(formData.get("email") || "").trim().toLowerCase();
  if (!nextEmail || !nextEmail.includes("@")) redirect("/profile?error=email-invalid");
  const emailChanged = nextEmail !== user.email;
  if (emailChanged) {
    const existingEmail = await prisma.user.findFirst({ where: { email: nextEmail, id: { not: user.id } }, select: { id: true } });
    if (existingEmail) redirect("/profile?error=email-exists");
  }
  const currentProfile = await prisma.profile.findUnique({ where: { userId: user.id } });
  const currentImageUrl = await existingProfileImageUrl(user.id, currentProfile?.imageUrl);
  const uploadedImageUrl = String(formData.get("profileImageUploadedUrl") || "");
  const image = uploadedImageUrl ? null : await saveUploadedFile(user.id, formData.get("profileImage") as File | null);
  const removeImage = formData.get("removeProfileImage") === "on";
  const oldFileId = fileIdFromUrl(currentImageUrl);
  if ((uploadedImageUrl || image || removeImage) && oldFileId) await deleteOwnedFile(user.id, oldFileId);
  const nextImageUrl = removeImage ? "" : uploadedImageUrl || (image ? fileAssetUrl(image.id) : currentImageUrl);
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      email: nextEmail,
      emailVerifiedAt: emailChanged ? null : user.emailVerifiedAt,
      name: String(formData.get("name") || "").trim(),
      profile: {
        upsert: {
          update: {
            displayName: String(formData.get("displayName") || "").trim(),
            bio: String(formData.get("bio") || "").trim(),
            imageUrl: nextImageUrl
          },
          create: {
            displayName: String(formData.get("displayName") || "").trim(),
            bio: String(formData.get("bio") || "").trim(),
            imageUrl: nextImageUrl
          }
        }
      },
      settings: {
        upsert: {
          update: {
            theme: normalizeTheme(String(formData.get("theme") || "")),
            darkMode: normalizeThemeMode(String(formData.get("darkMode") || "")) === "dark"
          },
          create: {
            theme: normalizeTheme(String(formData.get("theme") || "")),
            darkMode: normalizeThemeMode(String(formData.get("darkMode") || "")) === "dark"
          }
        }
      }
    },
    include: { profile: true }
  });
  if (emailChanged) await sendEmailConfirmation(updatedUser);
  redirect("/profile");
}

async function changeOwnPassword(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const currentPassword = String(formData.get("currentPassword") || "");
  const nextPassword = String(formData.get("nextPassword") || "");
  const repeatPassword = String(formData.get("repeatPassword") || "");
  if (!currentPassword || !nextPassword || !repeatPassword) redirect("/profile?passwordError=missing#password");
  if (nextPassword !== repeatPassword) redirect("/profile?passwordError=mismatch#password");
  const freshUser = await prisma.user.findUnique({ where: { id: user.id }, include: { profile: true } });
  if (!freshUser || !(await bcrypt.compare(currentPassword, freshUser.passwordHash))) redirect("/profile?passwordError=current#password");
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(nextPassword, 12) }
  });
  await logAction({
    actorId: user.id,
    action: "password_changed",
    entityType: "user",
    entityId: user.id,
    title: `${userDisplayName(freshUser)} hat das eigene Passwort geändert`,
    href: "/profile",
    details: { targetUserId: user.id }
  });
  redirect("/profile?saved=password#password");
}

async function resendOwnEmailConfirmation() {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.emailVerifiedAt && user.email && !user.email.endsWith("@local.fesselspiel")) {
    await sendEmailConfirmation(user);
  }
  redirect("/profile?sent=email-confirmation");
}

export default async function ProfilePage({ searchParams }: { searchParams?: { error?: string; sent?: string; saved?: string; passwordError?: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const activeTheme = normalizeTheme(user.settings?.theme);
  const activeMode = normalizeThemeMode(user.settings?.darkMode);
  const profileImageUrl = await existingProfileImageUrl(user.id, user.profile?.imageUrl);
  return (
    <AppShell>
      <PageHeader title="Profil & Einstellungen" />
      <PageGuide title="Profilinformationen und persönliches Erscheinungsbild">
        Hier pflegst du sichtbare Profilangaben und persönliche Einstellungen. Ändere Basisdaten, Profiltext, Profilbild und teste Farbschemas direkt im Theme-Picker, bevor du speicherst.
      </PageGuide>
      <Panel className="max-w-3xl">
        {searchParams?.error ? (
          <div className="mb-4 rounded-md border border-redbrand bg-redbrand/10 px-4 py-3 text-sm font-semibold text-redbrand">
            {searchParams.error === "email-exists" ? "Diese E-Mail-Adresse wird bereits verwendet." : "Bitte eine gültige E-Mail-Adresse angeben."}
          </div>
        ) : null}
        {searchParams?.sent === "email-confirmation" ? (
          <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            Bestätigungs-E-Mail wurde erneut gesendet.
          </div>
        ) : null}
        {searchParams?.saved === "password" ? (
          <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            Passwort gespeichert.
          </div>
        ) : null}
        <form action={saveProfile} className="space-y-4">
          {profileImageUrl ? (
            <div className="flex items-center gap-4 rounded-lg bg-paper p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={profileImageUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
              <div>
                <div className="text-sm font-semibold text-ink">{user.profile?.displayName || user.name || user.email}</div>
                <div className="text-sm text-graphite">Aktuelles Profilbild</div>
              </div>
            </div>
          ) : null}
          <Field label="Name"><input className={inputClass} name="name" defaultValue={user.name || ""} /></Field>
          <Field label="Anzeigename"><input className={inputClass} name="displayName" defaultValue={user.profile?.displayName || ""} /></Field>
          <Field label="E-Mail-Adresse"><input className={inputClass} name="email" type="email" defaultValue={user.email || ""} required /></Field>
          <p className="rounded-md bg-paper px-3 py-2 text-sm text-graphite">
            {user.emailVerifiedAt ? `E-Mail bestätigt: ${user.email}` : "E-Mail noch nicht bestätigt. Wenn du die Adresse änderst, senden wir automatisch einen neuen Bestätigungslink."}
          </p>
          <p className="rounded-md bg-paper px-3 py-2 text-sm text-graphite">
            {user.lastLoginAt ? `Letzter Login: ${formatDateTime(user.lastLoginAt)}` : "Noch kein Login gespeichert."}
          </p>
          {!user.emailVerifiedAt && user.email && !user.email.endsWith("@local.fesselspiel") ? (
            <SubmitButton formAction={resendOwnEmailConfirmation} formNoValidate pendingLabel="E-Mail wird gesendet..." className="bg-surface text-redbrand ring-1 ring-line hover:bg-redbrand hover:text-white">
              <MailCheck className="h-4 w-4" />
              Bestätigungs-E-Mail erneut senden
            </SubmitButton>
          ) : null}
          <Field label="Profiltext"><textarea className={inputClass} name="bio" rows={5} defaultValue={user.profile?.bio || ""} /></Field>
          <FileUploadField
            name="profileImage"
            uploadedUrlName="profileImageUploadedUrl"
            label="Profilbild"
            accept="image/*"
            currentUrl={profileImageUrl}
            currentAlt={user.profile?.displayName || user.name || ""}
            removeName="removeProfileImage"
            removeLabel="Profilbild entfernen"
            help="Quadratisches Bild oder Foto auswählen."
            imageCropAspect="square"
          />
          <ThemePicker activeTheme={activeTheme} activeMode={activeMode} />
          <SubmitButton pendingLabel="Profil wird gespeichert..."><Save className="h-4 w-4" /> Profil speichern</SubmitButton>
        </form>
      </Panel>
      <Panel id="password" className="mt-4 max-w-3xl">
        <details>
          <summary className="focus-ring flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-1 text-lg font-semibold text-ink hover:text-redbrand [&::-webkit-details-marker]:hidden">
            Passwort ändern
            <KeyRound className="h-5 w-5 text-graphite" />
          </summary>
          <form action={changeOwnPassword} className="mt-4 space-y-4">
            {searchParams?.passwordError ? (
              <div className="rounded-md border border-redbrand bg-redbrand/10 px-4 py-3 text-sm font-semibold text-redbrand">
                {searchParams.passwordError === "current"
                  ? "Das aktuelle Passwort stimmt nicht."
                  : searchParams.passwordError === "mismatch"
                    ? "Die neuen Passwörter stimmen nicht überein."
                    : "Bitte alle Passwortfelder ausfüllen."}
              </div>
            ) : null}
            <Field label="Aktuelles Passwort"><input className={inputClass} name="currentPassword" type="password" autoComplete="current-password" required /></Field>
            <Field label="Neues Passwort"><input className={inputClass} name="nextPassword" type="password" autoComplete="new-password" required /></Field>
            <Field label="Neues Passwort wiederholen"><input className={inputClass} name="repeatPassword" type="password" autoComplete="new-password" required /></Field>
            <SubmitButton pendingLabel="Passwort wird gespeichert..."><KeyRound className="h-4 w-4" /> Passwort speichern</SubmitButton>
          </form>
        </details>
      </Panel>
    </AppShell>
  );
}
