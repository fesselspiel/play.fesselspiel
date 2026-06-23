import { redirect } from "next/navigation";
import { Save, Signal } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { Field, PageGuide, PageHeader, Panel, selectClass } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { appTimeZone, formatDateTime, formatDateTimeLocal } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

function datePart(value?: Date | null) {
  return formatDateTimeLocal(value).slice(0, 10);
}

function hourPart(value?: Date | null) {
  return formatDateTimeLocal(value).slice(11, 13) || "18";
}

function minutePart(value?: Date | null) {
  const minute = Number(formatDateTimeLocal(value).slice(14, 16) || 0);
  return String(Math.round(minute / 15) * 15).padStart(2, "0").replace("60", "45");
}

function todayBerlinDate() {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: appTimeZone
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value || "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function parseBerlinDateTime(date: string, hour: string, minute: string) {
  const raw = `${date}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:00`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function savePlayReadySettings(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const enabled = formData.get("expiresEnabled") === "on";
  const date = String(formData.get("expiresDate") || "");
  const hour = String(formData.get("expiresHour") || "18");
  const minute = String(formData.get("expiresMinute") || "00");
  const expiresAt = enabled && date ? parseBerlinDateTime(date, hour, minute) : null;
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: { playReadyExpiresAt: expiresAt },
    create: { userId: user.id, playReadyExpiresAt: expiresAt }
  });
  redirect("/settings/play-ready?saved=1");
}

export default async function PlayReadySettingsPage({ searchParams }: { searchParams?: { saved?: string } }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const expiresAt = user.settings?.playReadyExpiresAt || null;
  const hasExpiry = Boolean(expiresAt);
  return (
    <AppShell>
      <PageHeader title="Ampel" />
      <Panel className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-start gap-4">
          <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-redbrand text-white">
            <Signal className="h-7 w-7" />
          </span>
          <div>
            <h2 className="text-xl font-semibold text-ink">Ablaufzeit der Spielampel</h2>
            <p className="mt-2 text-sm leading-6 text-graphite">
              Stelle hier ein, wann deine grüne Ampel automatisch wieder auf Rot springt. Ohne Ablaufzeit bleibt die Anzeige wie bisher.
            </p>
          </div>
        </div>
        {searchParams?.saved ? (
          <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            Ampel-Einstellung gespeichert.
          </div>
        ) : null}
        <form action={savePlayReadySettings} className="space-y-5">
          <label className="flex items-start gap-3 rounded-lg border border-line bg-paper p-4 text-sm text-graphite">
            <input name="expiresEnabled" type="checkbox" defaultChecked={hasExpiry} className="mt-1 h-4 w-4 accent-redbrand" />
            <span>
              <strong className="block text-ink">Automatisch ablaufen lassen</strong>
              <span>Wenn aktiv, wird eine grüne Ampel zum gewählten Zeitpunkt automatisch auf Rot zurückgesetzt.</span>
            </span>
          </label>
          <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
            <Field label="Datum">
              <input
                className={selectClass}
                name="expiresDate"
                type="date"
                defaultValue={datePart(expiresAt) || todayBerlinDate()}
              />
            </Field>
            <Field label="Stunde">
              <select className={selectClass} name="expiresHour" defaultValue={hourPart(expiresAt)}>
                {Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0")).map((hour) => (
                  <option key={hour} value={hour}>{hour} Uhr</option>
                ))}
              </select>
            </Field>
            <Field label="Minute">
              <select className={selectClass} name="expiresMinute" defaultValue={minutePart(expiresAt)}>
                {["00", "15", "30", "45"].map((minute) => (
                  <option key={minute} value={minute}>{minute}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="rounded-md bg-paper p-4 text-sm leading-6 text-graphite">
            Aktuell: {expiresAt ? `läuft ab am ${formatDateTime(expiresAt)}` : "keine Ablaufzeit gesetzt"}
          </div>
          <SubmitButton pendingLabel="Ampel wird gespeichert...">
            <Save className="h-4 w-4" />
            Ampel speichern
          </SubmitButton>
        </form>
      </Panel>
      <PageGuide title="Ampel-Ablaufzeit">
        Die Ablaufzeit betrifft nur deine eigene Spielampel. Wenn deine Ampel grün ist und die Zeit erreicht wird, stellt das System sie automatisch auf Rot und schreibt dazu einen Protokolleintrag.
      </PageGuide>
    </AppShell>
  );
}
