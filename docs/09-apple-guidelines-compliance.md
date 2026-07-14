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
| 2026-07-13 | Legal/18+ | Versionierte Pflichtdokumente und optionales Altersgate; `iosRequiresAgeConfirmation` ist standardmaessig `false` | App-Store-Altersfreigabe und klare Hinweise sind der Standard; Mandanten koennen das native nicht vorausgewaehlte Gate ausdruecklich aktivieren | `npm run legal:rollback`; Boolean bleibt standardmaessig `false`; Akzeptanzen werden nur mit dem eigenen Dokument geloescht | Publish/Rollback/Republish live fuer Produktion und Review; Fastlane-Simulator-Build und mobile Sichtpruefung | Erfuellt |
| 2026-07-13 | Self-Service-Loeschung | Zweistufiger nativer Flow unter `Datenschutz & Konto` nutzt echten DELETE-Vertrag | Folgen anzeigen, `KONTO LOESCHEN` verlangen, Token nach Erfolg lokal entfernen | SwiftUI-Navigation und Route koennen entfernt werden; bereits vollzogene Loeschungen bleiben irreversibel | Physische Datei, DB-Daten, Token und Login live geprueft; letzter Admin 409 | Erfuellt |
| 2026-07-13 | UGC-Schutz | Typisierte Melde- und Blockiervertraege sowie native Schutzmenues fuer fremde Chatnachrichten, Medien und Medienkommentare | Blockierte Absender aus Chat, Receipts, Push und Medienabrufen ausschliessen; Moderation kann Inhalte zentral verbergen | Additive Tabellen/Routes und `SafetyViews.swift` rueckbauen; bestehende Meldedaten vor Tabellenloeschung exportieren | Produktiver Fremdinhalts-/Block-/Quarantaene-Smoke und Fastlane-Screenshots | Erfuellt |
| 2026-07-13 | Lokaler Schutz/Push | Diskrete Push-Vorschau als Standard, optionaler lokaler Biometrie-/Geraetecode-Lock und App-Switcher-Overlay | UserSettings per GET/PATCH aktualisieren; App-Sperre bleibt nur lokal und freiwillig | Preview-Feld auf `DISCREET` setzen; SwiftUI-Wrapper/Settings entfernen; Manifestdaten separat mit Store-Angaben synchron halten | Plist-Lint, Fastlane-Simulator und reale diskrete APNs-Payload erfolgreich | Erfuellt |
| 2026-07-14 | Review-Abnahme | Neutraler Review-Mandant, vollstaendige Loeschabnahme und diskrete Payload-Haertung | `npm run review:seed`; Payload-Metadaten in geschuetzten Modi entfernen | Erst `npm run review:cleanup`, dann Commit `2af3c79` revertieren; keine Migration | Vier Logins und neun API-Bereiche HTTP 200; APNs-Payload ohne private Daten; drei Fastlane-Simulatoren | Erfuellt |

## Aktueller P0-Status

| Anforderung | Status | Bemerkung |
| --- | --- | --- |
| Altersfreigabe | Erfuellt | Kein hartes Gate im Standard. Der Hinweis fuer Erwachsene und die Bedingungen sind produktiv; optionales Mandantengate ist reversibel vorhanden. Die ehrliche 18+-Altersdeklaration wurde in App Store Connect gespeichert und per API fuer 175 Regionen kontrolliert. |
| Vollstaendige Kontoloeschung | Erfuellt | Echte Loeschung einschliesslich Datenbank, physischer Datei, Tokenwiderruf und Login-Sperre live getestet; letzter Admin wird mit HTTP 409 geschuetzt. |
| Datenschutzerklaerung/Terms/Community | Erfuellt | Vier versionierte Dokumente und vollstaendige Kontakte sind auf Produktions- und Review-Mandant veroeffentlicht. Publish/Rollback/Republish wurde live getestet; finale rechtliche Freigabe bleibt organisatorisch. |
| Melden und Blockieren | Erfuellt | Typisierte Schutzmenues und serverseitige Durchsetzung decken Chat, Medien, Kommentare, Profile, Szenen, Aktivitaeten, Auftraege, Ideen und geteilte Tagebuchinhalte ab; produktiver Fremdinhalts-Smoke bestanden. |
| Moderationsprozess | App fertig / Betrieb offen | Native Admin-Warteschlange, serverseitige Massnahmen, Auditierung, veroeffentlichter Moderationskontakt und 24-48-Stunden-Ziel sind umgesetzt. Die tatsaechliche Besetzung bleibt organisatorisch. |
| Diskrete Push-Nachrichten | Erfuellt | `DISCREET` ist Backend- und iOS-Standard; vollstaendige Vorschau erfordert eine ausdrueckliche Warnbestaetigung. |
| Sicherer Medienumgang | Erfuellt | Byte-Signatur, MIME-Allowlist, Groessenlimit, Klassifikation, serverseitige Quarantaene und ein echter ClamAV-INSTREAM-Scan sind umgesetzt. Uploads schlagen bei Scanner-Ausfall geschlossen fehl; nur `CLEAN` ist abrufbar. |
| Auftrags- und Risikoreduzierung | Erfuellt | Neutrale Nutzertexte sowie versionierte Annahme, Gegenvorschlag, Ablehnung und jederzeitiger Widerruf sind produktiv und mit zwei Benutzern getestet. |
| Demo-Account/Mandant | Erfuellt | Isolierter neutraler Mandant unter `test.playplaner.com`; idempotenter Seed und gezielter Cleanup mit vier Review-Rollen live getestet. |
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

## Zyklus 9: Vollwertiger Malware-Scanner und automatisierte Compliance-Smokes

