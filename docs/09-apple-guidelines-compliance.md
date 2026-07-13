# Apple App Store Compliance und Rueckbauprotokoll

Stand: 2026-07-13

Diese Datei ist das kanonische Protokoll fuer den App-Store-Umbau von Playplaner. Sie dokumentiert Bestandsaufnahme, Entscheidungen, Datenbankmigrationen, API-Vertraege, iOS-Aenderungen, Tests und den Rueckbau jeder Massnahme. Sie ist kein Ersatz fuer Rechtsberatung. Rechtstexte, Aufbewahrungsfristen, Anbieterlisten und Kontaktangaben muessen vor der Einreichung fachlich und rechtlich freigegeben werden.

## Ziel und unveraenderter Produktkern

Playplaner bleibt ein privater, einladungsbasierter Planer fuer volljaehrige Einzelpersonen, Paare und vertraute Kreise. Kalender, gemeinsame Planung, Zustimmung, Chat, private Sammlungen, Tagebuch, Tracker und Erinnerungen bleiben der Kern. Der Umbau entfernt nicht die persoenliche Sprache oder die vertraute Kreisstruktur. Er begrenzt den dauerhaft in iOS sichtbaren Funktionsumfang dort, wo oeffentliche, explizite oder koerperlich riskante Nutzung entstehen koennte, und fuegt nachvollziehbare Schutzrechte hinzu.

Es gibt keinen nur fuer App Review sichtbaren Modus. Die iOS-Produktkonfiguration gilt dauerhaft fuer alle regulaeren iOS-Benutzer. Interne Kompatibilitaetsnamen in Datenbank und API duerfen waehrend der additiven Migration erhalten bleiben, wenn sie nicht als irrefuehrende oder riskante Nutzertexte erscheinen.

## Offizielle Pruefgrundlage

Massgeblich sind die jeweils aktuellen Apple-Dokumente:

- App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Account Deletion: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Age Rating: https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/

Besonders relevant sind 1.1.4, 1.2, 1.4.5, 1.5, 1.6, 2.1, 2.3, 3.1, 4.2 und 5.1.1. Apple verlangt fuer UGC insbesondere Filterung, Melden, Blockieren und erreichbare Kontaktdaten. Apps mit Kontoerstellung muessen die vollstaendige Kontoloeschung in der App anstossen koennen. Reife Webinhalte duerfen nur beilaufig vorkommen, muessen standardmaessig verborgen sein und duerfen nicht den primaeren App-Zweck bilden.

## Bestandsaufnahme vor Aenderungen

### Bereits vorhanden

- Native SwiftUI-App mit nativer Navigation fuer Dashboard, Kalender, Tracker, Chat, Medien und Einstellungen.
- Benutzerlogin statt sichtbarer API-Token-Eingabe.
- Bearer-Token werden in der iOS-App im Keychain gespeichert.
- Geschuetzte Dateiabrufe pruefen Benutzer-, Mandanten-, Kreis- und Sichtbarkeitskontext.
- Native Push-Geraeteregistrierung und einzelnes Deaktivieren eines Geraeteregistrierungstokens.
- Kontextbezogene Erklaerung vor der nativen Push-Berechtigungsfrage.
- Uploadgroessenlimit und teilweise Erkennung von PNG, JPEG, WebP, GIF, MP4 und PDF anhand der Dateibytes.
- Einladungsbasierte Mandanten- und Kreisstruktur ohne oeffentliche Discovery oder anonymen Zufallschat.
- Native App-Funktionalitaet geht deutlich ueber einen WebView-Wrapper hinaus.

### P0-Luecken

- Keine versionierte 18+-Bestaetigung und keine serverseitige Zugriffssperre vor der Bestaetigung.
- Keine leicht auffindbare echte Self-Service-Kontoloeschung. `active=false` waere unzureichend.
- Stateless signierte Websessions koennen aktuell nicht zentral sofort widerrufen werden.
- API-Token koennen serverseitig noch aus URL-Queryparametern gelesen werden.
- Keine versionierten Datenschutz-/Nutzungsdokumente und keine revisionsfaehigen Zustimmungen.
- Keine oeffentliche, produktbezogene Datenschutz-, Community- und Supportseite als vollstaendiger P0-Stand.
- Kein einheitliches Melden-, Blockieren-, Ausblenden- und Moderationsmodell fuer UGC.
- Keine dauerhaft erzwungene Sperre fuer Nachrichten, Shares, Einladungen und Push zwischen blockierten Benutzern.
- Keine Inhaltsklassifikation `SAFE`, `MATURE_SUGGESTIVE`, `EXPLICIT`, `UNKNOWN`, `QUARANTINED`.
- Unbekannte Dateitypen koennen noch anhand des deklarierten MIME-Typs gespeichert werden; keine Malwarepruefung und keine Quarantaene-Pipeline.
- Push kann Audit-Titel, Audit-Text und Bild-URL in die Payload uebernehmen; ein diskreter Modus ist nicht systemweit erzwungen.
- Auftragslogik ist im Backend und in Kompatibilitaetsrouten vorhanden. Fuer iOS Version 1 fehlen noch die vollstaendige freiwillige Zustimmung, Aenderungsvorschlaege und der jederzeitige Widerruf.
- Kein App-Review-Demomandant mit ausschliesslich neutralen Beispieldaten und dokumentierten Testfaellen.
- Keine nachgewiesene biometrische App-Sperre, Inaktivitaetssperre oder Privacy-Overlay im App Switcher.
- Keine `PrivacyInfo.xcprivacy` im iOS-Projekt.
- Keine automatisierte Backend-Testkonvention und kein eingechecktes Dependency-Lockfile im analysierten Backendstand.

