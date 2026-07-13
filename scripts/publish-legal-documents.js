const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const version = process.env.LEGAL_DOCUMENT_VERSION || "2026-07-14";
const tenantSlugs = (process.env.LEGAL_TENANT_SLUGS || "playplaner,test")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const snapshotDirectory = process.env.LEGAL_SNAPSHOT_DIRECTORY || "/app/logs";

const contactConfiguration = {
  legalResponsibleName: process.env.LEGAL_RESPONSIBLE_NAME,
  legalPostalAddress: process.env.LEGAL_POSTAL_ADDRESS,
  supportEmail: process.env.LEGAL_SUPPORT_EMAIL,
  moderationEmail: process.env.LEGAL_MODERATION_EMAIL,
  privacyEmail: process.env.LEGAL_PRIVACY_EMAIL,
  securityEmail: process.env.LEGAL_SECURITY_EMAIL,
  serverRegion: process.env.LEGAL_SERVER_REGION,
  iosRequiresAgeConfirmation: false
};

const documents = [
  {
    kind: "AGE_NOTICE",
    title: "Hinweis für Erwachsene",
    summary: "Playplaner ist ein privater Planer für volljährige Personen, Paare und vertraute Kreise.",
    required: false,
    requiresReacceptance: false,
    content: `Playplaner richtet sich ausschließlich an volljährige Personen.

Die App unterstützt private Planung, Kommunikation, Dokumentation und freiwillige Abstimmung in vertrauten Kreisen. Sie ist keine öffentliche Dating-, Kontakt- oder Pornografieplattform.

Inhalte mit Minderjährigen, der Verdacht auf Inhalte mit Minderjährigen sowie nicht einvernehmliche, illegale oder gefährliche Inhalte sind verboten und müssen gemeldet werden. Die App ersetzt keine persönliche Kommunikation über Grenzen und Zustimmung. Zustimmung kann jederzeit widerrufen werden.

Die reguläre iOS-Version verwendet die im App Store ausgewiesene Altersfreigabe und diesen klar sichtbaren Hinweis. Ein zusätzliches technisches Bestätigungsfenster kann mandantenbezogen aktiviert werden, ist im Standard jedoch nicht erforderlich.`
  },
  {
    kind: "PRIVACY",
    title: "Datenschutzerklärung",
    summary: "Diese Erklärung beschreibt transparent, welche Daten Playplaner verarbeitet und welche Rechte Nutzer haben.",
    required: true,
    requiresReacceptance: true,
    content: `1. Verantwortlicher und Kontakt

Der Verantwortliche, die ladungsfähige Anschrift sowie Support-, Datenschutz-, Moderations- und Sicherheitskontakte stehen am Ende dieser Seite.

2. Zweck und Rechtsgrundlagen

Playplaner ist ein privater, einladungsbasierter Planer für volljährige Einzelpersonen, Paare und vertraute Kreise. Wir verarbeiten Daten, um Konten, private Kreise, Kalender, gemeinsame Planungen, Chat, Medien, Tracker, Tagebücher, Sammlungen, Benachrichtigungen und Sicherheitsfunktionen bereitzustellen. Rechtsgrundlagen sind insbesondere die Vertragserfüllung, berechtigte Interessen an einem sicheren und funktionsfähigen Dienst, gesetzliche Pflichten sowie eine ausdrückliche Einwilligung bei optionalen Verbindungen.

3. Verarbeitete Daten

Je nach Nutzung verarbeiten wir Kontodaten, Profilinformationen, Kreiszugehörigkeiten, Einladungen, Einstellungen, private Planungen und Zustimmungsstände, Szenen, Spielsachen, Aufträge, Ideen, Kalender- und Tracker-Daten, Tagebuchinhalte, Chatnachrichten, Kommentare, Bilder, Videos, Alben, Dateimetadaten, Push-Gerätekennungen, Anmelde- und Sicherheitsereignisse, Meldungen, Blockierungen sowie sparsame Audit- und Zustellprotokolle. Diese Inhalte können besonders persönliche oder intime Angaben enthalten.

4. Sichtbarkeit und private Kreise

Inhalte werden entsprechend der gewählten Sichtbarkeit verarbeitet: nur für den Nutzer selbst, für ausgewählte Partner, für einen Kreis oder ausdrücklich geteilt. Sichtbarkeit wird nicht automatisch erweitert. Direkte Dateiabrufe unterliegen denselben Berechtigungsprüfungen.

5. Hosting und technische Dienstleister

Die Anwendung und Datenbank werden auf einem Server innerhalb der Europäischen Union betrieben. Für den Betrieb können Hosting, E-Mail-Versand, Apple Push Notification Service und technische Sicherheitsdienste eingesetzt werden. Dienstleister erhalten nur die für den jeweiligen Zweck erforderlichen Daten.

6. Optionale Drittanbieter

Telegram und OpenAI werden nur nach einer eigenen Aktivierung oder einer konkreten Nutzeraktion verwendet. Dabei wird vorab erklärt, welche Daten übertragen werden. Die Einwilligung kann in der App widerrufen werden. Medien werden nicht automatisch an diese Anbieter übertragen. Shopify-Daten werden nur bei aktivierter Shop-Integration importiert. Apple erhält für Push-Mitteilungen eine Gerätekennung und eine standardmäßig diskrete Nachricht. Google FCM wird nur eingesetzt, wenn ein entsprechend konfigurierter Client dies benötigt.

7. Internationale Übermittlungen

Bei optionalen oder plattformbedingten Anbietern außerhalb des Europäischen Wirtschaftsraums können Daten in Drittländer gelangen. Wir beschränken dies auf erforderliche Daten und verwenden die jeweils anwendbaren rechtlichen Schutzmechanismen. Ohne optionale Telegram-, OpenAI- oder Push-Nutzung bleibt die Kernanwendung grundsätzlich nutzbar.

8. Speicherdauer und Löschung

Wir speichern Inhalte, solange das Konto besteht oder sie für den gewählten Zweck benötigt werden. Sicherheits- und Zustellprotokolle werden nur so lange aufbewahrt, wie dies für Betrieb, Missbrauchsschutz oder gesetzliche Pflichten erforderlich ist. Nutzer können Inhalte einzeln löschen, ihren Datenexport anfordern und die vollständige Kontolöschung in der App starten. Dabei werden persönliche Inhalte gelöscht oder, wenn die Integrität gemeinsam genutzter Daten dies zwingend erfordert, zuverlässig anonymisiert. Gesetzlich erforderliche Minimaldaten können für die vorgeschriebene Dauer gesperrt aufbewahrt werden.

9. Medien, Sicherheit und Backups

Übertragungen erfolgen verschlüsselt per TLS. Zugangstoken werden in der iOS-App im Keychain gespeichert. Uploads werden nach Dateisignatur, erlaubtem Typ und Größe geprüft; verdächtige oder gemeldete Inhalte können quarantänisiert werden. Explizite Medien sind in iOS standardmäßig verborgen. Backups werden nur für Wiederherstellung und Betriebssicherheit verwendet und nach dem festgelegten Sicherungszyklus überschrieben.

10. Betroffenenrechte

Nutzer haben im gesetzlichen Rahmen Rechte auf Auskunft, Berichtigung, Datenübertragbarkeit, Einschränkung, Löschung, Widerspruch sowie Widerruf erteilter Einwilligungen. Ein Widerruf wirkt für die Zukunft. Datenschutzanfragen können an den unten genannten Kontakt gerichtet werden. Außerdem besteht ein Beschwerderecht bei einer zuständigen Datenschutzaufsichtsbehörde.

11. Änderungen

Wesentliche Änderungen dieser Erklärung werden versioniert veröffentlicht. Wenn eine erneute Zustimmung erforderlich ist, zeigt die App die neue Fassung vor der weiteren Nutzung der betroffenen Funktionen an.`
  },
  {
    kind: "TERMS",
    title: "Nutzungsbedingungen",
    summary: "Regeln für die private, freiwillige und sichere Nutzung von Playplaner.",
    required: true,
    requiresReacceptance: true,
    content: `1. Geltungsbereich

Playplaner ist ein privater, einladungsbasierter Organisations- und Kommunikationsdienst für volljährige Einzelpersonen, Paare und vertraute Kreise. Es gibt keine öffentliche Partnersuche, keinen anonymen Zufallschat und keine öffentliche Medien-Discovery.

2. Konto und Zugang

Nutzer müssen richtige Zugangsdaten verwenden, ihr Konto schützen und dürfen Einladungen nicht missbräuchlich weitergeben. Die Nutzung ist ausschließlich volljährigen Personen erlaubt. Geräte, Sitzungen und das gesamte Konto können in der App verwaltet beziehungsweise gelöscht werden.

3. Freiwilligkeit und Zustimmung

Gemeinsame Planungen sind Vorschläge. Zustimmung ist nie vorausgewählt, gilt nur für die konkrete Version und kann jederzeit abgelehnt, geändert oder widerrufen werden. Eine Zustimmung in Playplaner ersetzt keine fortlaufende Zustimmung außerhalb der App. Ablehnung oder Widerruf führen zu keiner Bestrafung und keinem Punkteabzug.

4. Sicherheit

Playplaner ist ein Organisationswerkzeug und kein Sicherheits-, Überwachungs- oder Rettungssystem. Push, Chat, Telegram, Tracker und Serververbindungen sind nicht als Notfallhilfe geeignet. Nutzer sind für einen realen Sicherheitsplan, persönliche Kommunikation und den jederzeitigen Abbruch verantwortlich. Gefährliche Atemkontrolle, Einschränkung der Blutzufuhr, nicht einvernehmliche Handlungen und illegale Inhalte sind verboten.

5. Inhalte

Nutzer dürfen nur Inhalte hochladen oder teilen, zu denen sie berechtigt sind und deren Sichtbarkeit sie verantworten können. Verboten sind insbesondere Inhalte mit Minderjährigen oder entsprechendem Verdacht, nicht einvernehmliche Aufnahmen, Belästigung, Drohungen, Gewaltverherrlichung, illegale Inhalte, Spam und Urheberrechtsverletzungen.

6. Melden, Blockieren und Moderation

Fremde Inhalte können gemeldet, ausgeblendet und ihre Verfasser blockiert werden. Dringende Sicherheitsmeldungen werden priorisiert; andere Meldungen sollen innerhalb von 24 bis 48 Stunden geprüft werden. Mögliche Maßnahmen reichen von keiner Verletzung über Ausblenden oder Löschen bis zu Verwarnung, Sperre, Deaktivierung oder Entfernung aus einem Kreis.

7. Verfügbarkeit

Wir bemühen uns um einen zuverlässigen Dienst, garantieren jedoch keine ununterbrochene Verfügbarkeit. Insbesondere Benachrichtigungen und externe Integrationen können verzögert sein oder ausfallen. Geplante oder getrackte Zeiten sind Dokumentation, keine Sicherheitsgarantie.

8. Datenschutz und optionale Dienste

Die Datenschutzerklärung beschreibt die Verarbeitung persönlicher und möglicherweise intimer Daten. Telegram, OpenAI und optionale Benachrichtigungen benötigen eine eigene Aktivierung und können wieder deaktiviert werden.

9. Beendigung und Löschung

Nutzer können Kreise verlassen, Freigaben widerrufen und ihr Konto vollständig löschen. Bei schweren oder wiederholten Regelverstößen kann der Zugang eingeschränkt oder beendet werden. Gemeinsame Inhalte werden dabei gelöscht, privatisiert oder anonymisiert, soweit dies rechtlich und technisch möglich ist.

10. Änderungen

Wesentliche Änderungen werden versioniert veröffentlicht. Erfordert eine neue Fassung eine Zustimmung, wird diese nicht vorausgewählt und kann vor der Annahme gelesen werden.`
  },
  {
    kind: "COMMUNITY_GUIDELINES",
    title: "Community-Regeln",
    summary: "Klare Regeln für Respekt, Einvernehmlichkeit, Privatsphäre und den Schutz aller Beteiligten.",
    required: true,
    requiresReacceptance: true,
    content: `1. Respekt und Einvernehmlichkeit

Behandle andere respektvoll. Vorschläge dürfen abgelehnt, vertagt, geändert oder jederzeit widerrufen werden. Druck, Drohungen, Beschämung und jede Form nicht einvernehmlichen Verhaltens sind unzulässig.

2. Schutz von Minderjährigen

Playplaner ist ausschließlich für Erwachsene. Inhalte mit Minderjährigen oder der Verdacht darauf sind strikt verboten. Solche Inhalte dürfen nicht weitergeleitet werden und müssen unverzüglich über die Meldefunktion oder den Sicherheitskontakt gemeldet werden.

3. Privatsphäre und Rechte

Teile nur Inhalte, die du selbst teilen darfst. Veröffentliche keine Aufnahmen, persönlichen Daten oder intimen Informationen einer anderen Person ohne deren ausdrückliche Erlaubnis. Respektiere gewählte Sichtbarkeiten und widerrufene Freigaben.

4. Verbotene Inhalte

Nicht erlaubt sind nicht einvernehmliche oder illegale Inhalte, Belästigung, Drohungen, Gewalt oder gefährliches Verhalten, Veröffentlichung ohne Zustimmung, Spam, Identitätstäuschung und Urheberrechtsverletzungen. Playplaner darf nicht für Prostitution, öffentliche Kontaktvermittlung oder die Verbreitung pornografischer Inhalte verwendet werden.

5. Körperliche Sicherheit

Keine Funktion der App ist ein Notfall-, Überwachungs- oder Rettungssystem. Plane reale Sicherheitsmaßnahmen, bleibe kommunikationsfähig und beende eine Aktivität sofort, wenn Zustimmung, Wohlbefinden oder Sicherheit nicht mehr gegeben sind.

6. Melden, Ausblenden und Blockieren

Bei fremden Inhalten stehen Melden, Nutzer blockieren und Ausblenden zur Verfügung. Blockierte Personen werden nicht darüber informiert, wer sie blockiert hat. Gemeinsame Kreiszugehörigkeiten können zusätzliche Schritte wie einen Kreisaustritt oder die Unterstützung eines Administrators erfordern.

7. Bearbeitung von Meldungen

Meldungen zu Minderjährigen, unmittelbarer Gefahr, Drohungen oder nicht einvernehmlichen Inhalten werden priorisiert. Sonstige Meldungen werden in der Regel innerhalb von 24 bis 48 Stunden geprüft. Moderationsmaßnahmen werden datensparsam dokumentiert.

8. Folgen von Verstößen

Je nach Schwere können Inhalte ausgeblendet oder gelöscht, Nutzer verwarnt, zeitweise gesperrt, deaktiviert oder aus einem Kreis entfernt werden. Sicherheits- oder Rechtsfälle können an zuständige Stellen eskaliert werden. Entscheidungen werden nicht als öffentliches Druckmittel eingesetzt.`
  }
];

