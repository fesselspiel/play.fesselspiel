import Link from "next/link";
import type { LegalDocumentKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { currentTenant } from "@/lib/tenancy";

const legalLinks = [
  { href: "/privacy", label: "Datenschutz" },
  { href: "/terms", label: "Nutzungsbedingungen" },
  { href: "/community-guidelines", label: "Community-Regeln" },
  { href: "/support", label: "Support" }
];

export async function PublicLegalPage({ kind }: { kind: LegalDocumentKind }) {
  const tenant = await currentTenant();
  const document = await prisma.legalDocument.findFirst({
    where: { tenantId: tenant.id, kind, active: true, publishedAt: { not: null } },
    orderBy: { publishedAt: "desc" }
  });
  const contacts = [
    tenant.supportEmail ? `Support: ${tenant.supportEmail}` : null,
    tenant.moderationEmail ? `Moderation: ${tenant.moderationEmail}` : null,
    tenant.privacyEmail ? `Datenschutz: ${tenant.privacyEmail}` : null,
    tenant.securityEmail ? `Sicherheit: ${tenant.securityEmail}` : null
  ].filter(Boolean);

  return (
    <main className="min-h-screen bg-surface px-5 py-10 text-ink">
      <article className="mx-auto max-w-3xl rounded-lg border border-line bg-paper p-6 shadow-sm sm:p-10">
        <Link href="/login" className="text-sm font-semibold text-redbrand">{tenant.name}</Link>
        <h1 className="mt-4 text-3xl font-semibold">{document?.title || "Information wird aktualisiert"}</h1>
        {document ? (
          <>
            <p className="mt-3 text-sm text-graphite">Version {document.version} · veroeffentlicht {document.publishedAt?.toLocaleDateString("de-DE")}</p>
            <p className="mt-6 text-lg leading-8">{document.summary}</p>
            <div className="mt-8 whitespace-pre-wrap text-sm leading-7 text-graphite">{document.content}</div>
          </>
        ) : (
          <p className="mt-6 leading-7 text-graphite">Dieses Dokument ist derzeit nicht veroeffentlicht. Bitte wende dich an den Support.</p>
        )}
        <section className="mt-10 border-t border-line pt-6 text-sm leading-6 text-graphite">
          <h2 className="font-semibold text-ink">Verantwortlicher und Kontakt</h2>
          <p className="mt-2 whitespace-pre-wrap">{tenant.legalResponsibleName || "Nicht konfiguriert"}{tenant.legalPostalAddress ? `\n${tenant.legalPostalAddress}` : ""}</p>
          {contacts.map((contact) => <p key={contact}>{contact}</p>)}
          {tenant.serverRegion ? <p>Serverregion: {tenant.serverRegion}</p> : null}
        </section>
        <nav className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-6 text-sm font-semibold text-redbrand" aria-label="Rechtliches und Support">
          {legalLinks.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
        </nav>
      </article>
    </main>
  );
}