- Uploads werden nach Byte-Signatur/MIME-Allowlist und Groessenlimit ueber das ClamAV-INSTREAM-Protokoll geprueft. Erst eine echte `OK`-Antwort erlaubt Dateisystem- und Datenbankspeicherung mit `scanStatus=CLEAN` und `safetyCheckedAt`.
- Der Scanner laeuft als separater Compose-Dienst mit dem fest gepinnten Image `clamav/clamav@sha256:7f5389ccaa2368c383fa80e167ccfe44348d71e685f926fce4755eed1757673a`. Die App wartet auf dessen Healthcheck. Signaturen liegen im eigenen Volume `clamav_data`.
- Scanner-Timeout, Netzwerkfehler und unbekannte Antworten sind fail-closed. Die native Medienroute liefert `503 security_scan_unavailable` und `Retry-After: 60`; es werden dabei weder Datei noch FileAsset/Media angelegt.
- Direkte Dateiabrufe und der Ideen-Bildfeed akzeptieren ausschliesslich `scanStatus=CLEAN`. `PENDING` und `REJECTED` sind damit auch bei bekannter Datei-ID nicht erreichbar.
- Die API-Konsole zeigt nur noch Bearer-Header-Beispiele. Der veraltete Query-Token-Curl und der Hinweis auf `token` in URLs wurden entfernt.
- Wiederholbare Pruefungen:
  - `npm run test:compliance:static` kontrolliert Scannervertrag, CLEAN-only, Digest-Pinning und Bearer-only-Quellcode.
  - `npm run test:compliance:live` prueft Legal-/Supportseiten, Login, zentrale geschuetzte APIs, ZIP-Datenexport, Token-Eigenwiderruf und anschliessendes HTTP 401.
  - `npm run test:clamav` prueft eine harmlose Probe und die exakte EICAR-Testdatei ueber INSTREAM.
  - `npm run test:upload-security` prueft sauberen Upload/Download/Loeschung, Ablehnung nicht erlaubter Bytes und optional mit `--scanner-unavailable` den HTTP-503-Pfad.
- Lokaler isolierter Nachweis: Produktions-Dockerbuild und TypeScript erfolgreich; ClamAV healthy; `CLAMAV_INSTREAM_CLEAN_AND_EICAR_OK`; `UPLOAD_CLEAN_AND_DISALLOWED_BYTES_OK`; `UPLOAD_SCANNER_UNAVAILABLE_OK`; `COMPLIANCE_LIVE_OK`. Alle Test-Tokens wurden deaktiviert und die eigene Testdatenbank, Upload-Volumes, Container und Netzwerke entfernt.
- Rueckbau: Vor dem Deploy App-Image, Compose/Quellstand und Datenbank sichern. Fuer einen vollstaendigen Rueckbau vorherige Compose-Datei und App-Image wiederherstellen und erst danach `clamav` stoppen; `clamav_data` kann anschliessend entfernt werden. Ein Rueckbau auf ungescannte Uploads ist sicherheitlich nicht empfohlen. Es gibt keine Datenbankmigration.
- Produktivnachweis 2026-07-14: Vorheriges Image `kink-social-platform-app:pre-clamav-20260714`, Quell-/Compose-Sicherung `/root/pre-clamav-source-20260714.tgz` und `/root/pre-clamav-docker-compose-20260714.yml` sowie PostgreSQL-Dump `/root/pre-clamav-20260714.dump`, jeweils ausserhalb des Repositories und Modus 600.
- Der Scanner wurde vor dem App-Wechsel gestartet und erst bei `healthy` verwendet. Der INSTREAM-Test im Produktionsnetz lieferte `CLAMAV_INSTREAM_CLEAN_AND_EICAR_OK`. Danach baute Next 15.5.20 alle 139 Routen erfolgreich; App und Scanner laufen gemeinsam.
- Produktive Live-Smokes gegen `test.playplaner.com`: `COMPLIANCE_LIVE_OK` einschliesslich Eigenwiderruf/401 sowie `UPLOAD_CLEAN_AND_DISALLOWED_BYTES_OK` einschliesslich privatem CLEAN-Upload, authentifiziertem Download und API-Loeschung. Oeffentliche Datenschutz- und Supportseiten lieferten HTTP 200.

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
- Nach dem finalen Deploy von `acb14f2` bestaetigte ein zweiter reversibler Auftragstest produktiv `acceptancePointEntries=0`. Auftrag, Audit-Testspuren und beide temporaeren Tokens wurden danach erneut mit Abschlusszaehlern 0 bereinigt.
- Rueckbau: Die drei Commits gemeinsam revertieren. Da keine neue Migration erforderlich war, bleiben bestehende Consent-Felder ungenutzt kompatibel bestehen. Ein Code-Rollback veraendert keine bereits protokollierten fachlichen Zustimmungen; diese duerfen nur ueber einen bewussten Datenbank-Rollback geaendert werden.

## Zyklus 9: Persoenlicher Datenexport, Sitzungsverwaltung und Zirkel-Austritt