### P1/P2-Luecken

- Kein nativer maschinenlesbarer Datenexport fuer normale Benutzer.
- Keine vollstaendige Sitzungsverwaltung mit einzelnem und globalem Widerruf.
- Keine getrennt widerrufbaren Einwilligungen fuer Telegram, OpenAI und optionale Analyse.
- Keine automatisierte Aufbewahrungs- und Loeschfrist-Pipeline.
- Accessibility-, Dynamic-Type- und iPad-Nachweise sind fuer die neuen Compliance-Flows noch nicht vorhanden.

## Sicherheits- und Architekturentscheidungen

### Additive Datenbankmigrationen

Bestehende Spalten und Modelle werden in der P0-Phase nicht destruktiv umbenannt oder geloescht. Neue Modelle und nullable Felder werden additiv eingefuehrt. Erst nach erfolgreichem Produktionsnachweis kann in einem separaten spaeteren Projekt eine Bereinigung erfolgen.

Geplante additive Bereiche:

1. `LegalDocument` und `UserLegalAcceptance` fuer versionierte Alters-, Datenschutz-, Nutzungs- und Community-Hinweise.
2. `UserConsentPreference` fuer optionale Telegram-, OpenAI-, Push- und Analyse-Einwilligungen.
3. `User.sessionRevision` fuer sofort widerrufbare Websessions.
4. `AccountDeletionJob` fuer idempotente, nachvollziehbare und wiederaufnehmbare Loeschlaeufe.
5. `ContentReport`, `UserBlock` und Moderationsfelder fuer UGC-Schutz.
6. Inhaltsklassifikation und Sicherheitsstatus an `FileAsset`/`Media` sowie ein datensparsames Pruefprotokoll.
7. Revisionsmodell fuer gemeinsam geplante Aktivitaeten und widerrufbare Zustimmung.
8. Eine dokumentierte, dauerhafte iOS-Produktkonfiguration pro Tenant beziehungsweise Distribution Channel.

Jede Migration erhaelt:

- Vorwaerts-SQL oder eine reproduzierbare Prisma-Migration.
- eine Rueckbauanweisung, die neue Constraints/Tabellen nur entfernt, wenn keine von ihnen benoetigten Produktionsdaten mehr existieren.
- einen Vorab- und Nachher-Test.
- einen Eintrag in der Aenderungstabelle dieser Datei.

### Kontoloeschung

Die Loeschung selbst ist nach Bestaetigung absichtlich nicht rueckgaengig zu machen. Rueckbaubar sind nur Code, Routen und additive Datenbankstruktur. Der Ablauf wird idempotent:

1. Identitaet und Bestaetigung pruefen.
2. Loeschjob atomar anlegen und neue Logins sperren.
3. Sessionrevision erhoehen, API-Token deaktivieren und Push-Geraete deaktivieren.
4. Share-, Invite-, Reset- und Verifikationstoken widerrufen.
5. Dateien zuerst im Job inventarisieren, Beziehungen transaktional loeschen/anonymisieren und Storage danach idempotent bereinigen.
6. Nur Job-ID, Status, Zeitpunkte, Fehlerklasse und gesetzlich notwendige Minimaldaten protokollieren; keine geloeschten Inhalte in Auditlogs kopieren.
7. Login und Dateiabruf nach Beginn beziehungsweise Abschluss separat testen.

Ein letzter Tenant-Admin wird nicht still geloescht. Die API liefert einen klaren Konflikt mit den erlaubten naechsten Schritten: anderen Admin bestimmen oder Tenant-Loeschung in einem getrennten, ausdruecklichen Flow.

### Auftraege und dauerhafte iOS-Funktionsgrenze

Auftraege bleiben als echter Produktbestandteil erhalten. Sichtbare Oberflaechen verwenden ausschliesslich `Auftrag` beziehungsweise `Auftraege`. Die bisherige Szeneneigenschaft wird als `Kann beauftragt werden` angezeigt. Interne Kategorien, Events, Funktionsnamen und das Legacy-Feld `selfBondageCapable` bleiben waehrend der additiven Migration kompatibel und werden nicht als Nutzertexte ausgegeben.

