import Link from "next/link";
import { currentTenant } from "@/lib/tenancy";

export default async function SupportPage() {
  const tenant = await currentTenant();
  const contacts = [
    { label: "Support", value: tenant.supportEmail },
    { label: "Moderation", value: tenant.moderationEmail },
    { label: "Datenschutz", value: tenant.privacyEmail },
    { label: "Sicherheit", value: tenant.securityEmail }
  ].filter((entry): entry is { label: string; value: string } => Boolean(entry.value));
  return (
    <main className="min-h-screen bg-surface px-5 py-10 text-ink">
      <article className="mx-auto max-w-2xl rounded-lg border border-line bg-paper p-6 shadow-sm sm:p-10">
        <Link href="/login" className="text-sm font-semibold text-redbrand">{tenant.name}</Link>
        <h1 className="mt-4 text-3xl font-semibold">Support und Sicherheit</h1>
        <p className="mt-5 leading-7 text-graphite">Bei Fragen, Datenschutzanliegen oder einer Meldung erreichst du die passende Stelle direkt per E-Mail. Dringende Sicherheitsmeldungen werden priorisiert bearbeitet; sonstige Meldungen innerhalb von 24 bis 48 Stunden.</p>
        <div className="mt-8 divide-y divide-line border-y border-line">
          {contacts.length ? contacts.map((entry) => (
            <a key={entry.label} href={`mailto:${entry.value}`} className="flex min-h-14 items-center justify-between gap-4 py-3 font-semibold text-redbrand">
              <span>{entry.label}</span><span className="text-right text-sm">{entry.value}</span>
            </a>
          )) : <p className="py-5 text-graphite">Kontaktdaten sind noch nicht konfiguriert.</p>}
        </div>
        <nav className="mt-8 flex flex-wrap gap-5 text-sm font-semibold text-redbrand">
          <Link href="/privacy">Datenschutz</Link>
          <Link href="/terms">Nutzungsbedingungen</Link>
          <Link href="/community-guidelines">Community-Regeln</Link>
        </nav>
      </article>
    </main>
  );
}
