import { redirect } from "next/navigation";
import Link from "next/link";
import bcrypt from "bcryptjs";
import { ChevronDown, KeyRound, MailCheck, Save, Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { FileUploadField } from "@/components/file-upload-field";
import { SubmitButton } from "@/components/submit-button";
import { ThemePicker } from "@/components/theme-picker";
import { UsernameField } from "@/components/username-field";
import { Badge, Field, inputClass, PageGuide, PageHeader, Panel } from "@/components/ui";
import { logAction, userDisplayName } from "@/lib/audit";
import { currentUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { sendEmailConfirmation } from "@/lib/email-confirmation";
import { deleteOwnedFile, fileAssetUrl, fileIdFromUrl, saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { passwordPolicyError, passwordPolicyText } from "@/lib/password-policy";
import { userPointTotal } from "@/lib/points";
import { actionLabel } from "@/lib/notification-actions";
import { normalizeTheme, normalizeThemeMode } from "@/lib/themes";
import { isValidUsername, normalizeUsername } from "@/lib/usernames";

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
  const nextUsername = normalizeUsername(String(formData.get("username") || ""));
  if (nextUsername && !isValidUsername(nextUsername)) redirect("/profile?error=username-invalid");
  if (nextUsername !== user.username) {
    const duplicateUsername = nextUsername ? await prisma.user.findUnique({ where: { username: nextUsername }, select: { id: true } }) : null;
    if (duplicateUsername && duplicateUsername.id !== user.id) redirect("/profile?error=username-exists");
  }
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
      username: nextUsername,
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
            darkMode: normalizeThemeMode(String(formData.get("darkMode") || "")) === "dark",
            showSensitiveMedia: formData.get("showSensitiveMedia") === "on",
            shareDefaultChannel: String(formData.get("shareDefaultChannel") || "all"),
            shareMessageTemplate: String(formData.get("shareMessageTemplate") || "").trim() || "Schau dir das an: {title}\n{url}"
          },
          create: {
            theme: normalizeTheme(String(formData.get("theme") || "")),
            darkMode: normalizeThemeMode(String(formData.get("darkMode") || "")) === "dark",
            showSensitiveMedia: formData.get("showSensitiveMedia") === "on",
            shareDefaultChannel: String(formData.get("shareDefaultChannel") || "all"),
            shareMessageTemplate: String(formData.get("shareMessageTemplate") || "").trim() || "Schau dir das an: {title}\n{url}"
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
  if (passwordPolicyError(nextPassword)) redirect("/profile?passwordError=policy#password");
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

export default async function ProfilePage(
  props: { searchParams?: Promise<{ error?: string; sent?: string; saved?: string; passwordError?: string }> }
) {
  const searchParams = await props.searchParams;
  const user = await currentUser();
  if (!user) redirect("/login");
  const activeTheme = normalizeTheme(user.settings?.theme);
  const activeMode = normalizeThemeMode(user.settings?.darkMode);
  const profileImageUrl = await existingProfileImageUrl(user.id, user.profile?.imageUrl);
  const points = user.tenantId ? await userPointTotal(user.id, user.tenantId) : 0;
  const pointEntries = user.tenantId
    ? await prisma.pointEntry.findMany({
        where: { userId: user.id, tenantId: user.tenantId },
        include: { auditLog: { select: { href: true, title: true, action: true, createdAt: true } } },
        orderBy: { createdAt: "desc" },
        take: 20
      })
    : [];
  return (
    <AppShell>
      <PageHeader title="Profil & Einstellungen" />
      <PageGuide title="Profilinformationen und persönliches Erscheinungsbild">
        Hier pflegst du sichtbare Profilangaben und persönliche Einstellungen. Ändere Basisdaten, Profiltext, Profilbild und teste Farbschemas direkt im Theme-Picker, bevor du speicherst.
      </PageGuide>
      <Panel className="mb-4 max-w-3xl">
        <details>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-redbrand text-white">
                <Trophy className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-2xl font-semibold text-ink">{points}</span>
                <span className="block text-sm text-graphite">deine Punkte auf dieser Seite</span>
              </span>
            </span>
            <ChevronDown className="h-5 w-5 shrink-0 text-graphite" />
          </summary>
          <div className="mt-4 border-t border-line pt-4">
            {pointEntries.length ? (
              <div className="space-y-2">
                {pointEntries.map((entry) => (
                  <div key={entry.id} className="rounded-md bg-paper p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-ink">{entry.note || entry.auditLog?.title || actionLabel(entry.action)}</div>
                        <div className="mt-1 text-xs text-graphite">
                          {formatDateTime(entry.createdAt)} · {actionLabel(entry.auditLog?.action || entry.action)}
                        </div>
                      </div>
                      <Badge tone={entry.points >= 0 ? "green" : "red"}>{entry.points > 0 ? "+" : ""}{entry.points}</Badge>
                    </div>
                    {entry.auditLog?.href ? (
                      <Link href={entry.auditLog.href} className="mt-2 inline-block text-xs font-semibold text-redbrand hover:underline">
                        Aktion öffnen
                      </Link>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-graphite">Noch keine Punkte gebucht.</p>
            )}
          </div>
        </details>
      </Panel>
      <Panel className="max-w-3xl">
        {searchParams?.error ? (
          <div className="mb-4 rounded-md border border-redbrand bg-redbrand/10 px-4 py-3 text-sm font-semibold text-redbrand">
            {searchParams.error === "email-exists"
              ? "Diese E-Mail-Adresse wird bereits verwendet."
              : searchParams.error === "username-exists"
                ? "Dieser Benutzername wird bereits verwendet."
                : searchParams.error === "username-invalid"
                  ? "Der Benutzername darf nur Kleinbuchstaben, Zahlen, Bindestrich und Unterstrich enthalten und muss 2 bis 40 Zeichen lang sein."
                  : "Bitte eine gültige E-Mail-Adresse angeben."}
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
          <Field label="Benutzername"><UsernameField defaultValue={user.username || ""} excludeId={user.id} /></Field>
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
          <details id="media-privacy" className="rounded-lg border border-line bg-paper p-4">
            <summary className="cursor-pointer list-none text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">Private Medien</summary>
            <div className="mt-4 space-y-3">
              <label className="flex items-start gap-3 rounded-md border border-line bg-surface p-3 text-sm">
                <input
                  name="showSensitiveMedia"
                  type="checkbox"
                  defaultChecked={user.settings?.showSensitiveMedia === true}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-redbrand"
                />
                <span>
                  <span className="block font-semibold text-ink">Nicht eingestufte private Bilder direkt anzeigen</span>
                  <span className="mt-1 block leading-6 text-graphite">
                    Gilt nur fuer deine eigene Ansicht in bekannten privaten Kreisen. Niemand Drittes muss Bilder freigeben oder sieht sie zur Kontrolle.
                  </span>
                </span>
              </label>
              <p className="text-xs leading-5 text-graphite">
                Ohne diese Auswahl bleiben nicht eingestufte Bilder in der App verdeckt. Grafisch explizite sowie technisch gesperrte Inhalte bleiben in iOS immer verborgen und sind nur auf der Website im berechtigten privaten Bereich erreichbar.
              </p>
            </div>
          </details>
          <details className="rounded-lg border border-line bg-paper p-4">
            <summary className="cursor-pointer list-none text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">Teilen konfigurieren</summary>
            <div className="mt-4 grid gap-4">
              <Field label="Standardkanal">
                <select className={inputClass} name="shareDefaultChannel" defaultValue={user.settings?.shareDefaultChannel || "all"}>
                  <option value="all">Alles</option>
                  <option value="telegram">Telegram</option>
                  <option value="push">Push</option>
                  <option value="email">E-Mail</option>
                </select>
              </Field>
              <Field label="Persönliche Teilen-Vorlage">
                <textarea className={inputClass} name="shareMessageTemplate" rows={4} defaultValue={user.settings?.shareMessageTemplate || "Schau dir das an: {title}\n{url}"} />
              </Field>
              <p className="text-xs leading-5 text-graphite">Verfügbare Variablen: {"{title}"}, {"{url}"}, {"{type}"}.</p>
            </div>
          </details>
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
                    : searchParams.passwordError === "policy"
                      ? "Das Passwort darf nicht leer und höchstens 128 Zeichen lang sein."
                    : "Bitte alle Passwortfelder ausfüllen."}
              </div>
            ) : null}
            <Field label="Aktuelles Passwort"><input className={inputClass} name="currentPassword" type="password" autoComplete="current-password" required /></Field>
            <Field label="Neues Passwort"><input className={inputClass} name="nextPassword" type="password" autoComplete="new-password" minLength={1} maxLength={128} required /></Field>
            <p className="text-xs text-graphite">{passwordPolicyText()}</p>
            <Field label="Neues Passwort wiederholen"><input className={inputClass} name="repeatPassword" type="password" autoComplete="new-password" required /></Field>
            <SubmitButton pendingLabel="Passwort wird gespeichert..."><KeyRound className="h-4 w-4" /> Passwort speichern</SubmitButton>
          </form>
        </details>
      </Panel>
    </AppShell>
  );
}
