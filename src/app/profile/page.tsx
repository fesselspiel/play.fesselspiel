import { redirect } from "next/navigation";
import { Save } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { FileUploadField } from "@/components/file-upload-field";
import { SubmitButton } from "@/components/submit-button";
import { ThemePicker } from "@/components/theme-picker";
import { Field, inputClass, PageGuide, PageHeader, Panel } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { deleteOwnedFile, fileAssetUrl, fileIdFromUrl, saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { normalizeTheme, normalizeThemeMode } from "@/lib/themes";

async function saveProfile(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const currentProfile = await prisma.profile.findUnique({ where: { userId: user.id } });
  const uploadedImageUrl = String(formData.get("profileImageUploadedUrl") || "");
  const image = uploadedImageUrl ? null : await saveUploadedFile(user.id, formData.get("profileImage") as File | null);
  const removeImage = formData.get("removeProfileImage") === "on";
  const oldFileId = fileIdFromUrl(currentProfile?.imageUrl);
  if ((uploadedImageUrl || image || removeImage) && oldFileId) await deleteOwnedFile(user.id, oldFileId);
  const nextImageUrl = removeImage ? "" : uploadedImageUrl || (image ? fileAssetUrl(image.id) : currentProfile?.imageUrl || "");
  await prisma.user.update({
    where: { id: user.id },
    data: {
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
    }
  });
  redirect("/profile");
}

export default async function ProfilePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const activeTheme = normalizeTheme(user.settings?.theme);
  const activeMode = normalizeThemeMode(user.settings?.darkMode);
  return (
    <AppShell>
      <PageHeader title="Profil & Einstellungen" />
      <PageGuide title="Profilinformationen und persoenliches Erscheinungsbild">
        Hier pflegst du sichtbare Profilangaben und persoenliche Einstellungen. Aendere Basisdaten, Profiltext, Profilbild und teste Farbschemas direkt im Theme-Picker, bevor du speicherst.
      </PageGuide>
      <Panel className="max-w-3xl">
        <form action={saveProfile} className="space-y-4">
          {user.profile?.imageUrl ? (
            <div className="flex items-center gap-4 rounded-lg bg-paper p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={user.profile.imageUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
              <div>
                <div className="text-sm font-semibold text-ink">{user.profile.displayName || user.name || user.email}</div>
                <div className="text-sm text-graphite">Aktuelles Profilbild</div>
              </div>
            </div>
          ) : null}
          <Field label="Name"><input className={inputClass} name="name" defaultValue={user.name || ""} /></Field>
          <Field label="Anzeigename"><input className={inputClass} name="displayName" defaultValue={user.profile?.displayName || ""} /></Field>
          <Field label="Profiltext"><textarea className={inputClass} name="bio" rows={5} defaultValue={user.profile?.bio || ""} /></Field>
          <FileUploadField
            name="profileImage"
            uploadedUrlName="profileImageUploadedUrl"
            label="Profilbild"
            accept="image/*"
            currentUrl={user.profile?.imageUrl || ""}
            currentAlt={user.profile?.displayName || user.name || ""}
            removeName="removeProfileImage"
            removeLabel="Profilbild entfernen"
            help="Quadratisches Bild oder Foto auswaehlen."
          />
          <ThemePicker activeTheme={activeTheme} activeMode={activeMode} />
          <SubmitButton pendingLabel="Profil wird gespeichert..."><Save className="h-4 w-4" /> Profil speichern</SubmitButton>
        </form>
      </Panel>
    </AppShell>
  );
}
