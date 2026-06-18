import { redirect } from "next/navigation";
import { Save } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { ThemePicker } from "@/components/theme-picker";
import { Button, Field, inputClass, PageGuide, PageHeader, Panel } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeTheme, normalizeThemeMode } from "@/lib/themes";

async function saveProfile(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const rawFields = String(formData.get("fields") || "{}");
  let fields: Record<string, unknown> = {};
  try {
    fields = JSON.parse(rawFields);
  } catch {
    fields = { notiz: rawFields };
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: String(formData.get("name") || "").trim(),
      profile: {
        upsert: {
          update: {
            displayName: String(formData.get("displayName") || "").trim(),
            bio: String(formData.get("bio") || "").trim(),
            fields: fields as Prisma.InputJsonValue
          },
          create: {
            displayName: String(formData.get("displayName") || "").trim(),
            bio: String(formData.get("bio") || "").trim(),
            fields: fields as Prisma.InputJsonValue
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
      <PageHeader title="Profil & Einstellungen" subtitle="Basisdaten, frei definierbare Profilinformationen und persoenliches Erscheinungsbild." />
      <PageGuide>
        Hier pflegst du deine sichtbaren Profilangaben und persoenlichen Einstellungen. Aendere Basisdaten, speichere eigene JSON-Felder und teste Farbschemas direkt im Theme-Picker, bevor du speicherst.
      </PageGuide>
      <Panel className="max-w-3xl">
        <form action={saveProfile} className="space-y-4">
          <Field label="Name"><input className={inputClass} name="name" defaultValue={user.name || ""} /></Field>
          <Field label="Anzeigename"><input className={inputClass} name="displayName" defaultValue={user.profile?.displayName || ""} /></Field>
          <Field label="Beschreibung"><textarea className={inputClass} name="bio" rows={4} defaultValue={user.profile?.bio || ""} /></Field>
          <Field label="Eigene Felder als JSON">
            <textarea className={inputClass} name="fields" rows={8} defaultValue={JSON.stringify(user.profile?.fields || {}, null, 2)} />
          </Field>
          <ThemePicker activeTheme={activeTheme} activeMode={activeMode} />
          <Button><Save className="h-4 w-4" /> Profil speichern</Button>
        </form>
      </Panel>
    </AppShell>
  );
}
