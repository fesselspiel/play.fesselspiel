import { redirect } from "next/navigation";
import { ArchiveRestore, DatabaseBackup, Download, Upload } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button, Field, inputClass, PageGuide, PageHeader, Panel } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { requireFeature } from "@/lib/features";

type DataSearchParams = {
  imported?: string;
  error?: string;
  files?: string;
  media?: string;
  toys?: string;
  positions?: string;
};

export default async function DataSettingsPage(props: { searchParams: Promise<DataSearchParams> }) {
  const searchParams = await props.searchParams;
  await requireFeature("dataTransfer");
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/");

  return (
    <AppShell>
      <PageHeader title="Daten" />
      <PageGuide title="Daten und geschuetzte Dateien sichern oder wiederherstellen">
        Exportiere deine sichtbaren Portal-Inhalte als ZIP-Datei inklusive Fotos und Videos. Beim Import werden die Inhalte dem aktuell angemeldeten Benutzer hinzugefuegt; bestehende Daten werden nicht gelöscht oder überschrieben.
      </PageGuide>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-md bg-redbrand p-2 text-white">
              <DatabaseBackup className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-ink">Export</h2>
              <p className="mt-1 text-sm leading-6 text-graphite">
                Erstellt ein ZIP-Archiv mit Spielsachen, Szenen, Aktivitäten, Sessions, Bildern, Alben, Terminen und den zugehörigen geschuetzten Dateien.
              </p>
            </div>
          </div>
          <a
            href="/api/settings/data-transfer"
            className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white transition hover:bg-redbrandHover"
          >
            <Download className="h-4 w-4" />
            Export herunterladen
          </a>
          <div className="mt-4 rounded-md bg-paper p-3 text-sm leading-6 text-graphite">
            Passwörter, Login-Tokens, Telegram-Token und OpenAI-Keys werden nicht exportiert.
          </div>
        </Panel>

        <Panel>
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-md bg-paper p-2 text-redbrand">
              <ArchiveRestore className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-ink">Import</h2>
              <p className="mt-1 text-sm leading-6 text-graphite">
                Importiert ein Fesselspiel-ZIP und haengt die Inhalte an dein Konto an. Slugs werden automatisch angepasst, falls sie schon existieren.
              </p>
            </div>
          </div>

          {searchParams.imported ? (
            <div className="mb-4 rounded-md bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
              Import abgeschlossen: {searchParams.files || "0"} Dateien, {searchParams.media || "0"} Bilder, {searchParams.toys || "0"} Spielsachen und {searchParams.positions || "0"} Szenen.
            </div>
          ) : null}
          {searchParams.error ? (
            <div className="mb-4 rounded-md bg-redbrand/10 p-3 text-sm font-semibold text-redbrand">
              Import fehlgeschlagen: {searchParams.error === "missing" ? "Bitte eine ZIP-Datei auswählen." : searchParams.error}
            </div>
          ) : null}

          <form action="/api/settings/data-transfer" method="post" encType="multipart/form-data" className="space-y-4">
            <Field label="Export-ZIP">
              <input className={inputClass} name="archive" type="file" accept=".zip,application/zip" required />
            </Field>
            <Button>
              <Upload className="h-4 w-4" />
              Import starten
            </Button>
          </form>
        </Panel>
      </div>
    </AppShell>
  );
}