Der neutrale API-Alias lautet `canBeCommissioned`. Backend und iOS akzeptieren beziehungsweise liefern waehrend der Uebergangsphase beide Felder mit demselben Wahrheitswert. Dadurch ist kein destruktives Datenbank-Rename erforderlich und ein Rueckbau bleibt moeglich.

Fuer iOS gelten dauerhaft:

- Auftraege sind freiwillige private Vorschlaege, keine Challenges oder erzwungenen Durchfuehrungen,
- Zustimmung ist nicht vorausgewaehlt und gilt nur fuer die konkrete Version,
- Ablehnen, spaeter entscheiden, Aenderung vorschlagen und Widerrufen muessen gleichwertig erreichbar sein,
- keine Bestrafung, Punkteabzug oder automatische Verlaengerung bei Ablehnung oder Abbruch,
- generische private Sessionanfragen, Kalender und freiwillige Planung bleiben erhalten,
- Shopify-Produkte bleiben neutrale physische Produkt-/Ausrustungsreferenzen,
- explizite Medien sind standardmaessig verborgen und koennen in iOS nicht zu einer oeffentlichen Galerie oder Discovery-Flaeche werden.

Die Grenze wird serverseitig als normale Produktkonfiguration und in den externen Capabilities offengelegt. Sie ist weder geheim noch zeitlich an App Review gekoppelt.

### Push

`DISCREET` ist der dauerhafte Standard. In diesem Modus enthaelt die APNs-Notification nur neutrale Texte und ein nicht sensibles Routingziel. Keine Bild-URL, intime Titel, Notiz, Ausruestung, Dauer oder Position gelangt in die Notification. `TITLE` und `FULL` duerfen nur nach ausdruecklicher Nutzerauswahl aktiv werden; `FULL` benoetigt eine klare Warnung.

### Uploads und Medien

- Erlaubte Dateitypen werden anhand tatsaechlicher Bytes erkannt.
- Nicht erkannte oder nicht erlaubte Dateien werden abgelehnt, nicht als deklarierter MIME-Typ uebernommen.
- Neue nutzergenerierte Medien beginnen als `UNKNOWN` und sind bis zur sicheren Verarbeitung nicht allgemein sichtbar.
- `QUARANTINED` ist in normalen Datei- und Feed-Endpunkten nicht abrufbar.
- Malwarepruefung wird hinter einer klaren Scanner-Schnittstelle implementiert. Ein nicht konfigurierter Scanner darf nicht als erfolgreiche Pruefung dargestellt werden.
- Explizite Vorschaubilder werden in iOS vollstaendig verdeckt; Push enthaelt nie eine Medienvorschau.

## Dateibezogener Implementierungsplan

### Backend

- `prisma/schema.prisma`: additive Compliance-Modelle, Relationen, Sessionrevision, Medienklassifikation.
- `prisma/migrations/...`: reproduzierbare Vorwaertsmigration; keine `db push --accept-data-loss`-Abkuerzung.
- `src/lib/auth.ts`: Sessionrevision signieren und bei jedem Request pruefen; zentrale Widerrufsfunktion.
- `src/lib/api-tokens.ts`: Query-Token fuer regulaere API-Authentifizierung entfernen; Bearer-Header verlangen.
- `src/lib/files.ts`: strikte Allowlist, Bytegrenzen, Sicherheitsstatus, Quarantaene und idempotente Storage-Loeschung.
- `src/lib/native-push-notifications.ts`: diskrete Vorschau als Standard, blockierte Absender ausschliessen, keine Medienvorschau.
- `src/lib/compliance/*`: Alters-/Legalstatus, Blockregeln, Moderation, Loeschjob und Content-Safety als getrennte Fachmodule.
- `src/app/api/external/compliance/*`: Status, 18+-Bestaetigung, Dokumentzustimmung und optionale Einwilligungen.
- `src/app/api/external/account/*`: Loeschstatus, Loeschstart, Datenexport und Sitzungswiderruf.
- `src/app/api/external/reports/*` und `blocks/*`: Melden, Blockieren, Entblocken, Kreisfolgen.
- `src/app/api/external/moderation/*`: ausschliesslich Admin, auditierbare Bearbeitung und Massnahmen.
- `src/app/privacy`, `terms`, `community-guidelines`, `support`: ohne Login erreichbar.
- Bestehende Chat-, Share-, Invite-, Datei-, Feed- und Pushrouten: zentrale Block-/Quarantaenepruefung anwenden.
- `scripts/seed-review-tenant.*`: idempotenter neutraler App-Review-Mandant ohne Produktivdaten.
- `tests/*`: Integrationstests fuer Account, UGC, Visibility, Consent, Media und Reviewzugang.

### Native iOS-App

