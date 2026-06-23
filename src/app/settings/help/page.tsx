import { redirect } from "next/navigation";
import { Download, Eye, Share2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CopyLink } from "@/components/copy-link";
import { PageGuide, PageHeader, Panel } from "@/components/ui";
import { currentSessionContext } from "@/lib/auth";
import { primaryTenantDomain } from "@/lib/tenancy";

export default async function HelpSettingsPage() {
  const { actor, tenant } = await currentSessionContext();
  if (!actor) redirect("/login");
  if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") redirect("/");

  const domain = tenant ? primaryTenantDomain(tenant) : "playplaner.com";
  const baseUrl = `https://${domain}`;
  const previewUrl = `${baseUrl}/docs/benutzeranleitung.html`;
  const pdfUrl = `${baseUrl}/docs/playplaner-benutzeranleitung.pdf`;

  return (
    <AppShell>
      <PageHeader title="Anleitung" subtitle="Benutzerhandbuch als Vorschau, Download und öffentlicher Teilen-Link." />
      <PageGuide title="Öffentliche Benutzeranleitung">
        Die Anleitung liegt im Webspace und ist ohne Login abrufbar. Die Vorschau eignet sich zum Lesen im Browser, der Download ist die PDF-Datei zum Weitergeben oder Ablegen.
      </PageGuide>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-redbrand text-white">
            <Eye className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">Vorschau</h2>
          <p className="mt-2 text-sm leading-6 text-graphite">Öffnet die HTML-Version im Browser. Gut zum schnellen Prüfen auf iPad, iPhone oder Desktop.</p>
          <a
            href="/docs/benutzeranleitung.html"
            className="focus-ring mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-redbrandHover"
          >
            <Eye className="h-4 w-4" /> Vorschau öffnen
          </a>
        </Panel>

        <Panel>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-redbrand text-white">
            <Download className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">Download</h2>
          <p className="mt-2 text-sm leading-6 text-graphite">Lädt die PDF-Anleitung herunter. Die Datei kann archiviert, gedruckt oder extern verschickt werden.</p>
          <a
            href="/docs/playplaner-benutzeranleitung.pdf"
            download
            className="focus-ring mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-redbrand px-4 py-2 text-sm font-semibold text-white hover:bg-redbrandHover"
          >
            <Download className="h-4 w-4" /> PDF herunterladen
          </a>
        </Panel>

        <Panel>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-redbrand text-white">
            <Share2 className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">Teilen</h2>
          <p className="mt-2 text-sm leading-6 text-graphite">Kopiert den öffentlichen PDF-Link. Dieser Link funktioniert ohne Anmeldung.</p>
          <div className="mt-5">
            <CopyLink value={pdfUrl} label="PDF-Link" />
          </div>
        </Panel>
      </div>

      <Panel className="mt-6">
        <h2 className="text-lg font-semibold">Öffentliche Links</h2>
        <div className="mt-4 grid gap-3 text-sm">
          <div className="rounded-md bg-paper p-3">
            <div className="font-semibold text-ink">Vorschau</div>
            <code className="mt-1 block overflow-x-auto text-xs text-graphite">{previewUrl}</code>
          </div>
          <div className="rounded-md bg-paper p-3">
            <div className="font-semibold text-ink">PDF</div>
            <code className="mt-1 block overflow-x-auto text-xs text-graphite">{pdfUrl}</code>
          </div>
        </div>
      </Panel>
    </AppShell>
  );
}
