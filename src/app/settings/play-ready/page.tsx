import { redirect } from "next/navigation";
import { Save, Signal } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { Field, PageGuide, PageHeader, Panel, selectClass } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { requireFeature } from "@/lib/features";
import { effectivePlayReadyState, playReadyRemainingText } from "@/lib/play-ready";
import { prisma } from "@/lib/prisma";
import { currentTenant } from "@/lib/tenancy";

const maxDurationMinutes = 12 * 60;

function clampDuration(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return 15;
  return Math.min(maxDurationMinutes, Math.ceil(minutes / 15) * 15);
}

function durationParts(minutes?: number | null) {
  if (!minutes) return { hours: "06", minutes: "00" };
  const diffMinutes = clampDuration(minutes);
  const hours = Math.floor(diffMinutes / 60);
  const restMinutes = diffMinutes % 60;
  return { hours: String(hours).padStart(2, "0"), minutes: String(restMinutes).padStart(2, "0") };
}

function durationFromParts(hours: string, minutes: string) {
  const hourValue = Number(hours);
  const minuteValue = Number(minutes);
  return clampDuration(hourValue * 60 + minuteValue);
}

async function savePlayReadySettings(formData: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  await requireFeature("playReady");
  const hour = String(formData.get("expiresHour") || "1");
  const minute = String(formData.get("expiresMinute") || "00");
  const expiryMinutes = durationFromParts(hour, minute);
  const tenant = await currentTenant();
  const current = await prisma.userSettings.findUnique({ where: { userId: user.id }, select: { playReady: true, playReadyState: true } });
  const expiresAt = effectivePlayReadyState(current) === "green" && tenant?.playReadyExpiryEnabled !== false ? new Date(Date.now() + expiryMinutes * 60_000) : null;
  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: { playReadyExpiryMinutes: expiryMinutes, playReadyExpiresAt: expiresAt },
    create: { userId: user.id, playReadyExpiryMinutes: expiryMinutes, playReadyExpiresAt: expiresAt }
  });
  redirect("/settings/play-ready?saved=1");
}

export default async function PlayReadySettingsPage({ searchParams }: { searchParams?: { saved?: string } }) {
  await requireFeature("playReady");
  const user = await currentUser();
  if (!user) redirect("/login");
  const tenant = await currentTenant();
  const expiresAt = user.settings?.playReadyExpiresAt || null;
  const expiryMinutes = user.settings?.playReadyExpiryMinutes || 360;
  const parts = durationParts(expiryMinutes);
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
              Stelle hier ein, wie lange deine grüne Ampel ab jetzt gültig bleibt. Der Ablauf gilt für diese Seite standardmäßig automatisch.
            </p>
          </div>
        </div>
        {searchParams?.saved ? (
          <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            Ampel-Einstellung gespeichert.
          </div>
        ) : null}
        <form action={savePlayReadySettings} className="space-y-5">
          {tenant?.playReadyExpiryEnabled === false ? (
            <div className="rounded-lg border border-line bg-paper p-4 text-sm leading-6 text-graphite">
              Der automatische Ablauf ist für diese Seite von einem Admin deaktiviert. Deine Dauer bleibt gespeichert und wird wieder genutzt, sobald der Ablauf aktiviert wird.
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Stunde">
              <select className={selectClass} name="expiresHour" defaultValue={parts.hours}>
                {Array.from({ length: 13 }, (_, hour) => String(hour).padStart(2, "0")).map((hour) => (
                  <option key={hour} value={hour}>{Number(hour)} {Number(hour) === 1 ? "Stunde" : "Stunden"}</option>
                ))}
              </select>
            </Field>
            <Field label="Minute">
              <select className={selectClass} name="expiresMinute" defaultValue={parts.minutes}>
                {["00", "15", "30", "45"].map((minute) => (
                  <option key={minute} value={minute}>{Number(minute)} Minuten</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="rounded-md bg-paper p-4 text-sm leading-6 text-graphite">
            Gespeichert: {`${Math.floor(expiryMinutes / 60)} Stunden ${expiryMinutes % 60} Minuten ab Grün-Schaltung`}
            <br />
            Aktuelle grüne Ampel: {expiresAt ? playReadyRemainingText(expiresAt, new Date()) : tenant?.playReadyExpiryEnabled === false ? "Ablauf ist deaktiviert" : "nicht aktiv"}
            <br />
            Maximum: 12 Stunden ab dem Speichern.
          </div>
          <SubmitButton pendingLabel="Ampel wird gespeichert...">
            <Save className="h-4 w-4" />
            Ampel speichern
          </SubmitButton>
        </form>
      </Panel>
      <PageGuide title="Ampel-Ablaufzeit">
        Die Ablaufzeit betrifft nur deine eigene Spielampel. Wenn deine Ampel grün ist und die relative Zeit abgelaufen ist, stellt das System sie automatisch auf Gelb/Flexibel und schreibt dazu einen Protokolleintrag.
      </PageGuide>
    </AppShell>
  );
}