- `PlayPlanerModels.swift`: typisierte Compliance-, Legal-, Deletion-, Report-, Block-, Session- und Privacy-Modelle.
- `PlayPlanerAPI.swift`: ausschliesslich Bearer-authentifizierte typisierte Requests fuer neue Contracts.
- `ContentView.swift`: 18+-Gate vor sensiblen Bereichen, Datenschutz-und-Konto-Navigation, Melden/Blockieren, diskrete Push-Einstellung und dauerhafte iOS-Funktionsgrenze.
- Neue kleine SwiftUI-Dateien fuer Compliance-Flows statt weiterer monolithischer Erweiterung von `ContentView.swift`.
- `KeychainStore.swift`: Tokenzugriff behalten; lokale Sperrkonfiguration getrennt speichern.
- `playplanerApp.swift`: Privacy-Overlay und optionale biometrische/Inaktivitaetssperre.
- `Info.plist`: Zwecktexte final pruefen; keine Berechtigung vor konkreter Aktion.
- `PrivacyInfo.xcprivacy`: verwendete Datenkategorien und Required-Reason-APIs deklarieren.
- `docs/build-prompt.md`: kanonischen neuen iOS-Stand, API-Vertraege, Screenshot-Hooks und Tests fortschreiben.

## Umsetzungszyklen

### Zyklus A - Rechtsgrundlage und optionales Altersgate

- additive Schema- und API-Vertraege
- oeffentliche Legal-/Supportseiten
- Altersfreigabe primaer ueber App-Store-Rating, Produkttext und Nutzungsbedingungen
- optionales, serverseitig steuerbares 18+-Gate nur fuer Mandanten, die es ausdruecklich benoetigen
- native nicht vorausgewaehlte Bestaetigung nur bei aktivierter Mandantenoption
- Tests fuer alte, fehlende und aktuelle Dokumentversion

### Zyklus B - Konto, Sessions und Daten

- Sessionrevision und Tokenwiderruf
- vollstaendige Self-Service-Kontoloeschung
- idempotenter Loeschjob und Storage-Bereinigung
- Datenexport und native Kontoverwaltung
- letzter-Admin-Schutz und Integrationstests

### Zyklus C - UGC und Moderation

- Melden, Blockieren, Ausblenden und Kreis verlassen
- zentrale Durchsetzung in Chat, Shares, Invites, Push und Dateiabruf
- Admin-Moderation und SLA-Dokumentation
- Tests mit zwei normalen Benutzern und einem Admin

### Zyklus D - Medien, Push und iOS-Sicherheit

- Medienklassifikation, Quarantaene, strikte Dateipruefung und Scanner-Schnittstelle
- diskrete Push-Vorschau
- Privacy-Overlay, Biometrie, Inaktivitaet, Privacy Manifest
- Self-Bondage-Funktionsgrenze fuer iOS Version 1

### Zyklus E - Review-Mandant und Abnahme

- neutraler Review-Mandant und reversible Seed-/Cleanup-Befehle
- App Review Notes und Store-Metadaten
- iPhone-/iPad-/Accessibility-Screenshots
- vollstaendige Readiness-Matrix und Restrestrisiken

## Aenderungs- und Rueckbautabelle