- `GET /api/external/account/export` erzeugt fuer den angemeldeten Benutzer ein ZIP-Archiv. Der bestehende Datenexport wird mit einem auf den Eigentuemer begrenzten Scope wiederverwendet; `account.json` ergaenzt Konto, Profil, Settings, Mitgliedschaften, Legal-/Consent-Nachweise, Sitzungsmetadaten, Push-Geraetemetadaten, selbst gesetzte Blocks, eigene Chatnachrichten und eigene Meldungen.
- Der persoenliche Export enthaelt weder API-Token-Hashes noch Push-Device-Tokens, verschluesselte Telegram-/OpenAI-Schluessel oder die Identitaet von Benutzern, die den Exportierenden blockiert oder gemeldet haben. Der Response ist `Cache-Control: no-store` und wird als ZIP-Anhang geliefert.
- `GET /api/external/account/sessions` listet ausschliesslich aktive eigene API-Sitzungen und kennzeichnet die aktuelle Bearer-Sitzung serverseitig. `DELETE /api/external/account/sessions/{id}` widerruft eine ausgewaehlte eigene Sitzung und deren View-Contexts. `POST /api/external/account/sessions` mit `REVOKE_OTHERS` deaktiviert alle anderen App-Tokens, loescht deren View-Contexts und erhoeht `sessionRevision`, sodass auch bestehende Web-Sitzungen ungueltig werden; das aktuelle App-Token bleibt aktiv.
- `GET /api/external/account/circle` zeigt vor einem Austritt den aktuellen Zirkel und nur aggregierte Auswirkungen. `DELETE` verlangt exakt `ZIRKEL VERLASSEN`. Danach werden eigene Medien, Alben und Tagebuchseiten mit `PARTNER`/`SHARED` auf `PRIVATE` gesetzt, direkte Wiki-/Share-Freigaben zwischen den bisherigen Zirkelmitgliedern entfernt, Produktzuordnungen zum austretenden Benutzer geloest und nur dessen Mitgliedschaft/Zirkelbezug entfernt. Andere Mitglieder bleiben unveraendert.
- Alle Routen ignorieren einen administrativen View-Context und wirken stets auf das authentifizierende eigene Konto. Dadurch kann ein Admin diese persoenlichen Aktionen nicht versehentlich in einer simulierten Benutzersicht ausfuehren.
- Die neuen Routen sind in `src/lib/capabilities.ts` als normale Konto-/Datenschutzfunktionen dokumentiert und haengen nicht an einem optionalen Admin-Feature.
- Produktivdeploy Commit `d63430b`: lokaler TypeScript-Check, Docker-/Prisma-/Next-Build und Containerstart erfolgreich. Die Next-Routenliste enthielt alle sechs neuen Routevarianten.
- Reversibler Produktiv-Smoke mit zwei temporaeren Benutzern, einem temporaeren Zirkel und drei temporaeren Tokens: ZIP HTTP 200 mit `account.json`/`data.json`, nur eigene Records und keine Token-/Integrationsgeheimnisse; Sitzungslisting 3/3 mit genau einer aktuellen Sitzung; Einzelwiderruf, `REVOKE_OTHERS`, Web-Sessionrevision und abschliessender Widerruf des aktuellen Tokens erfolgreich; der widerrufene Token erhielt danach HTTP 401.
- Derselbe Smoke wies fuer den Zirkel-Austritt nach: falscher Bestaetigungstext HTTP 400, eigener Zirkelbezug geloescht, Medien/Album/Tagebuch privat, aus- und eingehende Direktfreigaben entfernt und das andere Mitglied unveraendert. Abschlusszaehler `smokeUsers=0`, `smokeCircles=0`; es blieben keine Testdaten zurueck.
- Rueckbau: Commit `d63430b` revertieren. Es gibt keine neue Datenbankmigration. Bereits widerrufene Tokens bleiben aus Sicherheitsgruenden deaktiviert; ein Rollback darf sie nicht automatisch reaktivieren. Bereits privat gestellte Inhalte oder geloeschte Direktfreigaben werden ebenfalls nicht automatisch rekonstruiert, weil dies Sichtbarkeit ohne erneute Nutzerentscheidung erweitern wuerde.

## Zyklus 10: Kontoloeschungsabnahme, diskrete Push-Payload und Review-Mandant

- Die vorhandene Self-Service-Loeschung wurde produktionsnah mit einem ausschliesslich temporaeren Konto, FileAsset samt physischer Datei, Medium, Szene, Spielzeug, Aktivitaet, Chat, Auditlog, Pushgeraet sowie Reset-, Bestaetigungs- und API-Tokens getestet. `DELETE /api/external/account` endete `COMPLETED`; Datenbankdatensaetze und physische Datei waren entfernt, Auditdaten anonymisiert, das andere Kreismitglied blieb bestehen und der alte Token lieferte HTTP 401.
- Ein separater letzter-Admin-Test endete bewusst mit HTTP 409 und Jobstatus `BLOCKED_LAST_ADMIN`. Benutzer und Zugang blieben erhalten. Alle temporaeren Loeschtests wurden anschliessend bereinigt; es blieben keine Smoke-Benutzer, -Zirkel, -Jobs oder -Logs zurueck.
- Diskrete und titelbasierte Push-Vorschauen schuetzen jetzt auch die maschinenlesbaren Payload-Metadaten. Ausser dem neutralen nativen Routingziel werden `href`, `action`, `entityType`, `entityId`, `circleName` und `imageUrl` auf `null` gesetzt. Nur die ausdruecklich gewaehlte vollstaendige Vorschau erhaelt diese Metadaten.
- Der reale APNs-Smoke nutzte ausschliesslich ein temporaeres ungueltiges Testgeraet. APNs antwortete erwartungsgemaess `BadDeviceToken`; die gespeicherte Payload enthielt nur `Playplaner`, `Eine gemeinsame Planung wurde aktualisiert.`, Sound und ein neutrales natives Ziel. Private Titel, Notiz, URL, Aktion, Entity-Daten, Kreisname und Bild-URL fehlten. Regel, Geraet, Delivery, Session, Logs und Token wurden danach entfernt.
- `scripts/app-review-tenant.js` erzeugt im isolierten Test-Mandanten den Kreis `App Review`, Alex, Sam, Review Admin und Delete Test sowie ausschliesslich neutrale Daten fuer Startseite, Planung, Kalender, Tracker, Chat, Medien, Tagebuch und Moderation. Die vier Passwoerter kommen nur aus `APP_REVIEW_*_PASSWORD` und liegen nicht im Repository.
- Seed, erneuter Seed, vollstaendiger Cleanup und anschliessender Neuseed wurden live ausgefuehrt. Alle vier Logins sowie Status, Sessions, Spielsachen, Szenen, Tracker-History, Chat, Tagebuch, Medien und Events antworteten mit HTTP 200. Der Testdatensatz enthaelt zwei Sessions, zwei Spielsachen, zwei Szenen, zwei Tracker-Eintraege, zwei Chatnachrichten, ein Tagebuch und ein Medium.
- `npm run review:cleanup` entfernt nur exakte Review-E-Mail-Adressen, den Kreis `App Review`, `app-review`-Tracker und `App Review`-Kategorien. Andere Test-Mandantendaten bleiben unberuehrt. Der Produktionscontainer liefert das Skript absichtlich mit aus, damit Seed und Cleanup reproduzierbar bleiben.
- Native Live-Pruefung mit echtem Alex-Login gegen `test.playplaner.com`: Fastlane-Simulator-Builds auf iPhone 17, iPhone 17e und iPad Pro 11-inch (M5) erfolgreich. Screenshots: `/tmp/playplaner-review-dashboard-cycle5.png`, `/tmp/playplaner-review-dashboard-cycle5-iphone17e.png`, `/tmp/playplaner-review-dashboard-cycle5-ipad.png`.
- Rueckbau: Zuerst mit der geschuetzten lokalen Review-Environment `npm run review:cleanup` ausfuehren, dann Commit `2af3c79` revertieren und neu deployen. Der Push-Hardening-Revert ist technisch moeglich, wird aus Datenschutzgruenden nicht empfohlen. Es gibt keine Datenbankmigration.