function assertConfiguration() {
  const missing = Object.entries(contactConfiguration)
    .filter(([key, value]) => key !== "iosRequiresAgeConfirmation" && !String(value || "").trim())
    .map(([key]) => key);
  if (missing.length) throw new Error(`Missing legal configuration: ${missing.join(", ")}`);
}

function snapshotPath(slug) {
  return path.join(snapshotDirectory, `legal-publish-${slug}-${version}.json`);
}

async function writeSnapshot(tenant) {
  const filePath = snapshotPath(tenant.slug);
  if (fs.existsSync(filePath)) return;
  fs.mkdirSync(snapshotDirectory, { recursive: true });
  const existingDocuments = await prisma.legalDocument.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, active: true, publishedAt: true }
  });
  const snapshot = {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    version,
    contactConfiguration: {
      legalResponsibleName: tenant.legalResponsibleName,
      legalPostalAddress: tenant.legalPostalAddress,
      supportEmail: tenant.supportEmail,
      moderationEmail: tenant.moderationEmail,
      privacyEmail: tenant.privacyEmail,
      securityEmail: tenant.securityEmail,
      serverRegion: tenant.serverRegion,
      iosRequiresAgeConfirmation: tenant.iosRequiresAgeConfirmation
    },
    documents: existingDocuments
  };
  fs.writeFileSync(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600, flag: "wx" });
}