| Datum | Zyklus | Aenderung | Vorwaertsweg | Rueckbau | Test/Nachweis | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-07-13 | Inventur | Isolierter Worktree `Codex/kink-social-platform` auf Branch `app-store-compliance` aus `origin/master` angelegt | Keine Produktivwirkung | Worktree und Branch entfernen; anderer lokaler Checkout bleibt unberuehrt | `git status --short --branch` sauber auf `623afc1` | Erfuellt |
| 2026-07-13 | Inventur | Diese Compliance- und Rueckbauakte angelegt | Dokument committen | Dokumentdatei entfernen | Review gegen Quellcode und offizielle Apple-Dokumente | In Arbeit |
| 2026-07-13 | Begriffe | Sichtbare Auftragsbegriffe neutralisiert und `canBeCommissioned` als additiven API-Alias eingefuehrt | Backend und iOS verstehen neuen Alias, Legacy-Feld bleibt erhalten | Nutzertexte zuruecksetzen und Alias entfernen; keine Datenmigration erforderlich | Prisma/TypeScript und Fastlane-Simulator-Build erfolgreich; Screenshot `/tmp/playplaner-appstore-order-wording-20260713.png` | Erfuellt |
| 2026-07-13 | Tokens | Regulaere externe API-Authentifizierung auf Bearer-Header beschraenkt; geschuetzte Download-URLs enthalten keine Tokens mehr | `tokenFromRequest` liest nur `Authorization: Bearer`; Serializer liefern `downloadUrlWithToken: null` | Code-Revert moeglich, aus Sicherheitsgruenden nicht empfohlen; keine Datenmigration | TypeScript erfolgreich; Query-Token-Nutzung per Quellcodesuche ausgeschlossen | Erfuellt |
| 2026-07-13 | Kontoloeschung | Fehlgeschlagene Storage-Bereinigung behaelt ID und `storagePath` im Loeschjob | Retry kann die physische Datei weiterhin eindeutig adressieren | Feldinhalt leeren; keine Schemaaenderung | TypeScript erfolgreich; Integrationstest folgt | In Arbeit |
| 2026-07-13 | Legal/18+ | Versionierte Pflichtdokumente und optionales Altersgate; `iosRequiresAgeConfirmation` ist standardmaessig `false` | App-Store-Altersfreigabe und klare Hinweise sind der Standard; Mandanten koennen das native nicht vorausgewaehlte Gate ausdruecklich aktivieren | Boolean auf `false` setzen oder additive Spalte/Swift-Feld entfernen; Akzeptanzen bleiben als Nachweis | Prisma/TypeScript und erneuter Fastlane-Simulator-Build folgen | In Arbeit |
| 2026-07-13 | Self-Service-Loeschung | Zweistufiger nativer Flow unter `Datenschutz & Konto` nutzt echten DELETE-Vertrag | Folgen anzeigen, `KONTO LOESCHEN` verlangen, Token nach Erfolg lokal entfernen | SwiftUI-Navigation und Route koennen entfernt werden; bereits vollzogene Loeschungen bleiben irreversibel | Backend-Integrationstest und finaler Simulator-Screenshot folgen | In Arbeit |
| 2026-07-13 | UGC-Schutz | Typisierte Melde- und Blockiervertraege sowie native Schutzmenues fuer fremde Chatnachrichten, Medien und Medienkommentare | Blockierte Absender aus Chat, Receipts, Push und Medienabrufen ausschliessen; Moderation kann Inhalte zentral verbergen | Additive Tabellen/Routes und `SafetyViews.swift` rueckbauen; bestehende Meldedaten vor Tabellenloeschung exportieren | TypeScript erfolgreich; Fastlane- und Screenshot-Nachweis folgt | In Arbeit |
| 2026-07-13 | Lokaler Schutz/Push | Diskrete Push-Vorschau als Standard, optionaler lokaler Biometrie-/Geraetecode-Lock und App-Switcher-Overlay | UserSettings per GET/PATCH aktualisieren; App-Sperre bleibt nur lokal und freiwillig | Preview-Feld auf `DISCREET` setzen; SwiftUI-Wrapper/Settings entfernen; Manifestdaten separat mit Store-Angaben synchron halten | Plist-Lint und TypeScript erfolgreich; Fastlane-/Simulatornachweis folgt | In Arbeit |

## Aktueller P0-Status

| Anforderung | Status | Bemerkung |
| --- | --- | --- |
| Altersfreigabe | In Arbeit | Kein hartes Gate im Standard. App-Store-Rating, Hinweise und Bedingungen tragen die Alterspositionierung; optionales Mandantengate ist reversibel vorhanden. |
| Vollstaendige Kontoloeschung | In Arbeit | Backend-Loeschjob und nativer zweistufiger Flow vorhanden; umfassender Integrationstest offen |
| Datenschutzerklaerung/Terms/Community | In Arbeit | Oeffentliche Seiten und sicherer Publish-Vertrag vorhanden; rechtlich freigegebene Endtexte/Kontakte muessen manuell eingetragen werden |
| Melden und Blockieren | In Arbeit | Backendvertraege und erste native Kernflaechen vorhanden; Profile, Szenen, Aktivitaeten und weitere Freigaben muessen noch vollstaendig nachgezogen und live getestet werden. |
| Moderationsprozess | Offen | Admin-Workflow und SLA fehlen |
| Diskrete Push-Nachrichten | Offen | Aktuell koennen Audit-Titel, Body und Bild-URL versendet werden |
| Sicherer Medienumgang | In Arbeit | Byte-Signatur, MIME-Allowlist, Groessenlimit, Klassifikation und serverseitige Quarantaene sind produktiv. Die Entscheidung ueber einen vollwertigen externen Malware-Scanner bleibt offen. |
| Auftrags- und Risikoreduzierung | In Arbeit | Neutrale Nutzertexte und API-Alias vorhanden; versionierte Zustimmung und Widerruf fehlen noch |
| Demo-Account/Mandant | Offen | Neutraler idempotenter Review-Seed fehlt |
| Echte native Funktionalitaet | Erfuellt | SwiftUI-App mit nativen Kernflows |
| Sichere Tokenablage | Erfuellt | iOS Keychain vorhanden; regulaere API nur per Bearer-Header, keine Download-Token in URLs |

## Manuelle Freigaben vor Einreichung

Folgende Punkte koennen nicht allein durch Code als rechtlich oder organisatorisch abgeschlossen gelten:

- Verantwortlicher, ladungsfaehiger Kontakt sowie Datenschutz-, Support-, Moderations- und Sicherheitskontakte.
- Rechtsgrundlagen, Speicherdauern, Auftragsverarbeiter, Drittlandtransfers und Backup-Loeschfristen.
- tatsaechlich eingesetzte Infrastruktur, Serverstandorte und Unterauftragnehmer.
- Apple-Altersfragebogen und regionale Verfuegbarkeit.
- Monetarisierungsmodell und gegebenenfalls StoreKit/IAP.
- Moderationsbereitschaft und Erreichbarkeit waehrend des zugesagten SLA.
- finale neutrale Review-Daten und App-Store-Screenshots.

## Zyklus 5: Datenschutz-, Push- und Geraeteschutz

- Der typisierte Vertrag `GET/PATCH /api/external/account/privacy-settings` liest und speichert `notificationPreviewMode` ausschliesslich als `DISCREET`, `TITLE` oder `FULL`. Unbekannte Werte werden defensiv auf `DISCREET` normalisiert.
- Die iOS-App verwendet `Diskret` als Standard. Die ausdrueckliche Warnung vor `Vollstaendig` wird clientseitig angezeigt; die serverseitige Speicherung bleibt bewusst ein einfacher, rueckbaubarer Settings-Wert.
- Der App-Umschalter-Schutz, die optionale lokale Geraeteauthentifizierung und das Privacy Manifest liegen ausschliesslich im iOS-Repository. Es wurden keine biometrischen Daten an das Backend uebertragen oder dort gespeichert.
- Rueckbau Backend: Route `src/app/api/external/account/privacy-settings/route.ts` entfernen. Das bestehende Feld `UserSettings.notificationPreviewMode` bleibt dadurch ungenutzt, verursacht aber keine Datenmigration. Alternativ koennen gespeicherte Werte auf `DISCREET` gesetzt werden.
- Verifikation: Backend-TypeScript ohne Fehler; iOS Fastlane-Simulator-Build erfolgreich; Privacy Manifest im erzeugten App-Bundle; Screenshotnachweise `/tmp/playplaner-appstore-privacy-settings-20260713.png` und `/tmp/playplaner-appstore-lock-cover-20260713.png`.
- Restpruefung vor Store-Einreichung: Face ID/Touch ID auf einem realen Geraet, diskrete Push-Payload gegen das deployte Backend, App-Switcher-Snapshot auf realem Geraet sowie erneuter Privacy-Manifest-Audit aller eingebundenen SDKs.

### Produktivnachweis 2026-07-13

- Vor dem Deploy wurde ein PostgreSQL-Custom-Format-Dump `pre-app-store-compliance-20260713.dump` ausserhalb des Repositories im geschuetzten Server-Backupverzeichnis angelegt (590 KiB). Er enthaelt den Stand unmittelbar vor der additiven Schemaerweiterung.
- Deployed wurden ausschliesslich die 67 Dateien aus Commit `cbce7a5`; lokale Secrets, `.env`, Upload-Volumes, Runtime-Logs und Git-Metadaten waren ausgeschlossen.
- Der Docker-Produktionsbuild inklusive Prisma-Generierung, TypeScript-Pruefung, Next.js-Build und 141 statischen Seiten war erfolgreich. `prisma db push` meldete die neue Schemafassung als synchron; Seed und App-Start liefen erfolgreich.
- Live-Smokes: `/privacy`, `/terms`, `/community-guidelines` und `/support` jeweils HTTP 200; authentifiziert `/api/external/compliance/status`, `/api/external/account/privacy-settings` und `/api/external/blocks` jeweils HTTP 200; Privacy-PATCH auf `DISCREET` HTTP 200.
- Der fuer den Smoke erzeugte API-Token `Mobile App: Compliance Smoke` wurde unmittelbar danach geloescht. App-, PostgreSQL-, Postfix- und Cron-Container liefen anschliessend.
- Rueckbau-Reihenfolge: App-Image/Quellstand auf den vorherigen Commit zuruecksetzen, `down.sql` anwenden, erst bei fehlgeschlagenem gezieltem Rueckbau den gesicherten Datenbank-Dump verwenden. Upload-Volume wird von der additiven Migration nicht veraendert.

## Zyklus 6: UGC-Zugriffsschutz und Moderationsabdeckung