## Zyklus 11: Oeffentliche Rechtsdokumente und Supportkontakte

- `scripts/publish-legal-documents.js` veroeffentlicht exakt eine versionierte Fassung von Hinweis fuer Erwachsene, Datenschutzerklaerung, Nutzungsbedingungen und Community-Regeln. Die Texte decken Produktzweck, besonders persoenliche Daten, Sichtbarkeit, Kontoloeschung, optionale Drittanbieter, Moderation, Zustimmung und Sicherheitsgrenzen ab.
- Der Erwachsenenhinweis ist im Standard informativ (`required=false`); `iosRequiresAgeConfirmation` bleibt auf beiden Mandanten `false`. Damit entsteht kein hartes Altersgate. Datenschutz, Nutzungsbedingungen und Community-Regeln sind versioniert zustimmungspflichtig.
- Betreiber- und Kontaktdaten stammen aus bereits oeffentlich vorhandenen Angaben. Die geschuetzte Laufzeitkonfiguration liegt lokal in `~/.playplaner/legal.env` und auf dem Server in `/root/.playplaner-legal.env`, jeweils Modus 600 und nie im Repository. Der Serverstandort wurde fuer den aktuell betriebenen Contabo-Host als Europaeische Union/Frankreich dokumentiert.
- Vor dem Deploy wurde `/root/pre-legal-publish-20260714.dump` erstellt. Der Next.js-/Prisma-/TypeScript-Produktionsbuild lief erfolgreich; der neue App-Container startete. Die bekannte stale Container-ID erschien erst nach erfolgreichem Recreate und hatte keine Auswirkung auf den laufenden Container.
- Reversibilitaetsnachweis: `legal:publish` aktivierte beide Mandanten, alle acht Legal-/Support-URLs antworteten HTTP 200 ohne Platzhalter. `legal:rollback` stellte auf beiden Domains den exakten vorherigen unveroeffentlichten Zustand wieder her. Ein abschliessendes `legal:publish` stellte den neuen Stand wieder her.
- Die Vorher-Snapshots liegen dauerhaft ausserhalb des Containers in `runtime-logs/legal-publish-{tenant}-2026-07-14.json`, Modus 600. Rollback loescht nur die eigene Dokumentversion, stellt vorherige Aktiv-/Publikationszustaende sowie die vorige Kontaktkonfiguration wieder her und erweitert keine Sichtbarkeit.
- Fastlane-Simulator-Build auf iPhone 17 erfolgreich. Der native Link-Ruecksprung und die mobile Datenschutzerklaerung wurden auf dem Simulator geprueft; Screenshot `/tmp/playplaner-legal-cycle1-retry.png`.
- Neue Betriebsdokumente: `app-store-readiness.md`, `privacy-data-map.md`, `account-deletion.md`, `content-moderation.md`, `ios-security.md` und `activity-and-order-safety.md`.
- Offene manuelle Punkte: rechtliche Freigabe der veroeffentlichten Texte und Kontakte, tatsaechliche Besetzung der Postfaecher sowie Speicherung und visuelle Kontrolle der Privacy Labels in App Store Connect. Altersdeklaration und produktiver Malware-Scanner sind inzwischen erfuellt.
- Zyklusabschluss: finaler Screenshot `/tmp/playplaner-legal-cycle1-final.png` und Status an Telegram Message-ID `279`; anschliessender Poll ohne neue Anweisung. Zaehler `1/5` nach TestFlight Build 102, daher kein Upload in diesem Zyklus.

## Zyklus 12: Reproduzierbare und auditierbare Produktionsabhaengigkeiten