async function publishForTenant(slug) {
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new Error(`Tenant not found: ${slug}`);
  await writeSnapshot(tenant);

  const existing = await prisma.legalDocument.findMany({ where: { tenantId: tenant.id, version } });
  if (existing.length && existing.length !== documents.length) {
    throw new Error(`Incomplete existing legal version for ${slug}; rollback before retrying`);
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({ where: { id: tenant.id }, data: contactConfiguration });
    await tx.legalDocument.updateMany({ where: { tenantId: tenant.id }, data: { active: false } });
    for (const document of documents) {
      await tx.legalDocument.upsert({
        where: { tenantId_kind_version: { tenantId: tenant.id, kind: document.kind, version } },
        update: { ...document, active: true, publishedAt: now },
        create: { tenantId: tenant.id, version, ...document, active: true, publishedAt: now }
      });
    }
  });
  console.log(`PUBLISHED ${slug} ${version}`);
}

async function rollbackForTenant(slug) {
  const filePath = snapshotPath(slug);
  if (!fs.existsSync(filePath)) throw new Error(`Snapshot not found: ${filePath}`);
  const snapshot = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant || tenant.id !== snapshot.tenantId) throw new Error(`Snapshot tenant mismatch: ${slug}`);

  await prisma.$transaction(async (tx) => {
    await tx.legalDocument.deleteMany({ where: { tenantId: tenant.id, version } });
    await tx.legalDocument.updateMany({ where: { tenantId: tenant.id }, data: { active: false } });
    for (const document of snapshot.documents) {
      await tx.legalDocument.updateMany({
        where: { id: document.id, tenantId: tenant.id },
        data: { active: document.active, publishedAt: document.publishedAt ? new Date(document.publishedAt) : null }
      });
    }
    await tx.tenant.update({ where: { id: tenant.id }, data: snapshot.contactConfiguration });
  });
  console.log(`ROLLED_BACK ${slug} ${version}`);
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "--publish" && mode !== "--rollback") {
    throw new Error("Use --publish or --rollback explicitly");
  }
  if (mode === "--publish") assertConfiguration();
  for (const slug of tenantSlugs) {
    if (mode === "--publish") await publishForTenant(slug);
    else await rollbackForTenant(slug);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