- `resolveReportTarget` validiert ein Meldeziel gegen den tatsaechlichen Zugriff des meldenden Benutzers. Unterstuetzt werden zugreifbare Chatnachrichten, Medien, Spielsachen, Szenen, Aktivitaeten/Sessions/Auftraege/Ideen, Tagebuchseiten, Profile sowie Aktivitaets-, Medien- und Sessionkommentare. Eine bekannte ID aus einem fremden Tenant oder ohne Sichtberechtigung ist nicht meldbar.
- Katalog-, Session-, Ideen-, Auftrags- und Tagebuchlisten sowie deren Detailrouten wenden Blocklisten und `ModeratedContent.hidden` serverseitig an. Eigene Inhalte bleiben dem Eigentuemer erreichbar; fremde blockierte oder moderativ ausgeblendete Inhalte werden nicht serialisiert.
- Katalog- und Tagebuchantworten liefern additiv `owner`; Tagebuch liefert ausserdem `own` und `canEdit`. Der iOS-Client kann dadurch eigene Verwaltungsaktionen und fremde Schutzaktionen sicher unterscheiden.
- Die bestehenden Adminrouten `GET /api/external/moderation/reports` und `PATCH /api/external/moderation/reports/{id}` werden nativ verwendet. Serverseitige Massnahmen bleiben transaktional: Hides landen in `ModeratedContent`, Chatnachrichten erhalten `deletedAt`, Medien werden `QUARANTINED`, Sperren widerrufen Sessions/API-Tokens/Pushgeraete und Zirkelentzug entfernt die Kreiszuordnung.
- Rueckbau: Reine Route-/Serializer-/Scope-Aenderungen ohne neue Migration. Das Zuruecksetzen des zugehoerigen Commits stellt das vorherige Listen- und Meldeverhalten wieder her. Vorhandene Reports, Blocks und ModeratedContent-Datensaetze bleiben erhalten.
- Verifikation vor Deploy: `tsc --noEmit` erfolgreich. Nach Deploy folgen authentifizierte Listen-Smokes, ein nicht destruktiver Admin-GET sowie ein reversibler Report-/Blocktest mit Bereinigung.
- Produktivdeploy Commit `6255343`: Docker-/Next-Build erfolgreich; App-Container laeuft. Authentifizierte Smokes lieferten fuer Spielsachen, Szenen, Sessions, Ideen, Auftraege, Tagebuch und Moderation jeweils HTTP 200.
- Reversibler Sicherheitstest: Eine fremde, zulaessig sichtbare Szene wurde mit Grund `OTHER` gemeldet; Blockieren ihres Owners entfernte sie aus der Szenenliste, Entblockieren stellte sie wieder her. Die Smoke-Meldung wurde danach ueber ihre exakte ID aus `ContentReport` geloescht. Blockliste und Meldungswarteschlange waren anschliessend wieder im Ausgangszustand.


## Zyklus 7: Medienklassifikation, Dateipruefung und Quarantaene

- Neue Uploads werden weiterhin anhand ihrer tatsaechlichen Byte-Signatur gegen eine enge MIME-Allowlist und das konfigurierte Groessenlimit geprueft. Zusaetzlich wird der EICAR-Testmarker serverseitig abgelehnt; akzeptierte Dateien erhalten `scanStatus=CLEAN` und `safetyCheckedAt`. Diese Baseline ersetzt keinen externen Malware-Dienst. Vor einer Store-Einreichung bleibt deshalb die organisatorische Entscheidung offen, ob ein ClamAV-/Scanner-Dienst produktiv vorgeschaltet wird.
- Medien verwenden additiv `SAFE`, `MATURE_SUGGESTIVE`, `EXPLICIT`, `UNKNOWN` oder `QUARANTINED`. Neue Medien sind ohne ausdrueckliche Einstufung `UNKNOWN`; die Klassifikation kann nur der Eigentuemer ueber den bestehenden Media-PATCH-Vertrag aendern.
- Listen und Detailrouten liefern `contentClassification` und schliessen `QUARANTINED` aus. Der kombinierte Bilderfeed filtert ebenfalls quarantinisierte Medien, abgelehnte/quarantinisierte Ideen-Dateien, blockierte Owner und moderativ ausgeblendete Entities.
- Beide Dateiabrufe (`/api/files/{id}` und `/api/external/files/{id}`) verwenden `fileAssetForAccess`; diese Funktion liefert Assets mit `QUARANTINED` oder `scanStatus=REJECTED` nie aus. Damit kann eine bereits bekannte direkte Datei-ID die Moderation nicht umgehen.
- Die Adminmassnahmen `HIDE_CONTENT` und `DELETE_CONTENT` synchronisieren bei Medien die Quarantaene transaktional auf `Media` und `FileAsset` und setzen `quarantinedAt`.
- Rueckbau: Die Route-/Serializer-/Dateipruefungen koennen gemeinsam per Commit-Revert entfernt werden. Vorhandene Klassifikationsfelder bleiben additiv. Um eine konkrete Moderationsquarantaene fachlich aufzuheben, muessen sowohl `Media.contentClassification` als auch `FileAsset.contentClassification` bewusst auf den vorherigen Wert gesetzt und `quarantinedAt` geloescht werden; ein blosser Code-Rollback darf quarantinisierte Inhalte nicht automatisch freigeben.
- Verifikation: TypeScript `tsc --noEmit` erfolgreich. Produktivdeploy von Commit `288cd32` inklusive Prisma-Generierung, Next.js-Kompilierung und Typpruefung erfolgreich; `kink_social_app` lief danach auf Port 8097.
- Reversibler Live-Smoke: Ein privates PNG wurde als `EXPLICIT` hochgeladen (HTTP 200), von Media und FileAsset als `EXPLICIT`/`CLEAN` serialisiert und mit Bearer-Header abgerufen (HTTP 200). Nach synchroner Quarantaene von Media und FileAsset lieferten Dateidownload und Detail jeweils HTTP 404, waehrend die Listenroute HTTP 200 ohne das Testmedium lieferte.
- Dateisicherheits-Smoke: Eine Datei mit korrekter PNG-Signatur und EICAR-Testmarker wurde mit HTTP 400 und `invalid_upload` abgewiesen. Es wurde kein Medium angelegt.
- Bereinigung: Testmedium und FileAsset wurden vollstaendig geloescht, der kurzlebige API-Token deaktiviert. Abschliessende Datenbankzaehler: `smokeMedia=0`, `smokeFiles=0`, `activeSmokeTokens=0`.
- iOS-Nachweis: Fastlane-Simulator-Build auf iPhone 17 und iPad Pro 11-inch (M5) erfolgreich. Schutzflaeche und Klassifikationseditor wurden visuell geprueft; Screenshots `/tmp/playplaner-media-safety-cycle2-final.png` und `/tmp/playplaner-media-safety-ipad-cycle2.png`.