- Das Backend besitzt erstmals einen versionierten `package-lock.json`. Docker installiert Builder- und Runner-Abhaengigkeiten ausschliesslich mit `npm ci` beziehungsweise `npm ci --omit=dev`; dadurch kann ein spaeteres Deployment nicht unbemerkt neuere transitive Pakete aufloesen.
- Next.js wurde von `14.2.35` auf die kompatible Sicherheitslinie `15.5.20` angehoben. `eslint-config-next` folgt derselben Version. PostCSS ist auf `8.5.10` fixiert und als Override auch fuer transitive Nutzer erzwungen.
- Die offizielle Next-Codemod-Migration wurde auf die asynchronen Request-APIs angewendet. Alle dynamischen `params`/`searchParams`, `cookies()` und `headers()` werden vor Zugriff erwartet; Warnmarker und provisorische `UnsafeUnwrapped*`-Typen wurden vollstaendig entfernt.
- `npm ci` meldete fuer 442 Build-Pakete und 119 Produktionspakete jeweils null bekannte Schwachstellen. Der Produktionsbuild bestand Kompilierung, Lint/Typecheck und 138 lokale beziehungsweise 139 serverseitige Routen. Die zusaetzliche Serverroute stammt aus einer erhaltenen, noch nicht versionierten Datei und wurde beim dateibasierten Overlay nicht geloescht.
- Isolierter Server-Smoke auf Port `18097`, ohne Entrypoint, Schema-Push oder Seed: `/privacy`, `/terms`, `/community-guidelines`, `/support`, Login, Compliance, Status, Capabilities, Sitzungen, Chat, Medien, Tracker-History und Kalender erfolgreich. Der kurzlebige Review-Token wurde ueber den Self-Service-Endpunkt widerrufen und lieferte danach HTTP 401.
- Der Review-Admin bestaetigte im normalen Compliance-Flow die drei erforderlichen Fassungen Datenschutz, Bedingungen und Community-Regeln. Der nicht erforderliche Erwachsenenhinweis blieb ohne harte Bestaetigung; `iosRequiresAgeConfirmation=false` bleibt unveraendert.
- Der Server war vor dem isolierten Export mit 145 GB zu 100 Prozent belegt. Ausschliesslich unreferenzierte Docker-Images wurden bereinigt; laufende Container und Volumes blieben erhalten. Danach standen rund 17 GB frei. Dieser Betriebsbefund wird kuenftig vor Builds mit `df -h /` kontrolliert.
- Rueckbau: den zugehoerigen Commit revertieren und das vorherige Image neu bauen. Es gibt keine Datenbankmigration. Bereits erteilte rechtliche Zustimmungen werden durch einen Code-Rollback nicht automatisch entfernt; das waere eine eigenstaendige fachliche Datenentscheidung.
- Produktivdeploy Commit `d19e72f`: Vorher wurden das bisherige Image als `kink-social-platform-app:pre-next15-20260714`, der Source-Stand als `/root/pre-next15-source-20260714.tgz` und die Datenbank als `/root/pre-next15-20260714.dump` gesichert. Source-Archiv und Dump sind Modus 600.
- Das produktive Image bestand erneut `npm ci`, Prisma-Generierung, Next-Kompilierung, Lint/Typecheck und 139 Seiten. Compose meldete nach erfolgreichem Recreate nur die bekannte bereits entfernte Container-ID; `docker compose ps app` und das Startlog bestaetigten Next `15.5.20` auf Port 8097.
- Produktiver Live-Smoke: alle vier oeffentlichen Seiten sowie Login, Compliance, Status, Capabilities, Sitzungen, Chat, Medien, Tracker-History und Kalender HTTP 200. Der aktuelle Smoke-Token wurde ueber `DELETE /api/external/account/sessions/{id}` widerrufen und danach mit HTTP 401 verifiziert.
- iOS-Verifikation: Fastlane-Lane `ios simulator` erfolgreich. Der iPhone-17-Simulator meldete sich mit dem normalen nativen Login am Review-Mandanten an und zeigte reale Dashboard-, Mitglieder-, Anfrage-, Aktivitaets- und Trackerdaten. Screenshot `/tmp/playplaner-next15-cycle2-live.png`.

## Zyklus 13: Schutz gegen Credential Stuffing und Token-Leaks

- Web- und App-Login verwenden persistente, mandanten-/hostbezogene Limits pro Kennung und Clientadresse. Fuenf fehlgeschlagene Versuche pro Kennung innerhalb von 15 Minuten sperren fuer 15 Minuten; das grosszuegigere Adresslimit bremst verteilte Kennungsversuche, ohne einzelne Haushalte vorschnell auszusperren.
- `SecurityRateLimit` speichert nur HMAC-SHA-256-Schluessel. Mailadresse, Benutzername und IP-Adresse werden weder dort noch in fehlgeschlagenen Login-Auditlogs gespeichert. Das Audit enthaelt lediglich einen kurzen, nicht rueckrechenbaren Fingerabdruck zur betrieblichen Korrelation.
- Passwort-Reset bleibt gegen Kontoausspaehen neutral und wird pro Kennung sowie Adresse gedrosselt. Ein limitiertes Ersuchen zeigt dieselbe Erfolgsseite, versendet aber keinen weiteren Link.
- Einladungsannahme und -erstellung sowie die Erzeugung von API-Tokens sind ebenfalls begrenzt. Die externe Einladungserstellung ist nur noch per authentifiziertem `POST` moeglich; `GET` ist rein lesend.
- Reguläre API-Tokens werden ausschliesslich im Bearer-Header verwendet. Die Tokenverwaltung liefert einen neu erzeugten Token einmalig in einer `no-store`-Antwort an die angemeldete Adminoberflaeche; URL, Redirect, Browser-Historie und Serverzugriffslog enthalten ihn nicht mehr. Veraltete Query-Token-Beispiele wurden aus den Capability-Vertraegen entfernt.
- Die zentrale Passwortregel verlangt 12 bis 128 Zeichen und gilt fuer Einladung, E-Mail-Bestaetigung, Reset, eigenes Passwort sowie administrative und externe Benutzerverwaltung. Automatisch erzeugte Passwoerter bleiben kryptografisch zufaellig.
- Rueckbau: Zuerst den zugehoerigen Code-Commit revertieren, danach `prisma/manual-migrations/20260714_security_rate_limits/down.sql` anwenden. Die Migration entfernt ausschliesslich kurzlebige Rate-Limit-Zaehler. Sie veraendert keine Konten, Passwoerter, Inhalte oder Tokens. Das Wiederzulassen von Query-Tokens wird aus Sicherheitsgruenden nicht empfohlen.
- Isolierter Nachweis: frische PostgreSQL-16-Datenbank, Next-15-Produktions-Dockerbuild mit 139 Routen, `COMPLIANCE_STATIC_OK` und `LOGIN_RATE_LIMIT_LIVE_OK`. Versuche 1 bis 4 lieferten HTTP 401, Versuch 5 HTTP 429 mit `Retry-After`. Die Datenbank enthielt nur 64-stellige HMACs; das Audit nur `subjectFingerprint`. `up.sql` und `down.sql` wurden in einer separaten Testdatenbank erfolgreich ausgefuehrt.
- Produktivdeploy Commit `9d88f54`: Vorheriges Image `kink-social-platform-app:pre-security-cycle4-20260714`, Quellstand `/root/pre-security-cycle4-source-20260714.tgz` und Datenbank `/root/pre-security-cycle4-20260714.dump`, beide Dateien Modus 600. Der Next-15.5.20-Build bestand mit 140 serverseitigen Routen; die zusaetzliche Route ist die bereits erhaltene serverlokale Uploadroute.
- Produktiver Nachweis: `LOGIN_RATE_LIMIT_LIVE_OK` gegen `playplaner.com`, anschliessend wurden der exakte Test-Kennungssperreintrag und alle fuenf zugehoerigen Audit-Testspuren entfernt. Die kurzlebigen Adresszaehler enthalten nur HMACs und laufen automatisch aus. `COMPLIANCE_LIVE_OK` gegen den Review-Mandanten bestaetigte danach Legal-/Supportseiten, Login, geschuetzte Kern-APIs, ZIP-Export, Eigenwiderruf und abschliessendes HTTP 401.

## Zyklus 14: Reproduzierbare App-Store-Metadaten und Altersdeklaration

- Vorher-Zustand in App Store Connect: Version `1.0` war `PREPARE_FOR_SUBMISSION`; Beschreibung, Schluesselwoerter, Werbetext, Untertitel, Marketing-, Support- und Datenschutz-URL waren leer. Der gesamte Altersfragebogen enthielt ausschliesslich `null`-Werte und war damit nicht einreichungsfaehig.
- Die kanonischen deutschen Texte liegen im iOS-Repository unter `fastlane/metadata/de-DE`. Die neue Fastlane-Lane `ios store_metadata` laedt weder Binaerdatei noch Screenshots hoch und reicht nicht zur Pruefung ein. Sie setzt nur die versionierten Metadaten und die Altersdeklaration.
- Die Store-Positionierung beschreibt Playplaner ehrlich als privaten, einladungsbasierten Planer fuer volljaehrige Einzelpersonen, Paare und vertraute Kreise. Oeffentliche Partnersuche, zufaelliger Chat und oeffentlicher Medienfeed werden ausdruecklich ausgeschlossen.
- Die Altersdeklaration weist User-Generated Content und Messaging/Chat aus, setzt erwachsene beziehungsweise suggestive Themen auf haeufig sowie nichtgrafische Sexualitaet/Nacktheit auf gelegentlich. Grafisch explizite Inhalte sind fuer das dauerhafte iOS-Produkt als nicht verfuegbar deklariert, passend zur serverseitigen iOS-Medienrichtlinie. Ein bewusster 18+-Store-Override wird verwendet; `ageAssurance=false` und `iosRequiresAgeConfirmation=false` erhalten die Nutzerentscheidung gegen ein hartes In-App-Gate.
- ASC-Readback nach Fastlane: alle acht geprueften lokalisierten Felder befuellt; `ageRatingOverrideV2=EIGHTEEN_PLUS`, `messagingAndChat=true`, `userGeneratedContent=true`, `matureOrSuggestiveThemes=FREQUENT_OR_INTENSE`, `sexualContentOrNudity=INFREQUENT_OR_MILD`, `sexualContentGraphicAndNudity=NONE`, `ageAssurance=false`. Die berechneten Store-Ratings sind 174 Regionen mit 18+ und eine Region mit 19+.
- Review Notes bleiben als nicht geheime Vorlage unter `docs/app-review-notes.md` im iOS-Repository. Sie liegen bewusst nicht im Fastlane-Metadatenordner, weil App Store Connect beim API-Upload zugleich echte persoenliche Review-Kontaktdaten verlangt. Telefonnummer, Review-Benutzer und Passwoerter werden nicht erfunden und nicht committed.
- Fastlane-Simulator-Builds bestanden auf iPhone 17e und iPad Pro 11-inch (M5). Die native Ansicht `Datenschutz & Konto` wurde auf beiden Formfaktoren visuell geprueft; Screenshotpfade `/tmp/playplaner-store-metadata-cycle5-iphone17e.png` und `/tmp/playplaner-store-metadata-cycle5-ipad.png`.
- Rueckbau: Im iOS-Repository die Metadatendateien auf den gewuenschten Git-Stand zuruecksetzen und `bundle exec fastlane ios store_metadata` erneut ausfuehren. Fuer einen vollstaendigen Rueckbau der Altersdeklaration ist eine neue, fachlich korrekte Deklaration zu uebertragen; ein Ruecksetzen auf den vorherigen komplett leeren Fragebogen ist kein zulaessiger Einreichungszustand. Es gab keine Backend-, Datenbank- oder Produktivdatenaenderung.
- Zyklusabschluss: Vor TestFlight lagen 7 Builds im rollierenden 24-Stunden-Fenster. Build `1.0 (103)` wurde ausschliesslich mit der Fastlane-`beta`-Lane hochgeladen. ASC bestaetigte Build-ID `8a12e488-0cc0-4704-83ef-2dd52bda4d3d`, `VALID` und `usesNonExemptEncryption=false`. Der Fuenf-Zyklen-Zaehler beginnt wieder bei `0/5`.

## Zyklus 15: App-Review-Kontakt und belastbarer Demo-Zugang