## Zyklus 8: Versionierte, widerrufbare Zustimmung

- `ActivityPlan` verwendet die bereits additiv vorhandenen Felder `consentStatus`, `consentVersion`, `acceptedVersion` und `consentUpdatedAt`; fuer diesen Zyklus war keine neue Datenbankmigration erforderlich.
- Der zentrale Zustandsautomat in `src/lib/activity-consent.ts` unterstuetzt `PROPOSE`, `ACCEPT`, `REQUEST_CHANGES`, `DECLINE`, `REVOKE`, `COMPLETE` und `CANCEL`. Er uebersetzt Legacy-`ActivityStatus` defensiv, ohne eine noch nicht erteilte Zustimmung vorzutäuschen.
- Annahme ist nur durch die jeweils andere Partei moeglich. Eine Adminrolle erlaubt keine Selbstannahme. Ein Gegenvorschlag darf Zeitpunkt und optionale Notiz aendern, erhoeht die Consent-Version und loescht die bisher angenommene Version. Danach muss die andere Partei die neue Version ausdruecklich bestaetigen.
- Materielle Aenderungen durch den Eigentuemer setzen eine bestehende Zustimmung auf einen neuen Vorschlag zurueck. Nicht-Eigentuemer duerfen Inhalte nicht ueber den generischen PATCH-Vertrag umschreiben. Reine Zustimmungsaktionen werden abgewiesen, wenn zugleich Inhaltsfelder gesendet werden.
- Session- und Auftragsserializer liefern Status, Version und explizite Berechtigungen. Strukturierte Chatkarten verwenden denselben Vertrag. Alte Statuswerte bleiben als begrenzte Kompatibilitaetsabbildung erhalten.
- Zustimmungsentscheidungen werden revisionsarm als Audit-Aktionen mit Status und Versionsnummer protokolliert; intime Inhalte werden nicht in die Consent-Details kopiert.
- Punkte werden fuer Annahme, Ablehnung, Widerruf und Abbruch explizit unterdrueckt. Das uebrige Punktesystem bleibt unveraendert. Dadurch entsteht aus einer Zustimmungsentscheidung weder Belohnungsdruck noch eine negative Konsequenz.
- Produktivdeploy: Commits `6bf6b6c`, `5d0ad03` und `acb14f2`; Next.js-/Prisma-/TypeScript-Build erfolgreich. Der Compose-Aufruf meldete nach erfolgreichem Start nur eine bereits entfernte alte Container-ID; `kink_social_app` lief anschliessend auf Port 8097.
- Reversibler Zwei-Benutzer-Smoke: Session `PROPOSED` v1; Selbstannahme 409; Annahme durch Gegenpartei; Gegenvorschlag v2; Selbstannahme des Gegenvorschlags 409; Annahme durch Ersteller; Widerruf. Auftrag: Vorschlag, Annahme und Widerruf. Fuer Ablehnung/Widerruf/Abbruch wurden keine PointEntries erzeugt. Testaktivitaeten, zugehoerige Auditlogs, PointEntries und beide temporaeren API-Tokens wurden physisch entfernt; Abschlusszaehler jeweils 0.
- Rueckbau: Die drei Commits gemeinsam revertieren. Da keine neue Migration erforderlich war, bleiben bestehende Consent-Felder ungenutzt kompatibel bestehen. Ein Code-Rollback veraendert keine bereits protokollierten fachlichen Zustimmungen; diese duerfen nur ueber einen bewussten Datenbank-Rollback geaendert werden.