- ASC enthielt nach dem Metadatenlauf bereits die Review Notes, aber noch keinen Namen, keine Telefonnummer, keine E-Mail und keinen Demo-Zugang. Die iOS-Fastlane-Lane `store_review_details` liest diese Werte aus `~/.playplaner/app-review.env` (Modus 600) und uebertraegt sie ohne Build-, Screenshot- oder Review-Submission.
- Der ASC-Readback bestaetigte alle sieben Pflichtfelder als gesetzt und `demoAccountRequired=true`. Persoenliche Kontaktwerte und das Demo-Passwort werden weder in diesem Repository noch im iOS-Repository dokumentiert.
- Ein erster visueller Login-Test deckte einen echten Betriebsfehler auf: Alex konnte sich authentifizieren, hatte aber nach der spaeteren Legal-Veroeffentlichung noch keine Akzeptanzen fuer die drei neuen Pflichtfassungen. Die App blieb deshalb korrekt im Compliance-Flow und private Endpunkte antworteten HTTP 428.
- Der vorhandene idempotente Review-Seed akzeptiert fuer jedes erzeugte Review-Konto alle zum Seed-Zeitpunkt aktiven und erforderlichen Dokumente. Er wurde im laufenden Produktionscontainer mit der geschuetzten Review-Environment erneut ausgefuehrt; dabei wurden ausschliesslich die vier reservierten `app-review-*`-Konten und der Kreis `App Review` neu erzeugt.
- Anschliessend bestanden Alex, Sam, Review Admin und Delete Test jeweils Login, `compliance.accessGranted=true`, leere `pendingDocuments` und HTTP 200 auf dem geschuetzten Status. Jede Testsitzung wurde danach einzeln widerrufen.
- Der zweite visuelle Test zeigte Alex im echten neutralen Dashboard mit Kreis, Anfrage, Aktivitaet und Tracker. Screenshot `/tmp/playplaner-review-access-cycle1-build103-fixed.png`; die kurzlebige Screenshot-Sitzung wurde danach widerrufen. Fastlane-Simulator-Build auf iPhone 17e erfolgreich.
- Betriebsregel: Nach jeder neuen erforderlichen Legal-Dokumentversion muss `npm run review:seed` erneut laufen und die Vier-Konten-Compliance-Pruefung bestehen. Ein reiner Login-Smoke ist fuer App Review nicht ausreichend.
- Rueckbau: Die ASC-Review-Felder koennen ueber dieselbe Lane mit bewusst geaenderten lokalen Werten ersetzt werden. Der Review-Mandant bleibt ueber `npm run review:cleanup` vollstaendig auf seine reservierten Testdaten begrenzt entfernbar. Es gab keine Migration und keinen Backend-Code-Deploy.

## Zyklus 16: Neutrale App-Store-Screenshots

- Das iOS-Repository besitzt eine getrennte Fastlane-Lane `store_screenshots`. Sie ersetzt ausschliesslich die versionierten Store-Screenshots und laedt weder Metadaten noch Binaerdatei hoch; eine Review-Einreichung findet nicht statt.
- Die von Apple akzeptierten Pflichtformate wurden direkt auf iPhone 17 Pro Max (`1320 x 2868`) und iPad Pro 13-inch (`2064 x 2752`) verifiziert. Geplant sind je drei reale, harmlose Review-Ansichten fuer Dashboard, Kalender und Chat. DEBUG-Beispieldaten werden nicht verwendet.
- Die visuelle iPhone-Pruefung deckte eine falsche englische Xcode-Entwicklungsregion auf. Das iOS-Projekt verwendet nun Deutsch als Entwicklungsregion; native Datums-/Zeitzeilen erscheinen dadurch deutsch statt mit dem englischen Verbindungswort `at`. Fastlane-Simulator-Builds auf beiden Zielformaten waren erfolgreich.
- Zwei neutrale Seed-Texte verwenden nun echte deutsche Umlaute (`bestätigen`). Die Aenderung betrifft ausschliesslich den reproduzierbaren Review-Seed; die zwei bereits bestehenden Review-Datensaetze wurden gezielt gleichgezogen. Es gibt keine Migration und keine Produktivdaten ausserhalb des isolierten Review-Mandanten wurden veraendert.
- Je drei iPhone- und iPad-Screenshots wurden mit echten neutralen Alex-Daten visuell auf Inhalte, Navigation, Datumsdarstellung, Ueberlagerungen und Pflichtabmessungen geprueft. Ein Neustart des iPad-Simulators entfernte den blockierenden Systemdialog, sodass die Aufnahmen reproduzierbar per `simctl` entstanden. `verify_store` meldete `APP_STORE_READINESS_OK` mit `iPhone=3, iPad=3`.
- Die App-Store-Datenschutzangaben wurden aus Quellcode, Schema, aktiven Integrationen und Serverbetrieb in `app-store-privacy-labels.md` abgeleitet. Der Servernachweis bestaetigt IP-basierte Nginx-Zugriffslogs mit taeglicher Rotation und 14 aufbewahrten Rotationen. Die Labels bleiben bis zur Speicherung und visuellen Kontrolle in App Store Connect ein offener Einreichungspunkt.
- Das iOS-Privacy-Manifest wurde mit dieser Datenlandkarte abgeglichen und um sonstige Kontaktinformation, groben Standort/IP sowie Chattexte ergaenzt. Alle Datentypen sind kontobezogen, nicht fuer Tracking markiert und dienen mindestens der App-Funktionalitaet. `verify_app_store_readiness.rb` prueft Manifest, Berechtigungstexte, Store-Metadaten, Fastlane-Lanes und exakt drei Screenshots je Pflichtformat reproduzierbar.
- Der Required-Reason-API-Audit fand im Swift-Quellcode nur `UserDefaults`/`@AppStorage`, korrekt mit Grund `CA92.1` deklariert. File-Timestamps, System-Bootzeit, Speicherplatz-APIs, aktive Tastaturen, ATT und eingebettete Drittanbieter-Frameworks sind im geprueften Stand nicht vorhanden.
- Die oeffentliche Datenschutzerklaerung nennt Datenexport, Kontoloeschung und Einwilligungen. Sie ist deshalb in ASC zusaetzlich zur Pflicht-URL als `privacyChoicesUrl=https://playplaner.com/privacy` gesetzt; der API-Readback bestaetigte beide Felder. Rueckbau: `privacyChoicesUrl` fuer AppInfoLocalization `de-DE` wieder auf `null` setzen.
- Das zuvor leere ASC-Copyright wird jetzt aus `fastlane/metadata/copyright.txt` reproduzierbar gesetzt. Fastlane `store_metadata` lief erfolgreich; ASC bestaetigte fuer Version `1.0` den Wert `2026 G. Schreiber` und weiterhin `PREPARE_FOR_SUBMISSION`. Rueckbau: Datei und ASC-Wert auf den vorherigen Zustand `null` zuruecksetzen.
- Die zuvor nicht gesetzten Store-Kategorien liegen im iOS-Repository als `primary_category.txt=LIFESTYLE` und `secondary_category.txt=PRODUCTIVITY`. Lifestyle beschreibt die private Paar-/Kreisplanung als Kernfunktion, Productivity die Kalender-, Aufgaben- und Trackerwerkzeuge. Fastlane `store_metadata` uebertrug beide Angaben; der ASC-API-Readback bestaetigte exakt `LIFESTYLE` und `PRODUCTIVITY`. Rueckbau: beide ASC-Relationships wieder loesen beziehungsweise die vorherigen Kategorien setzen und die versionierten Dateien entsprechend zuruecksetzen.
- Fastlane lud die sechs geprueften Dateien zunaechst erfolgreich hoch. Wegen verzoegerter ASC-Pruefsummenverarbeitung erkannte der klassische Retry die bereits vollstaendigen Assets zu frueh als fehlend und erzeugte sechs Duplikate. Ausschliesslich die jeweils zweite identische Asset-ID wurde per `DELETE /v1/appScreenshots/{id}` entfernt; alle sechs Antworten waren HTTP 204. Der finale Readback zeigt `APP_IPHONE_67=3`, `APP_IPAD_PRO_3GEN_129=3`, eindeutige Dateinamen, korrekte Pixelmasse und durchgehend `COMPLETE`.
- Die Fastlane-Lane verwendet deshalb nun den explizit aktivierten differenzbasierten `sync_screenshots`-Pfad. Ein zweiter Lauf blieb idempotent und der erneute ASC-Readback exakt bei `3 + 3`. Die kurzlebige Alex-Screenshot-Sitzung sowie zwei alte Screenshot-Sitzungen wurden widerrufen; der verwendete Token lieferte danach HTTP 401. Es wurde kein Build hochgeladen und keine Review-Einreichung ausgelost.
- Rueckbau: Den iOS-Commit fuer Fastlane-Lane, Entwicklungsregion und Screenshotdateien revertieren. Im Backend die Seed-Textaenderung revertieren und bei Bedarf `npm run review:seed` mit der geschuetzten Review-Environment ausfuehren. Die gezielte Umlautkorrektur kann alternativ durch ein exaktes Datenupdate rueckgaengig gemacht werden; fachlich ist dies nicht empfohlen.

## Zyklus 17: Native optionale Einwilligungen

- Vorher war der serverseitige, getrennte Consent-Vertrag fuer `TELEGRAM`, `OPENAI`, `PUSH` und `ANALYTICS` vorhanden, in der iOS-Datenschutzansicht aber nicht direkt widerrufbar. Die App zeigt nun die drei tatsaechlich verwendeten Verbindungen Telegram, Transkription/OpenAI und Push getrennt unter `Datenschutz & Konto -> Optionale Verbindungen`. `ANALYTICS` bleibt kompatibel im Backendmodell, wird ohne vorhandene Analytics-Funktion aber nicht als wirkungsloser Schalter angezeigt.
- Lesen erfolgt ueber `GET /api/external/compliance/status`; eine einzelne Entscheidung wird ueber `PATCH /api/external/compliance/consents` mit funktionsspezifischer Version und `source=IOS` gespeichert. Fehlende Eintraege bleiben standardmaessig `granted=false`.
- Telegram ist auf ausdruecklich gewaehlte Inhalte begrenzt. OpenAI wird in der App als konkrete Transkriptionsfreigabe erklaert. Push bleibt als diskreter Hinweis beschrieben. Die App bleibt ohne alle drei Verbindungen nutzbar.
- Die iOS-Ansicht rollt einen Toggle bei einem Requestfehler auf seinen vorherigen Wert zurueck und behaelt die Seite offen. Es wurden keine neuen SDKs, Analyticsbibliotheken, Client-Schluessel oder Token-URLs eingefuehrt.
- Verifikation: Fastlane-Simulator-Builds auf iPhone 17 Pro Max und iPad Pro 13-inch (M5) erfolgreich. Screenshots `/tmp/playplaner-optional-consents-iphone-cycle3b.png`, `/tmp/playplaner-optional-consents-iphone17e-dynamic-cycle3.png` (Dark Mode, Accessibility Extra Large) und `/tmp/playplaner-optional-consents-ipad-cycle3.png` wurden visuell auf Lesbarkeit, Tapflaechen und Ueberlappungen geprueft.
- Reversibler Live-Smoke im isolierten Review-Mandant: OPENAI von `false` auf `true` und wieder auf `false`; anschliessend die temporaere App-Sitzung widerrufen und HTTP 401 fuer den Testtoken bestaetigt. Es wurden keine Inhaltsdaten angelegt oder uebertragen.
- Rueckbau: iOS-Aenderungen in `PlayPlanerAPI.swift`, `ComplianceViews.swift` und `ContentView.swift` revertieren. Der Backendvertrag und bestehende Consentdaten bleiben kompatibel bestehen; fachliche Einwilligungen duerfen nicht durch einen Code-Rollback veraendert werden.
- Dieser Stand ist iOS-Zyklus `3/5` nach TestFlight Build 103; daher kein Upload in diesem Zyklus.
