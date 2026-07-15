# Apple App Store Compliance und Rueckbauprotokoll

Stand: 2026-07-14

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

### Historische P0-Luecken vor dem Umbau

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
| 2026-07-13 | Inventur | Diese Compliance- und Rueckbauakte angelegt | Dokument committen | Dokumentdatei entfernen | Vollstaendige Readiness-Matrix, Rueckbauabschnitte und Quellcode-/Live-Nachweise bis 14.07.2026 | Erfuellt |
| 2026-07-13 | Begriffe | Sichtbare Auftragsbegriffe neutralisiert und `canBeCommissioned` als additiven API-Alias eingefuehrt | Backend und iOS verstehen neuen Alias, Legacy-Feld bleibt erhalten | Nutzertexte zuruecksetzen und Alias entfernen; keine Datenmigration erforderlich | Prisma/TypeScript und Fastlane-Simulator-Build erfolgreich; Screenshot `/tmp/playplaner-appstore-order-wording-20260713.png` | Erfuellt |
| 2026-07-13 | Tokens | Regulaere externe API-Authentifizierung auf Bearer-Header beschraenkt; geschuetzte Download-URLs enthalten keine Tokens mehr | `tokenFromRequest` liest nur `Authorization: Bearer`; Serializer liefern `downloadUrlWithToken: null` | Code-Revert moeglich, aus Sicherheitsgruenden nicht empfohlen; keine Datenmigration | TypeScript erfolgreich; Query-Token-Nutzung per Quellcodesuche ausgeschlossen | Erfuellt |
| 2026-07-13 | Kontoloeschung | Fehlgeschlagene Storage-Bereinigung behaelt ID und `storagePath` im Loeschjob | Retry kann die physische Datei weiterhin eindeutig adressieren | Feldinhalt leeren; keine Schemaaenderung | Physische Datei, Datenbankdaten, Tokenwiderruf und erneuter Login live geprueft; letzter Admin liefert 409 | Erfuellt |
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
| Melden und Blockieren | Erfuellt | ContentEntry, Feed-Kommentare, Packlisten/-Events und Kalendereintraege liefern live betrachterbezogene Rechte. Melden, gegenseitige Blockierung und Moderationsfilter wurden mit Alex/Sam reversibel ueber die echten HTTPS-Routen geprueft und vollstaendig bereinigt. |
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

- Historischer Zwischenstand dieses Zyklus: Neue Uploads wurden anhand ihrer tatsaechlichen Byte-Signatur gegen eine enge MIME-Allowlist und das konfigurierte Groessenlimit geprueft; der EICAR-Testmarker wurde serverseitig abgelehnt. Dieser Zwischenstand wurde noch vor der Store-Endabnahme durch den unten dokumentierten, fail-closed betriebenen ClamAV-INSTREAM-Dienst ersetzt. Die fruehere offene Scannerentscheidung ist damit nicht mehr aktuell.
- Medien verwenden additiv `SAFE`, `MATURE_SUGGESTIVE`, `EXPLICIT`, `UNKNOWN` oder `QUARANTINED`. Neue Medien sind ohne ausdrueckliche Einstufung `UNKNOWN`; die Klassifikation kann nur der Eigentuemer ueber den bestehenden Media-PATCH-Vertrag aendern.
- Listen und Detailrouten liefern `contentClassification` und schliessen `QUARANTINED` aus. Der kombinierte Bilderfeed filtert ebenfalls quarantinisierte Medien, abgelehnte/quarantinisierte Ideen-Dateien, blockierte Owner und moderativ ausgeblendete Entities.
- Beide Dateiabrufe (`/api/files/{id}` und `/api/external/files/{id}`) verwenden `fileAssetForAccess`; diese Funktion liefert Assets mit `QUARANTINED` oder `scanStatus=REJECTED` nie aus. Damit kann eine bereits bekannte direkte Datei-ID die Moderation nicht umgehen.
- Die Adminmassnahmen `HIDE_CONTENT` und `DELETE_CONTENT` synchronisieren bei Medien die Quarantaene transaktional auf `Media` und `FileAsset` und setzen `quarantinedAt`.
- Rueckbau: Die Route-/Serializer-/Dateipruefungen koennen gemeinsam per Commit-Revert entfernt werden. Vorhandene Klassifikationsfelder bleiben additiv. Um eine konkrete Moderationsquarantaene fachlich aufzuheben, muessen sowohl `Media.contentClassification` als auch `FileAsset.contentClassification` bewusst auf den vorherigen Wert gesetzt und `quarantinedAt` geloescht werden; ein blosser Code-Rollback darf quarantinisierte Inhalte nicht automatisch freigeben.
- Verifikation: TypeScript `tsc --noEmit` erfolgreich. Produktivdeploy von Commit `288cd32` inklusive Prisma-Generierung, Next.js-Kompilierung und Typpruefung erfolgreich; `kink_social_app` lief danach auf Port 8097.
- Reversibler Live-Smoke: Ein privates PNG wurde als `EXPLICIT` hochgeladen (HTTP 200), von Media und FileAsset als `EXPLICIT`/`CLEAN` serialisiert und mit Bearer-Header abgerufen (HTTP 200). Nach synchroner Quarantaene von Media und FileAsset lieferten Dateidownload und Detail jeweils HTTP 404, waehrend die Listenroute HTTP 200 ohne das Testmedium lieferte.

### Persoenliche Medienansicht ohne Paarmoderation

- Private Paare und bekannte Zirkel brauchen keine manuelle Vorabfreigabe ihrer Bilder durch Administratoren oder andere Dritte. Meldungen bleiben eine freiwillige Schutzfunktion fuer Beteiligte und loesen keinen normalen Freigabeprozess aus.
- `UserSettings.showSensitiveMedia` ist additiv und standardmaessig `false`. `GET/PATCH /api/external/account/privacy-settings` liefert und speichert den Zustand typisiert fuer Web und native iOS-Einstellungen; der strikte Vertrag akzeptiert ausschliesslich bekannte Privacy-Felder.
- Bei deaktivierter Einstellung bleiben `UNKNOWN`- und `MATURE_SUGGESTIVE`-Medien in iOS verdeckt. Bei bewusster Aktivierung koennen sie im bereits autorisierten privaten Kontext direkt erscheinen. `SAFE` bleibt sichtbar. `EXPLICIT` und `QUARANTINED` bleiben in iOS immer gesperrt; grafisch explizite Inhalte sind nur auf der Website im ohnehin berechtigten privaten Bereich erreichbar.
- Das Modell setzt Apples UGC-Ausnahme fuer beiläufige reife Webinhalte um: standardmaessig verborgen und nur durch eine persoenliche, jederzeit widerrufbare Einstellung aktivierbar. Es ist kein Review-Schalter und gilt dauerhaft fuer das reale Produkt.
- Migration: `prisma/manual-migrations/20260714_sensitive_media_preference/up.sql`. Rueckbau: zuerst iOS-Leselogik und Webformular per Commit-Revert entfernen, anschliessend optional `down.sql` ausfuehren. Das Entfernen der Spalte setzt keine Medien frei und veraendert keine Dateien oder Klassifikationen.
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
- Offene manuelle Punkte: rechtliche Freigabe der veroeffentlichten Texte und Kontakte, tatsaechliche Besetzung der Postfaecher sowie visuelle Product-Page-Endkontrolle. Altersdeklaration, produktiver Malware-Scanner und Speicherung/Veroeffentlichung der Privacy Labels sind inzwischen erfuellt.
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
- Die App-Store-Datenschutzangaben wurden aus Quellcode, Schema, aktiven Integrationen und Serverbetrieb in `app-store-privacy-labels.md` abgeleitet. Der Servernachweis bestaetigt IP-basierte Nginx-Zugriffslogs mit taeglicher Rotation und 14 aufbewahrten Rotationen. Am 2026-07-14 synchronisierte und veroeffentlichte die neue iOS-Fastlane-Lane exakt 15 kanonische Deklarationen; der Readback bestaetigte `published=true`, keine Tracking-Zeile und einen idempotenten zweiten Lauf. Der vorherige leere Zustand liegt als lokales Rueckbau-JSON ausserhalb beider Repositories.
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

## Zyklus 18: Reproduzierbare App-Store-Datenschutzlabels

- Das iOS-Repository enthaelt mit `fastlane/metadata/privacy_labels.json` eine maschinenlesbare Quelle fuer alle in `app-store-privacy-labels.md` fachlich begruendeten Kategorien, Zwecke und Schutzmerkmale.
- `bundle exec fastlane ios store_privacy_labels` verwendet ausschliesslich die lokale Apple-Sitzung, nicht das Backend und keine im Repository gespeicherten Zugangsdaten. Vor einer Aenderung schreibt die Lane den vollstaendigen bisherigen ASC-Zustand mit Modus 600 nach `~/.playplaner`.
- Der Synchronisierer fuegt fehlende Kombinationen hinzu, entfernt nicht kanonische Kombinationen, veroeffentlicht die Deklaration und verlangt danach einen exakten Readback. Eine Tracking-Zeile oder eine Abweichung fuehrt zum Fehler.
- Produktionsnachweis 2026-07-14: der Ausgangsstand enthielt null Deklarationen. Der erste Lauf endete mit exakt 15 Deklarationen und `published=true`; der zweite Lauf bestaetigte denselben Zustand ohne zusaetzliche Zeilen.
- Rueckbau: `PLAYPLANER_PRIVACY_LABELS_ROLLBACK=~/.playplaner/<backup>.json bundle exec fastlane ios store_privacy_labels`. Der Restore stellt die gesicherten Kombinationen und den damaligen Veroeffentlichungsstatus wieder her und verifiziert ebenfalls per Readback. Die Sicherung bleibt lokal und wird nicht nach GitHub uebertragen.
- `verify_app_store_readiness.rb` prueft nun zusaetzlich die kanonische JSON-Datei, den Nicht-Tracking-Status, `DATA_LINKED_TO_YOU`, App-Funktionalitaet fuer jede Kategorie und das Vorhandensein der Fastlane-Lane.
- Verifikation: Fastlane-Simulator-Builds auf iPhone 17 Pro Max und iPad Pro 13-inch (M5) erfolgreich. Screenshots `/tmp/playplaner-optional-consents-iphone-cycle3b.png`, `/tmp/playplaner-optional-consents-iphone17e-dynamic-cycle3.png` (Dark Mode, Accessibility Extra Large) und `/tmp/playplaner-optional-consents-ipad-cycle3.png` wurden visuell auf Lesbarkeit, Tapflaechen und Ueberlappungen geprueft.
- Reversibler Live-Smoke im isolierten Review-Mandant: OPENAI von `false` auf `true` und wieder auf `false`; anschliessend die temporaere App-Sitzung widerrufen und HTTP 401 fuer den Testtoken bestaetigt. Es wurden keine Inhaltsdaten angelegt oder uebertragen.
- Rueckbau: iOS-Aenderungen in `PlayPlanerAPI.swift`, `ComplianceViews.swift` und `ContentView.swift` revertieren. Der Backendvertrag und bestehende Consentdaten bleiben kompatibel bestehen; fachliche Einwilligungen duerfen nicht durch einen Code-Rollback veraendert werden.
- Dieser Stand ist iOS-Zyklus `3/5` nach TestFlight Build 103; daher kein Upload in diesem Zyklus.

## Zyklus 19: Reproduzierbarer Geraetesmoke und TestFlight Build 104

- Das iOS-Repository besitzt nun die getrennte Fastlane-Lane `ios device_smoke`. Sie loest CoreDevice-ID und Hardware-UDID aufeinander ab, prueft die Developer-Disk-Services vor dem Build und installiert beziehungsweise startet ausschliesslich einen Debug-Development-Build auf dem explizit gewaehlten Geraet. Sie erzeugt kein Archiv, erhoeht keine Buildnummer und fuehrt keinen Upload aus.
- Das gekoppelte iPad Pro `GSSx Pad` wurde korrekt erkannt. Der reale Lauf wurde vor dem Build mit Apples Fehler `kAMDMobileImageMounterDeviceLocked` beendet, weil das Geraet gesperrt war. Der Hardwaretest bleibt deshalb offen und muss nach dem Entsperren wiederholt werden; Simulator- oder TestFlight-Erfolg gelten nicht als Ersatz.
- Der Fastlane-Simulator-Smoke auf iPad Pro 13-inch (M5) sowie `ios verify_store` waren erfolgreich. Der visuell gepruefte iPad-Nachweis liegt lokal unter `/tmp/playplaner-device-smoke-cycle5-ipad2.png`; Store-Screenshotbestand weiterhin exakt `3 + 3`.
- Vor dem TestFlight-Lauf lagen 8 Builds im rollierenden 24-Stunden-Fenster. Build `1.0 (104)` wurde ausschliesslich ueber die Fastlane-`beta`-Lane archiviert, signiert und hochgeladen. App Store Connect bestaetigte Build-ID `9518a2e3-fba2-4e6b-b68d-a2fba3b41285`, Status `VALID`, Audience `APP_STORE_ELIGIBLE` und `usesNonExemptEncryption=false`.
- Rueckbau: Die Geraetesmoke-Lane kann durch Revert des iOS-Commits entfernt werden; sie hat weder Backend- noch Produktivdaten veraendert. Ein bereits zu App Store Connect hochgeladener Build wird nicht ueberschrieben. Bei Bedarf wird Build 104 in App Store Connect nicht fuer Tests oder Einreichung ausgewaehlt und durch einen spaeteren, korrigierten Build ersetzt.
- Dieser Abschluss ist iOS-Zyklus `5/5` nach Build 103. Der Zykluszaehler beginnt mit TestFlight Build 104 wieder bei `0/5`.

## Zyklus 20: Guideline 3.1 und Monetarisierungswache

- Der gepruefte iOS-Funktionsumfang enthaelt keine bezahlten digitalen Funktionen, Abonnements, In-App-Kaeufe oder gespeicherte Kaufhistorie. Die sichtbaren `Shopify-Produkte` sind ein getrennter Katalog fuer physische Produkte; es gibt in der nativen App keinen Checkout und keine Umgehung eines digitalen In-App-Kaufs.
- `verify_app_store_readiness.rb` stoppt kuenftige Store-Builds bei StoreKit-Import, StoreKit-Produkt-/Kauf-/Entitlement-Aufrufen oder einem verlinkten `StoreKit.framework`. Die eindeutige sichtbare Bezeichnung `Shopify-Produkte` bleibt ebenfalls Teil der Pruefung.
- `verify-app-store-compliance.js` stoppt bei typischen Payment-/Abo-SDKs, digitalen Kauf-/Abo-Modellen oder neu eingefuehrten Billing-, Subscription-, Checkout- beziehungsweise Purchase-Routen. Ein spaeteres Geschaeftsmodell muss deshalb bewusst nach Guideline 3.1 bewertet werden, bevor die Verifier angepasst werden duerfen.
- Rueckbau: Die beiden zusaetzlichen statischen Pruefbloecke und diese Dokumentationszeilen koennen ohne Datenmigration revertiert werden. Es wurden keine Produktivdaten, Shopify-Daten oder Store-Einstellungen veraendert.
- Negativnachweis: Eine temporaere Swift-Datei mit `import StoreKit` fuehrte reproduzierbar zu `APP_STORE_READINESS_FAILED` und wurde direkt danach entfernt. Der unveraenderte Produktcode bestand anschliessend wieder `APP_STORE_READINESS_OK`; der Backendcheck meldete `COMPLIANCE_STATIC_OK`.
- Visueller Nachweis auf iPhone 17e: `/tmp/playplaner-guideline31-physical-products-cycle1-retry.png` zeigt die native Detailansicht mit dem eindeutigen Titel `Shopify-Produkte`, Relationen und Teilen/Sync, aber ohne Kauf-, Preis-, Abo- oder Checkout-Element. Dies ist iOS-Zyklus `1/5` nach TestFlight Build 104.

## Zyklus 21: Bearer-only-Vertrag ohne widerspruechliche Beispiele

- Die regulaere externe API akzeptierte bereits ausschliesslich `Authorization: Bearer`, waehrend eine Capability-Beschreibung, die API-Control-Vorschau und aeltere Mobile-/Implementierungsdokumentation noch Query- oder Multipart-Token empfahlen. Diese widerspruechlichen Hinweise wurden entfernt; kurzlebige signierte Einmal-Tokens fuer Web-Session-Bridge und Einladungen bleiben klar als eigener, begrenzter Vertrag dokumentiert.
- `POST /api/external/media` beschreibt jetzt ausschliesslich Bearer-Authentifizierung. Die API-Control-Vorschau nennt weder Query- noch Multipart-Token. Chat-SSE, Katalogbilder und geschuetzte Dateien dokumentieren denselben Bearer-Header wie ihre Listenabfragen; `downloadUrlWithToken` bleibt nur als kompatibles `null`-Feld bestehen.
- Der statische Compliance-Test stoppt jetzt bei Query-/Multipart-Token-Hinweisen in Capabilities, API-Control, Mobile-Dokumentation oder Implementierungslog. Er prueft weiterhin, dass `tokenFromRequest` keine Queryparameter liest.
- Reversibler Live-Smoke gegen den Review-Mandant: Bearer-Aufruf von `/api/external/status` HTTP 200, derselbe API-Token als Queryparameter HTTP 401, derselbe Token als Multipartfeld bei `/api/external/media` HTTP 401. Die temporaere App-Sitzung wurde danach widerrufen.
- Rueckbau: Text- und Testaenderungen koennen ohne Migration revertiert werden. Das Wiederzulassen oder erneute Empfehlen regulaerer Query-/Multipart-Tokens ist aus Sicherheitsgruenden nicht vorgesehen.
- Dies ist iOS-/Backend-Zyklus `2/5` nach TestFlight Build 104; kein TestFlight-Upload.

## Zyklus 22: Additive Inhaltsbereiche fuer Tagebuch, Wiki und Ideen

- Vorher waren Tagebuch/Wiki und Ideensammlung zwei technisch getrennte Modelle. Frei benennbare Bereiche mit eigenen Eintraegen, Anlagen und Nutzer-/Zirkel-Freigaben fehlten. Die neuen Modelle `ContentSpace`, `ContentEntry` und `ContentEntryAttachment` sind additiv; bestehende Produkt- und Compliance-Modelle bleiben erhalten.
- Bestehende `WikiPage`- und `ActivityPlan(category=IDEA_COLLECTION)`-Datensaetze bleiben unveraendert und erscheinen als virtuelle Bereiche `legacy-wiki` (`Tagebuch`) und `legacy-ideas` (`Ideensammlung`). Es findet weder eine Inhaltskopie noch eine automatische Sichtbarkeitserweiterung statt. Legacy-Eintraege bleiben ueber ihre bisherigen Modelle editierbar.
- Frei benennbare Bereiche speichern neue Eintraege eigenstaendig. Titel, Inhalt, explizites Kalenderdatum, optionale Sichtbarkeit, Audio-Transkription und gepruefte Dateianlagen sind nativ abgebildet. `sourceType` und `sourceId` bleiben fuer spaetere Relationen verfuegbar.
- Sichtbarkeit ist nutzerverstaendlich `PRIVATE`, `USERS`, `CIRCLES` oder `SHARED`. Freigaben werden als explizite Nutzer- und Zirkel-ID-Listen gespeichert. Der bestehende `X-Playplaner-View-Context` wird ueber `requireApiUser` weiter respektiert.
- Das DELETE eines benutzerdefinierten Bereichs setzt nur `archivedAt`; Bereich, Eintraege und Anlagen bleiben fuer einen kontrollierten Rueckbau erhalten. Die virtuellen Legacy-Bereiche koennen weder geaendert noch archiviert werden. Ein explizites Entry-DELETE bleibt eine eigene Nutzeraktion.
- Beim Zirkel-Austritt werden eigene Bereiche auf privat gesetzt und Freigaben auf den verlassenen Zirkel beziehungsweise Benutzer entfernt. Der Datenexport enthaelt Bereichsmetadaten, Eintraege und Anlagen; die vorhandene echte Kontoloeschung entfernt Eigentuemerdaten ueber Kaskaden.
- Rueckbau nach vorherigem Datenexport: `prisma/manual-migrations/20260714_content_spaces/down.sql` entfernt ausschliesslich die drei neuen Tabellen. `WikiPage`, `ActivityPlan` und deren Dateien bleiben bestehen. `up.sql` stellt die generischen Tabellen wieder her; es gibt bewusst keinen kopierenden Backfill.
- Isolierter PostgreSQL-16-Nachweis: aktuelles Schema erstellt, `down.sql`, `up.sql` und erneut `down.sql` liefen mit `ON_ERROR_STOP=1`. Nach jedem Down bestanden `WikiPage` und `ActivityPlan` weiter; alle drei Content-Space-Tabellen waren entfernt.
- Ein frischer Next-15.5.20-Dockerbuild bestand mit allen Routen. Ein isolierter HTTP-Smoke meldete sich nativ an, las beide virtuellen Standardbereiche, legte einen benutzerdefinierten Bereich und eigenen Eintrag an, aenderte Titel/Kalenderdatum und archivierte den Bereich. Danach war er nicht mehr aufrufbar, waehrend Bereich und Eintrag nachweislich in der Datenbank erhalten blieben. `SecurityRateLimit`, `LegalDocument` und `ContentReport` waren gleichzeitig vorhanden. Prisma-Generate, TypeScript und `COMPLIANCE_STATIC_OK` bestanden.
- Vor dem Produktivabgleich wurden Datenbank, Serverquellstand, Containerbeschreibung und laufendes Image unter `/opt/kink-social-platform/backups/pre-content-spaces-reconcile-20260714-085259` gesichert. Die parallel deployte Vorabimplementierung enthielt noch keine Content-Space-Daten; dadurch ist die Zusammenfuehrung ohne Inhaltsverlust moeglich.
- Noch nicht als live markieren: Produktivdeploy und reversibler Live-Smoke muessen gegen diesen finalen Vertrag abgeschlossen werden. Die iOS-Oberflaeche folgt anschliessend gegen exakt diese Antworten.

### Nativer Sammlungsabschluss und Freigabeziele, 2026-07-14

- Commit `bb62c4e` wurde nach dem geschuetzten Backup `/opt/kink-social-platform/backups/pre-content-spaces-reconcile-20260714-085259` produktiv ausgerollt. Ein reversibler Live-Smoke pruefte virtuelle Legacy-Bereiche, benutzerdefinierten Bereich, nativen Eintrag, Kalenderdatum, PNG-Anlage, Anlage-Loeschung, Archivierung und Tokenwiderruf. Alle temporaeren Datensaetze, Auditlogs und Dateien wurden anschliessend entfernt.
- `GET /api/external/content-spaces/share-targets` liefert die fuer native Freigabepicker erforderlichen aktiven Personen und Zirkel. Die Antwort enthaelt keine E-Mail-Adressen, schliesst blockierte Personen aus und begrenzt normale Benutzer auf eigene Zirkel. Mehrfachmitgliedschaften werden als vollstaendige `circleIds`-Liste ausgegeben.
- Beide Transkriptionspfade akzeptieren `keepAudio`. Ohne ausdrueckliche Auswahl wird keine Audiodatei gespeichert. Bei `keepAudio=true` wird die bereits transkribierte Aufnahme erst danach durch die zentrale bytebasierte Typpruefung und Malware-Pruefung gespeichert und als Anlage mit dem jeweiligen Eintrag verknuepft.
- Der Nachtrag ist additiv und rueckbaubar: Entfernen der Share-Targets-Route und der `keepAudio`-Verzweigungen stellt den vorherigen Vertrag wieder her; bestehende Inhalte werden dadurch nicht veraendert. Der Tabellen-Rueckbau bleibt in `prisma/manual-migrations/20260714_content_spaces/down.sql` dokumentiert.
- Verifikation des Nachtrags: `npx prisma generate`, TypeScript, `COMPLIANCE_STATIC_OK` und ein frischer Next-15.5.20-Dockerbuild mit sichtbaren Content-Space-, Share-Targets-, Anlagen- und Transkriptionsrouten bestanden.

## Zyklus 23: Selbstbestimmte private Medien

- Private Bilder bekannter Paare und Zirkel durchlaufen keinen manuellen Vorabgenehmigungsprozess durch Dritte. Technische Dateipruefung, Zugriffsrechte, freiwilliges Melden/Blockieren und Quarantaene bleiben getrennte Schutzmechanismen.
- `SAFE` und `MATURE_SUGGESTIVE` sind im berechtigten privaten iOS-Kontext sichtbar. `UNKNOWN` ist standardmaessig verdeckt und wird nur nach persoenlicher Aktivierung im eingeloggten Webprofil sichtbar. `EXPLICIT` und `QUARANTINED` bleiben in iOS immer gesperrt.
- `UserSettings.showSensitiveMedia` ist additiv und standardmaessig `false`. Seit dem nativen Einstellungsnachtrag kann die iOS-API den Zustand typisiert lesen und aendern; unbekannte PATCH-Felder bleiben mit HTTP 400 abgewiesen.
- Der historische Live-Smoke bestaetigte GET, strikte Feldvalidierung, Sitzungswiderruf und Ausgangswert. Der native PATCH-Pfad wird im nachfolgenden Zyklus erneut reversibel mit `false -> true -> false` geprueft.
- Rueckbau: iOS-Commit fuer die Leselogik und Backend-/Web-Commit revertieren; danach kann optional `prisma/manual-migrations/20260714_sensitive_media_preference/down.sql` ausgefuehrt werden. Medien, Klassifikationen und Dateien werden dadurch nicht veraendert.

## Zyklus 24: Lokaler Geraeteschutz und TestFlight-Zyklus 5

- Der iOS-Zustandsautomat der optionalen App-Sperre behandelt einen fehlenden Hintergrundzeitpunkt nach erfolgreicher Authentifizierung nicht mehr als unendliche Inaktivitaet. Dadurch kann ein direkt folgendes Aktivierungsereignis keine zweite, unnoetige Authentifizierung ausloesen.
- `scripts/verify_app_store_readiness.rb` prueft jetzt verbindlich den globalen Privacy-Gate, `LocalAuthentication.deviceOwnerAuthentication`, App-Umschalter-/Hintergrundabdeckung, kontrolliertes Zuruecksetzen des Hintergrundzeitpunkts, native Aktivierung/Timeouts und die ausschliessliche DEBUG-Verfuegbarkeit des Screenshot-Hooks.
- Fastlane-Store-Pruefung und Simulatorbuilds auf iPhone 17 und iPad mini (A17 Pro) bestanden. Der normale iPhone-Simulatorlauf bestaetigte `canEvaluatePolicy=YES` und den gestarteten Systemdialog; die App zeigte dabei keine privaten Inhalte. Schutzansichten auf iPhone und iPad wurden visuell geprueft.
- Rueckbau: iOS-Commit revertieren. Es gibt keine Backend-, Datenbank- oder Produktivdatenaenderung. Die App-Sperre bleibt fuer Benutzer standardmaessig aus; vorhandene lokale Einstellungen werden durch den Code-Rueckbau nicht serverseitig veraendert.
- Offene manuelle Endabnahme: Face-ID-Erfolg und App-Umschalter-Snapshot auf einem entsperrten physischen Geraet. Die beim Zyklusabschluss gekoppelten Geraete waren nicht erreichbar; dieser Punkt bleibt in der Readiness-Matrix ausdruecklich organisatorisch offen.
- Der reale Face-ID-Loop wurde auf den Scene-State nach erfolgreicher Authentifizierung zurueckgefuehrt: Ein geloeschter Hintergrundzeitpunkt wurde zuvor als unendlich lange Inaktivitaet bewertet. Die iOS-App unterscheidet nun einen echten Hintergrundwechsel von einem normalen aktiven Zustand und entfernt den Opacity-Uebergang der Schutzflaeche gegen sichtbares Aufblitzen. Eine statische Readiness-Pruefung verhindert beide Rueckfaelle.
- Der erste Release-Archivversuch fuer Build 105 endete vor Signierung und Upload an einer nur in Release sichtbaren DEBUG-Variablen im Tracker-Stream. Nach der korrigierten Compile-Grenze liefen optimierter Release-Simulator-Build, Store-Pruefung und Release-Archiv erfolgreich. Derselbe Build 105 wurde ohne weiteres Hochzaehlen per Fastlane uebertragen. App Store Connect bestaetigte Build-ID `8e5402bb-fff6-4978-9e4c-126f68a9a0c9`, Status `VALID` und `usesNonExemptEncryption=false`; danach 10 Uploads im rollierenden 24-Stunden-Fenster.

## Zyklus 25: Reproduzierbarer Sperrzustandsautomat

- Die reine Aktivierungsentscheidung der optionalen iOS-App-Sperre liegt in `AppPrivacyLockState`. `AppPrivacyGateView` verwendet dieses Ergebnis direkt fuer Schutzflaeche, Sperrzustand, konsumierten Hintergrundzeitpunkt und die Entscheidung, LocalAuthentication erneut zu starten.
- Der eingecheckte Swift-Smoke prueft den gemeldeten Loop als Negativfall sowie deaktivierte Sperre, aktive Sperre, Timeoutgrenze und Sofortsperre. `fastlane ios verify_store` kompiliert und startet den Test bei jedem Store-Check; Ausgabe `APP_PRIVACY_LOCK_STATE_OK` und anschliessend `APP_STORE_READINESS_OK`.
- Fastlane-Builds bestanden auf iPhone 17e (Debug), iPad mini A17 Pro (Debug) und iPhone 17 (Release/WMO). Die Schutzansicht wurde im Dark Mode auf dem kleinen iPhone visuell geprueft. Das Xcode-26.5-`simctl` bietet keinen Biometrie-Unterbefehl, die sichtbare Simulatorautomation war bei gesperrtem macOS nicht verfuegbar und beide physischen Geraete waren weiterhin `unavailable`. Ein echter Face-ID-/App-Switcher-Hardwaretest bleibt deshalb eine manuelle Endabnahme.
- Rueckbau: iOS-Zustandsdatei und Test entfernen und `AppPrivacyGateView.activate()` auf die vorherige inline Entscheidung zuruecksetzen. Es gibt keine Backend-, Datenbank-, Produktivdaten- oder Store-Aenderung. Dieser Stand ist Zyklus `1/5` nach TestFlight Build 105; kein Upload.

## Zyklus 26: Reproduzierbare App-Store-Connect-Vorbereitung

- Die iOS-Fastlane-Lane `store_prepare_version` waehlt ausschliesslich einen lokal erwarteten, bei Apple `VALID` verarbeiteten Build ohne offene Export-Compliance aus. Fuer Version `1.0` wurde Build `105` ausgewaehlt und ueber die Build-Relationship zurueckgelesen.
- Wegen privater UGC- und importierter Produktinhalte ist `contentRightsDeclaration=USES_THIRD_PARTY_CONTENT` versioniert in `fastlane/metadata/content_rights.json` hinterlegt, gesetzt und per API verifiziert.
- Playplaner ist als kostenlose App vorbereitet. Apples alter, von Fastlane 2.230.0 verwendeter kombinierter Preis-/Territorien-Endpunkt ist nicht mehr gueltig. Die neue Lane verwendet deshalb die aktuelle Preisplan-API und Availability V2. Ein vom alten Versuch angelegter leerer Preisplan wurde erkannt und mit einem verifizierten Preis `0.0` vervollstaendigt.
- Readback: `availableInNewTerritories=true`, 175 von 175 gelieferten Territorien verfuegbar, Build `105` `VALID`, Inhaltsrechte gesetzt und null Review-Submissions. Die sechs bereits hochgeladenen Screenshots sind jeweils `COMPLETE` (3 iPhone, 3 iPad).
- `store_metadata` synchronisierte danach Metadaten und Altersfreigabe ohne Fehler. `verify_store` bestand mit `APP_PRIVACY_LOCK_STATE_OK` und `APP_STORE_READINESS_OK`.
- Es wurde weder eine Review-Einreichung erstellt noch ein TestFlight-Build hochgeladen. Die sichtbare Kontrolle in App Store Connect bleibt offen, weil die vorhandenen Chrome-Tabs ausgeloggt waren. Dieser Stand ist Zyklus `2/5` nach TestFlight Build 105.
- Rueckbau: In App Store Connect Build abwaehlen und Preis-, Territorien- oder Inhaltsrechte vor Einreichung aendern; anschliessend den iOS-Commit mit Lane und Metadatenkonfiguration revertieren. Es gibt keine Backend-, Datenbank- oder Produktivdatenaenderung.

## Zyklus 27: Ehrliche Accessibility-Labels und robuster App-Sperrzyklus

- Die iOS-App deklariert fuer iPhone und iPad ausschliesslich den vollstaendig visuell geprueften Dark-Mode-Support. Alle weiteren Accessibility Nutrition Labels bleiben bis zu einem vollstaendigen Audit aller haeufigen Aufgaben ausdruecklich unbeansprucht.
- Die neue Fastlane-Lane legt beide Deklarationen reproduzierbar an und liest den exakten Zustand zurueck. Apple erlaubt die Veroeffentlichung erst nach dem ersten App-Store-Release; deshalb stehen iPhone und iPad aktuell ehrlich auf `DRAFT`. Die Lane akzeptiert nur Apples konkreten Vorab-Release-Zustandsfehler und wird nach dem ersten Release erneut ausgefuehrt, um `PUBLISHED` zu verlangen.
- Die optionale lokale App-Sperre startet je Sperrzyklus hoechstens einen automatischen LocalAuthentication-Versuch. Abbruch oder Fehlschlag fuehren nicht mehr zu einer erneuten automatischen Face-ID-Schleife; ein neuer Versuch erfordert den sichtbaren Button. Mehrfaches `onAppear`, parallele Versuche und verspaetete Callbacks sind abgesichert.

### Face-ID-Systemwechsel und Sofortsperre (2026-07-14)

- Der native iOS-Gate unterscheidet den von `LocalAuthentication` selbst erzeugten Wechsel `inactive/background/active` jetzt von einem echten Verlassen der App. Waehrend eines Face-ID-/Geraetecode-Versuchs wird kein neuer Inaktivitaetszeitpunkt gespeichert und bei der Rueckkehr keine zweite Timeoutentscheidung ausgeloest. Eine erfolgreiche Antwort in noch inaktiver Scene behaelt die Schutzflaeche bis zur echten Rueckkehr. Damit kann besonders die Einstellung `Sofort` nach erfolgreicher Erkennung keinen Authentifizierungsloop mehr erzeugen.
- Ein spaeterer echter Hintergrundwechsel startet weiterhin den konfigurierten Sperrzyklus. App-Umschalter-Inhalte bleiben auch waehrend des Systemdialogs verdeckt. Abbruch oder Fehler lassen den Gate geschlossen und erfordern den sichtbaren manuellen Entsperrbutton.
- Ausfuehrbare Swift-Regressionstests und der fail-closed Store-Verifier pruefen die neue Grenze. Fastlane-Debug-Builds bestanden auf iPhone 17e und iPad mini (A17 Pro). Eine echte Face-ID-Erfolgskette bleibt mangels Simulator-Biometrie als physischer Geraetetest offen.
- Rueckbau: ausschliesslich den zugehoerigen iOS-Commit revertieren. Es gab keine Backend-, Datenbank-, Produktivdaten-, App-Store-Connect- oder TestFlight-Aenderung.

### Nativer Login- und Compliance-Einstieg (2026-07-14)

- Der iOS-Login verhindert unvollstaendige sowie parallele Tastatur-/Button-Requests, fuehrt den Fokus nativ vom Benutzernamen zum Passwort und erhaelt beide Eingaben bei Netzwerk-, Server- oder Rate-Limit-Fehlern. Abgelehnte Zugangsdaten werden ohne technische Sitzungs- oder API-Sprache dargestellt.
- Loginfelder, Fehler und Hauptaktion besitzen stabile lokale Accessibility-Identifier und konkrete VoiceOver-Hinweise. Das Passwort bleibt ein natives geschuetztes Eingabefeld und wird weder im Accessibility-Baum noch in Screenshots offengelegt.
- Die optionale Alterspruefung wurde nicht verschaerft. Sie erscheint weiterhin ausschliesslich bei entsprechender Mandantenkonfiguration; Geburtsdatum und Alter werden nur lokal verwendet. Bestaetigung, Dokumente, Fehler und Kontowechsel sind nun eindeutig per VoiceOver und UI-Automation erreichbar.
- Fastlane-Store-Verifier, iPhone-/iPad-Simulatorbuilds, Dark-Mode-Screenshots und ein echter Simulator-Accessibility-Baumtest bestanden. Keine Backend-, Datenbank-, Produktiv- oder Storekonfiguration wurde geaendert.
- Rueckbau: zugehoerigen iOS-Commit und diesen Dokumentationsabschnitt revertieren.
- Ausfuehrbarer Swift-Regressionssmoke, statischer Store-Verifier sowie Fastlane-Simulator-Builds auf iPhone 17e und iPad mini (A17 Pro) bestanden. Schutzseite und Dark-Mode-Einstellungen wurden visuell geprueft. Der physische Face-ID-Endtest bleibt als manuelle Hardwareabnahme offen.
- Rueckbau: iOS-One-Shot-Zustand samt Tests und die getrennte Accessibility-Lane/JSON koennen unabhaengig revertiert werden. Es wurden weder Backend-/Produktivdaten noch eine Review-Einreichung oder ein neuer TestFlight-Build veraendert. Zyklusstand `3/5` nach Build 105.

## Zyklus 28: Reduzierte Bewegung

- Alle sieben selbst definierten SwiftUI-Bewegungen respektieren jetzt die iOS-Einstellung `Reduce Motion`. Bewegte Chat-/Diagnose-/Medien-Scrolls werden zu direkten Zustandswechseln, der Vordergrund-Push zu einem unbewegten Uebergang. Es gibt weder Endlosanimationen noch automatische Medienwiedergabe.
- Der Store-Verifier stoppt bei einem ungeschuetzten `withAnimation`, eigenen Transitionen ohne Reduce-Motion-Zweig oder `repeatForever`. Der DEBUG-Screenshotpfad kann den no-animation-Zweig reproduzierbar aktivieren; Release-Builds verwenden ausschliesslich die echte Systemeinstellung.
- Fastlane-Debug-Builds auf iPhone 17e und iPad mini (A17 Pro) sowie ein produktionsnaher Fastlane-Release-Simulator-Build auf iPhone 17 bestanden. Chat-Anfragekarte und Hauptaktionen wurden im Dark Mode auf beiden Geraeteklassen sowie auf dem kleinen iPhone mit sehr grosser Schrift geprueft.
- App Store Connect liest fuer iPhone und iPad jetzt `Dark Interface=true` und `Reduced Motion=true`; alle nicht vollstaendig auditierten Merkmale bleiben `false`. Beide Deklarationen bleiben bis zum ersten App-Store-Release erwartungsgemaess `DRAFT`.
- Rueckbau: iOS-Bewegungsschutz und Verifier revertieren, `supportsReducedMotion=false` synchronisieren. Keine Backend-, Datenbank-, Produktivdaten-, Review- oder TestFlight-Aenderung. Zyklus `4/5` nach Build 105.

## Zyklus 29: Benannte VoiceOver-Aktionen im Feed und in Medien

- Feedzeilen stellen ihre sichtbaren Funktionen jetzt als benannte VoiceOver-Aktionen bereit: Oeffnen, Herz geben/entfernen, Kommentieren/Kommentare oeffnen, Mehrfachauswahl, Auswahl aufheben und Ausblenden. Auswahlzustand, Detail und Zeitpunkt werden gesprochen; nicht oeffenbare Eintraege erhalten keinen falschen Oeffnen-Hinweis.
- Medienkacheln sprechen Typ, Titel, Schutzstatus und Kommentaranzahl. Albumfilter melden Auswahlzustand und Medienanzahl. Damit bleiben die kompakten visuellen Zeilen erhalten, ohne zentrale Funktionen fuer Screenreader zu verbergen.
- Der Store-Verifier stoppt, wenn diese zentralen Aktionen oder Beschriftungen entfernt werden. `supportsVoiceover` bleibt dennoch konservativ `false`, bis die komplette App mit VoiceOver durch alle haeufigen Aufgaben abgenommen wurde.
- Fastlane-Store-Verifier und Debug-Simulator-Builds auf iPhone 17e und iPad mini (A17 Pro) bestanden. Der Feed wurde im Dark Mode auf beiden Geraeteklassen visuell geprueft.
- Version `1.0 (106)` wurde ausschliesslich ueber Fastlane archiviert, signiert und an App Store Connect uebertragen. Apple bestaetigte Build-ID `643f6807-3498-4a53-b3ba-303f93b7ae63`, Status `VALID`, `usesNonExemptEncryption=false`, `expired=false` und Uploadzeit `2026-07-14T04:52:01-07:00`. Der Beta-Detail-Readback meldete `internalBuildState=IN_BETA_TESTING` und `autoNotifyEnabled=true`; die interne Gruppe besitzt Zugriff auf alle Builds. Danach lagen 10 Uploads im rollierenden 24-Stunden-Fenster; die Grenze 15 blieb eingehalten.
- Rueckbau: iOS-Accessibility-Modifizierer und zugehoerige Verifier-Regeln revertieren. Keine Backend-, Datenbank-, Produktivdaten- oder Review-Aenderung. Zyklus `5/5`; mit bestaetigtem Build 106 beginnt der Zaehler wieder bei `0/5`.

## Zyklus 30: VoiceOver-Aktionen fuer Chatnachrichten

- Chatnachrichten bieten die ueber Long-Press erreichbaren, tatsaechlich erlaubten Funktionen nun auch als benannte VoiceOver-Aktionen: Informationen, Loeschen, Melden, Blockieren und Ausblenden. Eigene, fremde und geloeschte Nachrichten erhalten weiterhin nur die jeweils zulaessigen Aktionen.
- Die Chatblase bleibt ein Container mit erreichbaren Kindaktionen fuer Bilder, strukturierte Objektkarten und Consent-Aktionen. Ihre gesprochene Zusammenfassung nennt Absender, Inhalt beziehungsweise Medientyp und Zeitpunkt.
- Kontextmenue und VoiceOver verwenden denselben Meldepfad. Der Store-Verifier verhindert das unbemerkte Entfernen der zentralen Aktionen und der gesprochenen Zusammenfassung. Die globale VoiceOver-Deklaration bleibt bis zur kompletten End-to-End-Abnahme konservativ aus.
- Fastlane-Store-Verifier und Debug-Simulator-Builds auf iPhone 17e und iPad mini (A17 Pro) bestanden. Der Dark-Mode-Chat wurde auf beiden Geraeteklassen visuell geprueft; ein schwarzer iPad-Launchframe zaehlt nicht als Nachweis.
- Rueckbau: Chat-Accessibility-Modifizierer, Helper und zugehoerige Verifier-Regeln revertieren. Keine Backend-, Datenbank-, Produktivdaten-, Store-, Review- oder TestFlight-Aenderung. Zyklus `1/5` nach Build 106.

## Zyklus 31: Katalog-VoiceOver und Face-ID-Aktivierung ohne Schleife

- Szenen- und Spielsachenkacheln nennen fuer VoiceOver Objektart, Titel, Kategorie, Favoriten- und Bildstatus; Kategoriefilter melden ihre Auswahl semantisch und Detailbilder ihren Fallbackstatus. Dekorative Symbole werden nicht doppelt gesprochen.
- Der iOS-Store-Verifier sichert die Katalogbeschriftungen gezielt im richtigen View-Segment ab. Der lokale DEBUG-Katalognachweis kann ohne produktive Sitzung lokale Beispieldaten verwenden; Release und regulaere App-Nutzung bleiben unveraendert authentifiziert.
- Ursache des beim Einschalten beobachteten Face-ID-Loops war ein zweiter Sperrzyklus direkt nach der bereits erfolgreichen Aktivierungspruefung, besonders bei `Sofort`. Die Aktivierung setzt die aktuelle Sitzung nun explizit entsperrt, verwirft den Systemdialog-Hintergrundzeitpunkt und startet erst nach einem spaeteren echten Hintergrundwechsel erneut LocalAuthentication.
- Der reine Swift-Zustandstest deckt aktive und inaktive Scene bei erfolgreicher Aktivierung ab. Fastlane-Store-Verifier sowie Debug-Builds auf iPhone 17e und iPad mini (A17 Pro) bestanden. Sperr- und Datenschutzansicht sowie der Spielsachenkatalog wurden im Simulator visuell geprueft; echter Face-ID-Erfolg bleibt mangels `simctl`-Biometriebefehl als physischer Geraetetest offen.
- Rueckbau: iOS-Katalog-Accessibility samt Verifier und den getrennten Aktivierungszustand samt zwei Tests revertieren. Keine Backend-, Datenbank-, Produktiv-, Store-, Review- oder TestFlight-Aenderung. Zyklus `2/5` nach Build 106.

## Zyklus 32: Kalender- und Tracker-Jahr-Accessibility

- Die native Monatsansicht spricht vollstaendige Datumswerte, kennzeichnet `Heute` textlich, markiert bedienbare Tage als Buttons und blendet leere Randtage ausserhalb des Monats fuer VoiceOver aus.
- Die Tracker-Jahresansicht besitzt eine neutrale Zoombezeichnung, einen gesprochenen Jahreswert und einzeln ausloesbare Accessibility-Aktionen fuer mehrere Tracker-Eintraege am selben Tag.
- Das visuelle Raster, die bestehenden Zoom-/Verschiebegesten und alle Backendvertraege bleiben unveraendert. Die statische Readiness-Pruefung wertet die konkreten SwiftUI-View-Segmente fail-closed aus.
- Fastlane-`verify_store` sowie Simulator-Builds auf iPhone 17e und iPad mini (A17 Pro) bestanden. Die Jahresansicht wurde auf beiden Geraeteklassen visuell ohne Layoutregression geprueft.
- Keine Backend-, Datenbank-, Produktiv-, Store- oder TestFlight-Aenderung. Zyklus `3/5` nach Build 106.

## Zyklus 33: VoiceOver in der Anfrageplanung

- Die native Anfrageplanung spricht Stunden- und Minutenwert, Ausgangsobjekt, Auswahlzusammenfassung und den konkreten Sendezustand. Ein deaktivierter Sendebutton erklaert den fehlenden Titel oder die noch fehlende inhaltliche Auswahl.
- Szenen, Spielsachen und Shopify-Produkte nennen Objektart, Titel und Auswahlzustand. Visuelle Thumbnails bleiben erhalten, werden innerhalb der bereits beschrifteten Toggles aber nicht doppelt vorgelesen.
- Fastlane-Store-Verifier sowie Debug-Builds auf iPhone 17e und iPad mini (A17 Pro) bestanden. Schnellplanung, geoeffnete Details und grosse Schrift wurden visuell ohne Ueberlagerung geprueft.
- Formularzustand, API-Vertrag, 15-Minuten-Raster, Draft-Schutz und Fehlererhaltung bleiben unveraendert. Keine Backend-, Datenbank-, Produktiv-, Store- oder TestFlight-Aenderung. Zyklus `4/5` nach Build 106.

## Zyklus 34: VoiceOver und UI-Testziele der Kontoloeschung

- Der native zweite Loeschschritt spricht den Zustand des Bestaetigungstexts, den laufenden destruktiven Request, die Unwiderruflichkeit und Fehler eindeutig. Die vorhandene zweistufige Loeschlogik, Eingabeerhaltung und der echte Backend-Loeschvertrag bleiben unveraendert.
- Stabile Accessibility-Identifier fuer Eingabe und Loeschbutton ermoeglichen spaetere native UI-Automation ohne personenbezogene Werte. Der iOS-Verifier prueft sieben Regeln gezielt im `AccountDeletionView`-Segment.
- Fastlane-Store-Verifier und Debug-Builds auf iPhone 17e sowie iPad mini (A17 Pro) bestanden. Der zweite Schritt wurde auf kleinem iPhone mit grosser Schrift und auf iPad visuell ohne Ueberlagerung geprueft.
- Vor dem vereinbarten fuenften Zyklusupload meldete App Store Connect 6 Builds im rollierenden 24-Stunden-Fenster. Fastlane archivierte, signierte und uebertrug `1.0 (107)`. Apple bestaetigte Build-ID `cc183e0c-6b4d-4bc3-aa97-ee9b7746c2f2`, `VALID`, `usesNonExemptEncryption=false`, `expired=false`, `IN_BETA_TESTING` und automatische interne Benachrichtigung. Danach lagen 7 Uploads in 24 Stunden. Keine Backend-, Datenbank- oder Produktivdatenaenderung; der Zykluszaehler beginnt bei `0/5`.

## Zyklus 37: Native Schutzaktionen fuer fremde Kommentare

- iOS zeigt bei ausdruecklich fremden Session- und Medienkommentaren ein gemeinsames natives Schutzmenue mit Melden, Blockieren und lokalem Ausblenden. Eigene oder nicht eindeutig zuordenbare Kommentare erhalten keine geratenen Fremdaktionen; berechtigte eigene Loeschaktionen bleiben erhalten.
- Die vorhandene Backend-Zielaufloesung fuer `sessionComment` und `mediaComment` wird unveraendert verwendet. Es gab in diesem Zyklus keine Backend-, Datenbank- oder Produktivdatenaenderung.
- Der Audit hat Restluecken fuer `FeedComment`/`EventComment`, `ContentEntry`, Packlisten/Pack-Events und generische Kalendereintraege identifiziert. Vor appseitiger Anzeige werden additiv Owner/`own`, serverseitige Report-Zielaufloesung und Blockierungsfilter benoetigt. Die Anforderungen wurden ueber die interne Mailbox an den Backend-Agenten gesendet; iOS simuliert bis dahin keinen Erfolg.
- Fastlane-Store-Verifier und Debug-Simulator-Builds auf iPhone 17e sowie iPad mini (A17 Pro) bestanden. Der neue lokale Screenshot-Hook zeigt das Schutzmenue auf beiden Geraeteklassen. Ein automatisierter Menueklick konnte bei gesperrtem macOS nicht ausgefuehrt werden und bleibt als lokaler Nachtest offen.
- Rueckbau: ausschliesslich die iOS-Menu-/Hidden-State-Aenderungen, den DEBUG-Hook und die zugehoerigen fail-closed Verifierchecks revertieren. Keine Store-, Review- oder TestFlight-Aenderung. Zyklus `3/5` nach Build 107.

## Zyklus 38: Diskrete Push-Payloads auf allen Versandpfaden

- Der Audit fand eine relevante Luecke: Regelbasierte Pushes beruecksichtigten `notificationPreviewMode`, direkte Pushes ueber `sendNativeTestPush` jedoch nicht. Dadurch konnten Share-, Passwort-Reset- und Admin-Testnachrichten trotz diskreter Empfaengereinstellung fachliche Titel, Texte, URLs und Entity-Daten enthalten.
- `sendNativeTestPush` liest jetzt die Vorschau jedes Empfaengers, gruppiert dessen Geraete nach `DISCREET`, `TITLE` und `FULL` und erzeugt pro Gruppe eine passend reduzierte Payload. Ein unbekannter oder fehlender Wert faellt sicher auf `DISCREET` zurueck.
- `DISCREET` und `TITLE` verwenden neutrale Titel und Texte. Geschuetzte Modi entfernen URL, Aktionsbezeichnung, fachliche Entity-/Actor-Felder sowie Event-/Thread-ID; die minimale typisierte Zielkennung fuer das native Routing bleibt erhalten. Passwort-Reset und Teilen besitzen eigene neutrale Kategorien; nur `FULL` erhaelt weiterhin fachlichen Detailinhalt und Web-Zieladresse.
- Die iOS-App besitzt zusaetzlich einen lokalen Vordergrundfilter. Dadurch werden private Inhalte auch bei einem veralteten Server nicht als ungefilterter Systembanner angezeigt. Badge und Sound bleiben in geschuetzten Modi erhalten.
- Statische Verifikation: `COMPLIANCE_STATIC_OK`; TypeScript `tsc --noEmit` ohne Fehler. iOS: `APP_PRIVACY_LOCK_STATE_OK`, `APP_STORE_READINESS_OK` und Fastlane-Builds auf iPhone 17e/iPad mini (A17 Pro). Screenshots mit absichtlich privatem Testinhalt zeigen nur die neutrale Benachrichtigung.
- Keine Datenbankmigration, keine Aenderung vorhandener Nutzerwerte und kein Produktivdateneingriff. Rueckbau: Aenderungen in `src/lib/native-push-notifications.ts` und `scripts/verify-app-store-compliance.js` gemeinsam revertieren; die iOS-Filterung kann unabhaengig als Defense-in-Depth verbleiben. Zyklus `4/5` nach TestFlight Build 107, kein Upload.

## Zyklus 39: Eigentum, Blockierung und Moderation in Content Spaces

- `ContentSpace` und `ContentEntry` geben die Rechte jetzt relativ zum authentifizierten Betrachter aus. Eintraege enthalten den serverseitig bestimmten Urheber, `own`, `canEdit`, `canDelete`, `canReport` und `canHide`; pauschale Bearbeitungsrechte fuer geteilte fremde Inhalte wurden entfernt.
- Neue Content-Space-Eintraege sind als `contentEntry` meldbar. Der zentrale Report-Resolver prueft Zielzugriff und bestimmt den gemeldeten Urheber selbst. Legacy-Wiki und Legacy-Ideen verwenden weiterhin ihre bestehenden Zieltypen `wikiPage` beziehungsweise `activity`.
- Listen, Details und Zaehler filtern blockierte Urheber sowie moderiert ausgeblendete `contentEntry`-, `wikiPage`- und `activity`-Ziele. Direkte Detail-URLs koennen diese Filter nicht umgehen. Die Filterung wird auch auf Transkriptions- und Anhangsrouten angewandt, weil diese denselben geschuetzten Access-Resolver verwenden.
- Die iOS-App zeigt auf Basis dieses Vertrags Melden, Blockieren und Ausblenden nur fuer ausdruecklich fremde Eintraege. Nur lesbare Eintraege koennen weder Eintrag noch Anhaenge loeschen. PhotosPicker-Uploads senden ihren tatsaechlichen MIME-Typ statt einer pauschalen JPEG-Deklaration.
- Verifikation: Backend-TypeScript ohne Fehler, `COMPLIANCE_STATIC_OK`, iOS `APP_PRIVACY_LOCK_STATE_OK`, `APP_STORE_READINESS_OK` sowie Fastlane-Simulator-Builds auf iPhone 17e und iPad mini (A17 Pro). Der Backend-Verifier prueft Owner-/Rechte-Shape, Block-/Moderationsfilter und `contentEntry`-Reportauflosung fail-closed.
- Rueckbau: Serializer-Viewerparameter, Block-/Moderationsfilter, `contentEntry`-Reportresolver und zugehoerige Verifierchecks gemeinsam revertieren. Keine Datenbankmigration und kein Eingriff in Produktivdaten.
- iOS-Version `1.0 (108)` wurde ausschliesslich ueber Fastlane archiviert, signiert und uebertragen. App Store Connect bestaetigte Build-ID `f7680c91-21d3-4b48-849a-01effaff2079`, `VALID`, `usesNonExemptEncryption=false`, `IN_BETA_TESTING`, `READY_FOR_BETA_SUBMISSION` und automatische Benachrichtigung. Die interne All-Builds-Gruppe bleibt aktiv; nach dem Upload lagen 8 Builds im rollierenden 24-Stunden-Fenster. Der Zykluszaehler beginnt bei `0/5` nach Build 108.
## Feed-Kommentar-Schutzvertrag (2026-07-14)

- `GET|POST /api/external/events/{eventId}/comments` liefert fuer jeden Kommentar viewer-relative Felder `own`, `canDelete`, `canReport` und `canHide` sowie den bestehenden Autor-Shape.
- `resolveReportTarget` akzeptiert additiv `feedComment` und `eventComment`. Die Aufloesung verlangt einen fuer den meldenden Benutzer sichtbaren AuditLog und bestimmt `reportedUserId` ausschliesslich serverseitig aus `FeedComment.authorId`.
- Kommentarlisten entfernen Autoren mit gegenseitiger Blockierung sowie IDs aus `ModeratedContent(entityType=feedComment, hidden=true)` vor Serialisierung und Zaehlerbildung.
- Statische Absicherung: `scripts/verify-app-store-compliance.js` prueft Resolver, Block-/Moderationsfilter und Schutzrechte fail-closed. TypeScript und `COMPLIANCE_STATIC_OK` bestanden lokal.
- Es gibt keine Schema- oder Datenmigration und keine Produktivdatenaenderung. Rollback: Resolverzweig in `src/lib/compliance/ugc.ts`, Filter/Rechte in der Event-Kommentarroute und die zugehoerigen Verifierchecks gemeinsam revertieren.
- Der Stand ist auf GitHub vorbereitet, aber erst nach bestaetigtem Deployment und reversiblem Fremdkommentar-Smoke als produktiv abgenommen zu markieren. Die UGC-Zieltypen `PackingList`, `PackingEvent` und `CalendarEvent` bleiben danach noch offen.

## Packlisten- und Pack-Event-Schutzvertrag (2026-07-14)

- Die Pack-Serializer liefern additiv und betrachterbezogen `own`, `canReport` und `canHide`; bestehende `canManage`-Rechte bleiben unveraendert. Fremde Inhalte sind damit explizit erkennbar, ohne Eigentum aus Verwaltungsrechten abzuleiten.
- `src/lib/packing-safety.ts` bildet den gemeinsamen Filter fuer gegenseitig blockierte Owner sowie ausgeblendete `packingList`-/`packingEvent`-IDs. Listen, direkte Details, PATCH/DELETE und verschachtelte Listen in Pack-Events verwenden diesen Filter.
- Der zentrale Report-Resolver akzeptiert `packingList`, `packingEvent` und den Alias `packEvent`, prueft Sichtbarkeit, Blockierung und Moderationszustand und leitet `reportedUserId` serverseitig aus `ownerId` ab.
- `scripts/verify-app-store-compliance.js` verlangt Rechtefelder, beide Moderationsfilter, Routennutzung und Report-Aufloesung fail-closed. TypeScript und der statische Compliance-Test bestanden lokal.
- Es gibt keine Schema- oder Datenmigration und keinen Produktivdateneingriff. Rueckbau: `src/lib/packing-safety.ts`, Serializerfelder, Routenfilter, Resolverzweige und zugehoerige Verifierchecks gemeinsam revertieren. Erst ein bestaetigtes Deployment mit reversiblem Live-Smoke darf als produktive Abnahme dokumentiert werden; `CalendarEvent` bleibt danach noch offen.

## Kalendereintrag-Schutzvertrag (2026-07-14)

- `serializeCalendarEvent` liefert additiv und relativ zum authentifizierten Betrachter `owner`, `own`, `canManage`, `canReport` und `canHide`. Verwaltungsrechte gelten nur dem Owner sowie `ADMIN`/`SUPER_ADMIN`; Schutzrechte gelten nur fremden sichtbaren Eintraegen.
- `src/lib/calendar-event-safety.ts` kombiniert den bestehenden Owner-Scope mit gegenseitigen Benutzerblockierungen und `ModeratedContent(entityType=calendarEvent, hidden=true)`. Kalenderliste, direkter Detailzugriff, PATCH/DELETE und Check-in-Routen greifen dadurch auf denselben geschuetzten Datensatz zu.
- Der zentrale Report-Resolver akzeptiert `calendarEvent` und `calendarEntry`, prueft Tenant, Owner-Sichtbarkeit, Blockierung und Moderationsstatus und bestimmt `reportedUserId` ausschliesslich serverseitig aus `Event.ownerId`.
- `scripts/verify-app-store-compliance.js` verlangt Rechte-Shape, zentralen Block-/Moderationsfilter, Nutzung in der Listenroute und serverseitige Report-Aufloesung fail-closed. Backend-TypeScript und `COMPLIANCE_STATIC_OK` bestanden lokal.
- Keine Schema- oder Datenmigration und kein Produktivdateneingriff. Rueckbau: `src/lib/calendar-event-safety.ts`, Serializer-/Routenanpassungen, Resolverzweig und Verifierchecks gemeinsam revertieren. Erst ein bestaetigtes Deployment mit reversiblem Live-Smoke darf als produktiv abgenommen gelten.

## Push-Geraete gezielt loeschen ab 2026-07-14

- Neuer Vertrag: `DELETE /api/external/push/devices/{id}` entfernt ein aktives oder bereits deaktiviertes Push-Geraet physisch. Der kompatible Collection-Delete akzeptiert additiv `{deviceId}`; der vorhandene tokenbasierte Logoutpfad deaktiviert weiterhin nur das aktuelle Geraet.
- Berechtigung: Normale Nutzer sind auf `userId` und ihren Tenant begrenzt. Admins/Superadmins koennen bei aktivem Tenant-/View-Context Geraete dieser Seite entfernen; ohne Tenant-Kontext bleiben auch sie auf eigene Geraete begrenzt. Nicht sichtbare IDs liefern `404 not_found` und verraten keine fremden Geraete.
- `NativePushDelivery.deviceId` ist optional und besitzt `onDelete: SetNull`; historische Zustellnachweise bleiben deshalb ohne das entfernte Geraet erhalten. Das datensparsame Audit enthaelt nur Plattform, APNs-Umgebung und den vorherigen Aktivstatus, nie Device-Token oder Geraetename.
- `native_push_device_deleted` wird als technischer Vorgang aus dem normalen Eventfeed ausgeschlossen. Capabilities weisen den ID-Vertrag explizit aus.
- Statische Absicherung prueft Route, Eigentums-/Tenant-Scope, physisches Delete, Body-Fallback, Audit, Capability und Feed-Ausschluss. TypeScript und `COMPLIANCE_STATIC_OK` bestanden. Kein Schemawechsel, keine Migration und keine Produktivdaten-Aenderung; Deploy- und reversibler Live-Smoke mit temporaeren Geraeten stehen noch aus.
- Rueckbau: `src/lib/native-push-devices.ts`, die dynamische Route, den `{deviceId}`-Zweig, Capability-/Audit-Ergaenzung und den Feed-Ausschluss als Einheit revertieren. Bestehende tokenbasierte Deaktivierung bleibt davon unabhaengig.

## 2026-07-14 - Neutrale Legacy-Produktbegriffe in der iOS-Diagnose

- Die iOS-App neutralisiert nun auch rohe Backend-Capability-Labels, Aktionsnamen, Feature-Keys und den sichtbaren Legacy-Endpunkt fuer den Produktkatalog. Sichtbar werden ausschliesslich `Shopify-Produkte`, sprachlich passende Produktaktionen und `/api/external/shopify-products` als Diagnosealias.
- Die tatsaechliche Backendroute, Requestfelder, Deep-Link-Aliase und interne Swift-Typen bleiben fuer Kompatibilitaet unveraendert. Nutzerinhalte werden nicht umgeschrieben. Es gab keine Backend-, Schema-, Produktivdaten- oder App-Store-Connect-Aenderung.
- iOS Store-Verifier sowie Fastlane-Builds auf iPhone 17e und iPad mini (A17 Pro) bestanden. Ein DEBUG-Nachweis prueft absichtlich einen alten Capability-Response; der finale Screenshot zeigt keine alte sichtbare Produktbezeichnung. Rueckbau erfolgt ausschliesslich durch Revert des zugehoerigen iOS-Commits und dieser Dokumentationszeilen.

## 2026-07-14 - Build 109 fuer App Store und Review-Live-Smoke

- Die nicht einreichende iOS-Fastlane-Lane hat Version `1.0` in App Store Connect auf den bereits verarbeiteten Build `109` gesetzt und die Auswahl zurueckgelesen. Es gab keinen Upload und keine Review-Submission.
- `https://test.playplaner.com` bestand den reversiblen Compliance-Live-Smoke mit dem geschuetzten Review-Zugang: vier oeffentliche Rechts-/Supportseiten, Login, Kern-APIs, ZIP-Datenexport mit `no-store`, Sitzungswiderruf und anschliessender HTTP-401-Nachweis. Die Testsitzung blieb nicht aktiv.
- Die native Datenschutzansicht wurde auf iPhone 17e und iPad mini visuell geprueft. Physischer Face-ID-/App-Umschalter-/Review-Endtest bleibt offen, da beide gekoppelten Geraete weiterhin nicht erreichbar waren. Rueckbau erfolgt durch Auswahl eines anderen gueltigen Builds beziehungsweise Entfernen der Build-Beziehung in App Store Connect.

## 2026-07-14 - Reversibler Multi-Rollen-Review-Smoke

- `scripts/verify-app-review-roles-live.js` prueft Alex, Sam und Review Admin gegen `test.playplaner.com`. Die zwei normalen Benutzer und der Administrator muessen getrennte Identitaeten im selben Review-Zirkel besitzen, bestaetigte Pflichtdokumente und funktionsfaehige Kern-/Chat-Endpunkte liefern.
- Normale Benutzer erhalten auf Moderationswarteschlange und Benutzerverwaltung ausschliesslich `403 forbidden`; der Administrator erhaelt `200`. Alle drei erzeugten App-Sitzungen werden auch bei Testfehlern widerrufen und ihre Tokens danach mit HTTP `401` geprueft. Passwoerter und Tokens werden nicht ausgegeben oder persistiert.
- Live-Ergebnis: `APP_REVIEW_ROLES_LIVE_OK accounts=3 user=2 admin=1 sessions_revoked=3`. Der statische Compliance-Verifier verlangt Script, Paketkommando, drei Rollen, Rechtepruefung und Cleanup fail-closed. Rueckbau: neues Script, Paketkommando, Verifierchecks und diese Dokumentationszeilen gemeinsam revertieren; keine Migration und keine fachlichen Review-Daten wurden erzeugt.

## 2026-07-14 - Native Review-Navigation und Sitzungsbereinigung

- Die native iOS-App wurde mit dem echten Review-Zugang gegen `https://test.playplaner.com` auf iPhone 17e und iPad mini (A17 Pro) gesmoked. Dashboard, Kalender und Chat luden harmlose Review-Daten; lokale Screenshot-Beispieldaten waren fuer diesen Durchlauf deaktiviert.
- Ein rein DEBUG-seitiger iOS-Test-Harness-Fehler wurde behoben: Ziel-Tabs aus Screenshot-Argumenten werden bei Auto-Login erst nach erfolgreicher Anmeldung geoeffnet. Dadurch entstehen keine vorzeitigen unauthentifizierten Requests und keine irrefuehrenden Login-Dialoge im Review-Nachweis. Die Release-Navigation und Backendvertraege wurden nicht veraendert.
- Der Test erzeugte sechs temporaere Alex-App-Sitzungen. Eine separate Cleanup-Sitzung widerrief alle sechs anderen und danach sich selbst. Der abschliessende Token-Nachweis lieferte HTTP `401` (`APP_REVIEW_SESSION_CLEANUP_OK before=7 revoked_others=6 current_revoked=1 token_status=401`). Keine fachlichen Daten wurden angelegt, geaendert oder geloescht.
- Sichtnachweise liegen ausschliesslich im iOS-Artefaktverzeichnis: `review-live-cycle4-calendar-iphone17e-final4.png`, `review-live-cycle4-chat-iphone17e-final4.png` und `review-live-cycle4-calendar-ipadmini.png`. Vorlaeufige Bilder mit System- oder Login-Dialog wurden verworfen.
- Rueckbau betrifft nur den iOS-DEBUG-Test-Harness und dessen statischen Verifier. Backend, Schema, Review-Mandant und App Store Connect blieben unveraendert.

## 2026-07-14 - Sichtbare App-Store-Endkontrolle und offene Live-Paritaet

- Der Apple-Altersfragebogen wurde in App Store Connect sichtbar vollstaendig kontrolliert und gespeichert: User-Generated Content und Chat sind vorhanden; suggestive Themen sind haeufig, nichtgrafische sexuelle Inhalte/Nacktheit selten und grafisch explizite Inhalte nie. Der bewusste Store-Override ist 18+, fuer Suedkorea zeigt Apple 19+. Als Eignungs-URL ist `https://playplaner.com/terms` hinterlegt. Das Standardprodukt behaelt weiterhin kein hartes In-App-Altersgate.
- Die sichtbare Produktseite der vorbereiteten Version `1.0` zeigt Build `110`, drei neutrale iPhone-Screenshots, ausgefuellte Beschreibung, Werbetext, Schluesselwoerter, Support-/Marketing-URL, Copyright und Review Notes. Die Schaltflaeche `Zur Pruefung hinzufuegen` wurde nicht betaetigt; es wurde weder eine Submission erzeugt noch eine automatische Store-Veroeffentlichung ausgeloest.
- Die Readiness-Matrix darf den UGC-Gesamtstand noch nicht pauschal als live erfuellt bezeichnen. `DELETE /api/external/push/devices/probe-id` lieferte am 14.07.2026 sowohl auf `playplaner.com` als auch auf `test.playplaner.com` HTTP 404 und `text/html`. Damit ist mindestens der neue ID-Loeschvertrag noch nicht deployed; dieselbe Deploy-/Live-Smoke-Grenze gilt fuer Feed-Kommentar-, Packlisten-/Pack-Event- und Kalendereintrag-Schutz.
- Der Backend-Agent wurde um Deployment aller gepushten P0-Ergaenzungen sowie reversible Live-Smokes mit temporaeren Daten, Cleanup-Zahlen und Readback des laufenden Commits gebeten. Erst nach diesem Nachweis darf der Status wieder auf `Erfuellt` wechseln.
- Beide gekoppelten physischen Apple-Geraete waren weiterhin `unavailable`. Face ID, App-Switcher-Overlay und der komplette Review-Zugang bleiben deshalb als On-Device-Endabnahme offen.
- Rueckbau: Der Store-Altersfragebogen und die Build-Auswahl koennen in App Store Connect wieder geaendert werden; diese Dokumentationskorrektur kann separat revertiert werden. Es wurden keine Produktivdaten veraendert und keine Review-Einreichung erzeugt.

## 2026-07-14 - Automatische App-Store-Veroeffentlichung per Fastlane

- Der Nutzer hat klargestellt, dass die App nach Apple-Genehmigung bewusst automatisch live gehen soll. Der kurzzeitig manuell gesetzte Zwischenzustand wurde deshalb zurueckgenommen; `AFTER_APPROVAL` ist der kanonische Sollwert.
- Die iOS-Konfiguration speichert `releaseType=AFTER_APPROVAL` in `fastlane/metadata/distribution.json`. `fastlane ios store_prepare_version` setzt den Wert ueber die App-Store-Connect-API und verlangt beim unmittelbaren Readback denselben Zustand. Damit wird die Einstellung nicht mehr per Browser gepflegt.
- Die Lane erzeugt weiterhin keine Review-Submission, keinen Binary-Upload und keine direkte Veroeffentlichung. Automatisch live geht erst eine spaeter ausdruecklich zur Pruefung eingereichte und von Apple genehmigte Version.
- Rueckbau: Den Konfigurationswert bewusst auf `MANUAL` oder `SCHEDULED` setzen und dieselbe Lane ausfuehren; Fastfile-, Verifier- und Dokumentationsaenderung gemeinsam revertieren. Keine Backend-, Schema- oder Produktivdatenaenderung.

## 2026-07-14 - P0-Backend-Deploy und reversible Live-Abnahme

- Vor dem Rollout wurden Quelle, PostgreSQL-Datenbank, Containerbeschreibung und laufendes Image unter `/opt/kink-social-platform/backups/pre-appstore-p0-20260714-213530` gesichert. Das vorherige Image bleibt als `kink-social-platform-app:pre-appstore-p0-20260714-213530` erhalten. Die Sicherungsdateien sind nur fuer root lesbar.
- Ausschliesslich unreferenzierte Docker-Images und Build-Caches wurden bereinigt. Dadurch stieg der freie Speicher von 5,3 auf 41 GB; laufende Container und persistente Volumes wurden nicht entfernt. Der reproduzierbare Compose-Build bestand `npm ci`, Prisma-Generierung, Next.js-Kompilierung und Typecheck. Das aktive Image ist `sha256:2a47281a84b2d185fff4fcae1c4f4e94ca87e191fbfc99b2444a961a5a1bb934`.
- Der bekannte Compose-Nachlauf meldete nach erfolgreichem Recreate eine bereits entfernte alte Container-ID. Der neue `kink_social_app` lief danach stabil auf Port 8097; Prisma meldete das Schema synchron und `/privacy`, `/terms`, `/community-guidelines` sowie `/support` antworteten jeweils mit HTTP `200`.
- Der anonyme Probe-Request `DELETE /api/external/push/devices/probe-id` liefert auf Produktion und Review nun HTTP `401 application/json`. Damit ist die neue dynamische Route extern aktiv; der vorherige `404 text/html`-Nachweis ist historisch ueberholt.
- Ein neutraler reversibler Live-Smoke im Review-Mandant verwendete Alex und Sam sowie zwei kurzlebige, ausschliesslich fuer den Test erzeugte API-Tokens. Verifiziert wurden `own=false`, Owner, `canReport`, `canHide` und fehlendes `canManage` fuer ContentEntry, FeedComment, PackingList, PackingEvent und CalendarEvent; alle fuenf Report-Ziele wurden serverseitig akzeptiert. Gegenseitige Blockierung und `ModeratedContent` entfernten jeden Zieltyp aus Listen und direkten Details.
- Push-Abnahme: Ein fremder Benutzer erhielt beim ID-Delete `404`; Sam entfernte ein aktives eigenes Geraet per dynamischer Route. Ein historischer `NativePushDelivery` blieb erhalten und hatte danach `deviceId=null`. Ein zweites Geraet wurde zuerst tokenbasiert deaktiviert und anschliessend ueber den Collection-Fallback `{deviceId}` physisch entfernt.
- Ergebnis: `APP_STORE_P0_LIVE_OK targets=5 reports=5 block_filters=5 moderation_filters=5 push_active_delete=1 push_disabled_delete=1 cross_user_404=1 delivery_preserved=1`. Der `finally`-Cleanup entfernte zwei Tokens, fuenf Reports, fuenf Moderationszeilen, eine Test-Delivery und neun Test-Audits. Eine unabhaengige SQL-Nachpruefung ergab `LEFTOVERS=0`.
- Der vollstaendige lokale Quellstand bestand danach erneut `COMPLIANCE_STATIC_OK`, TypeScript und `git diff --check`. Der statische Verifier wird bewusst gegen den vollstaendigen Quellbaum ausgefuehrt; das schlanke Produktionsimage enthaelt `docker-compose.yml` nicht und ist deshalb nicht sein Ausfuehrungsziel.
- Rueckbau: `docker compose up -d app` mit dem getaggten Vorimage; falls erforderlich Quelle aus `source.tgz` und Datenbank aus `database.dump` im genannten Backupverzeichnis wiederherstellen. Die additiven Schutzvertraege haben in diesem Rollout keine neue Schema- oder Inhaltsmigration ausgefuehrt.

## 2026-07-14 - Fastlane-only Hardware- und Simulatorweg

- Der iOS-Workflow besitzt nun eine zentrale Fastlane-Geraeteauflosung sowie `device_launch` fuer wiederholte Starts eines bereits installierten Builds. Build `1.0 (110)` ist auf dem gekoppelten iPhone 13 Pro installiert; Developer Services waren erreichbar. Der App-Start wurde ausschliesslich wegen des gesperrten Geraets mit Apples `Locked`-Fehler abgewiesen und gilt nicht als Face-ID-Abnahme.
- `simulator_capture` fuehrt Simulator-Boot, App-Installation, DEBUG-Start und Screenshot ebenfalls innerhalb von Fastlane aus. `verify_store` sowie Debug-Builds auf iPhone 17e und iPad mini (A17 Pro) bestanden. Die deckende Dark-Mode-Schutzansicht wurde auf beiden Formfaktoren visuell geprueft; echter LocalAuthentication-Erfolg und App-Umschalter bleiben physische Endtests.
- Es gab keine Backend-, Schema-, Produktivdaten-, App-Store-Connect- oder TestFlight-Aenderung. Rueckbau: Fastlane-Helper, `device_launch`, `simulator_capture`, Verifierchecks und Dokumentationsabschnitte gemeinsam revertieren. Zyklus `4/5` nach TestFlight Build `110`.

## 2026-07-14 - TestFlight Build 111 und rollierende Uploadgrenze

- Der iOS-Fastlane-Weg prueft vor jeder Buildnummererhoehung und jedem Upload die Anzahl der App-Store-Connect-Uploads im rollierenden 24-Stunden-Fenster. Der fail-closed Standardwert ist `15`; vor diesem Upload wurden `9/15` gemessen.
- Ausschliesslich `fastlane ios beta` erhoehte auf `1.0 (111)`, erstellte das Release-Archiv, exportierte die App-Store-IPA und lud sie hoch. `store_prepare_version` setzte Build 111 auf die vorbereitete Version 1.0, bestaetigte `AFTER_APPROVAL` und erzeugte keine Review-Submission.
- Die neue read-only Lane `testflight_status` bestaetigte live: Build-ID `52a9430a-54ab-4ec2-8934-b3a82dd681a5`, `VALID`, intern `IN_BETA_TESTING`, extern `READY_FOR_BETA_SUBMISSION`, `usesNonExemptEncryption=false`, eine interne All-Builds-Gruppe mit einem Tester sowie `autoNotify=true`. Testeradressen werden weder geloggt noch dokumentiert.
- Es gab keine Backend-, Schema- oder Produktivdatenaenderung. Rueckbau: In App Store Connect einen frueheren validen Build auswaehlen; Fastlane-Status-/Limit-Lanes, Verifier und Dokumentation gemeinsam revertieren. Der physische Face-ID-/App-Switcher-Endtest bleibt vor der Review-Submission offen. Zykluszaehler danach `0/5`.

## 2026-07-14 - Fail-closed Store-Einreichungsweg und Live-Endkontrolle

- Alle Apple-bezogenen Endkontrollen laufen ausschliesslich ueber Fastlane. `store_submission_preflight` liest die geschuetzten Review-Informationen, Version `1.0`, Build `111`, Export-Compliance, Status `PREPARE_FOR_SUBMISSION`, `AFTER_APPROVAL`, deutsche Metadaten, je drei vollstaendig verarbeitete iPhone-/iPad-Screenshots sowie die 15 veroeffentlichten trackingfreien Privacy-Deklarationen live zurueck.
- Apple erlaubt fuer `appStoreVersionSubmissions` keinen Collection-GET. Die Lane prueft deshalb die direkte Beziehung `/v1/appStoreVersions/{id}/appStoreVersionSubmission`; nur der dokumentierte HTTP-404-Leerfall bedeutet „noch nicht eingereicht“. Jeder andere Fehler beendet den Lauf. Der aktuelle Preflight bestand vollstaendig und bestaetigte, dass noch keine Submission existiert.
- `store_submit` wiederholt denselben Preflight und bricht vor jedem Schreibzugriff ab, solange nicht sowohl der reale Hardwaretest als auch die rechtlich-organisatorische Endabnahme bestaetigt sind. Der Negativtest ohne Hardwarefreigabe endete erwartungsgemaess mit `Physical on-device sign-off is missing`; es wurde keine Einreichung erzeugt.
- Backend-Nachweise dieses Zyklus: `COMPLIANCE_STATIC_OK`, erfolgreicher TypeScript-/Next-Produktionsbuild, `COMPLIANCE_LIVE_OK`, `APP_REVIEW_ROLES_LIVE_OK accounts=3 user=2 admin=1 sessions_revoked=3`, `LOGIN_RATE_LIMIT_LIVE_OK` und `UPLOAD_CLEAN_AND_DISALLOWED_BYTES_OK`. Die Live-Tests widerriefen ihre Sitzungen und hinterliessen keine fachlichen Testdaten.
- Offen bleiben zwei reale Abnahmen, die nicht wahrheitsgemaess durch Simulator oder Quellcode ersetzt werden koennen: Face ID samt App-Switcher-Schutz auf einem entsperrten physischen Geraet sowie die Bestaetigung der rechtlichen Texte, Kontakte, Moderationsbesetzung und operativen Anbieterangaben. Das gekoppelte iPhone wurde erkannt; der Fastlane-Start scheiterte ausschliesslich an Apples Geraetestatus `Locked`.
- Rueckbau: Die neuen Fastlane-Lanes, den Privacy-Readback, die fail-closed Verifierregeln und die zugehoerige iOS-Dokumentation gemeinsam revertieren. Es gab keine Backend-, Schema- oder Produktivdatenaenderung und keine App-Review-Submission. Zyklus `1/5` nach TestFlight Build `111`.

## 2026-07-14 - Vollstaendiger Store-Readback und blockierungsfeste Shares

- Der iOS-Fastlane-Preflight liest nun zusaetzlich Inhaltsrechte, deutsche Datenschutz-URL, Lifestyle-/Productivity-Kategorien, den vollstaendigen Altersfragebogen, beide Accessibility-Deklarationen, kostenlosen Preisplan und territoriale Verfuegbarkeit zurueck. Live bestanden 175 aktive Territorien. Der kostenlose bestehende Preisplan verwendet das bei seiner Erstellung festgelegte Basisland USA; Apples API bietet dafuer keinen nachtraeglichen PATCH. Die kanonische Konfiguration wurde an diesen preislich wirkungslosen Istwert angepasst.
- Der Quellcode-Audit fand eine P0-Luecke in der Blockierung: Chat und Push waren geschuetzt, aber direkte E-Mail-/Telegram-Shares und vorhandene Share-Links nicht durchgaengig. `src/lib/share.ts` entfernt nun blockierte Personen symmetrisch aus Share-Zielen, aus direkten und Zirkel-Empfaengern und verweigert das Oeffnen vorhandener persoenlicher Share-Links nach einer Blockierung.
- `scripts/verify-blocked-sharing-live.js` prueft mit Alex und Sam reversibel: Sam verschwindet nach dem Block aus den Share-Zielen, ein direkter Share wird serverseitig vor jeder Zustellung abgelehnt und ein nur fuer den Test erzeugter Block wird im `finally`-Pfad wieder entfernt. Beide Testsitzungen werden ebenfalls widerrufen.
- Keine Schema- oder Inhaltsmigration. Rueckbau: die zentrale Share-Filterung, den Live-Test, das Paketkommando, die Verifierregeln und diese Dokumentation gemeinsam revertieren. Bereits bestehende Share-Datensaetze bleiben beim Vorwaerts- und Rueckbau unveraendert.
- Produktiv-Deployment: Vor dem Austausch wurden Quellstand, validierter PostgreSQL-Custom-Dump, Container-Inspect und das bisherige Image unter `/opt/kink-social-platform/backups/pre-share-block-20260714-231955` beziehungsweise als Image-Tag `kink-social-platform-app:pre-share-block-20260714-231955` gesichert. Das neue Image `sha256:afeaacd69b9e9cf94f975534953c3470b639f6dd4b15ea963a4be130edc39993` wurde aus `package-lock.json` gebaut; Datenvolumes und Konfiguration blieben unveraendert.
- Live-Nachweise nach Deployment: `BLOCKED_SHARING_LIVE_OK target_hidden=1 share_rejected=1 preserved_existing_block=0`, `COMPLIANCE_LIVE_OK`, `APP_REVIEW_ROLES_LIVE_OK accounts=3 user=2 admin=1 sessions_revoked=3`, `LOGIN_RATE_LIMIT_LIVE_OK` und `UPLOAD_CLEAN_AND_DISALLOWED_BYTES_OK`. Die HTTPS-Endpunkte `/login`, `/privacy` und `/support` antworteten mit 200. Der Blockierungs-Smoke entfernte seinen Testblock und alle Live-Tests widerriefen ihre Testsitzungen.

## 2026-07-14 - Buildgebundene Fastlane-Endabnahme

- Die fruehere pauschale Hardware-/Readiness-Freigabe wurde fail-closed durch neun einzelne Bestaetigungen ersetzt. `ios store_signoff_status` und `ios store_submit` lesen ausschliesslich `~/.playplaner/app-store-signoff.env`, verlangen Dateimodus `600` und exakt die lokale Version/Buildnummer.
- Pflichtbestaetigungen sind Face ID, Privacy Overlay, Inaktivitaetssperre, Kernflows, Rechtstexte, besetzte Support-/Moderations-/Datenschutz-/Sicherheitskontakte, Moderationsbetrieb, Drittanbieterangaben und Product Page. Ein Signoff fuer einen alten Build kann einen neuen Build nicht freigeben.
- Negativnachweis: Bei fehlender lokaler Signoff-Datei brachen sowohl `store_signoff_status` als auch `store_submit` nach lokalem Version-/Build-Readback und vor Preflight, API-Key oder Submission ab. `verify_store` blieb mit `APP_PRIVACY_LOCK_STATE_OK`, `APP_STORE_READINESS_OK` und sechs Store-Screenshots gruen. Es wurde keine App-Store-Submission erzeugt.
- Anschliessend bestand `ios device_smoke` auf dem entsperrten iPhone 13 Pro `GSSx 3`: DDI kompatibel, aktueller Quellstand fuer Hardware gebaut, Development-Signatur erzeugt, Bundle `fspiel.playplaner` installiert und erfolgreich gestartet. Dieser Nachweis ersetzt ausdruecklich nicht die sichtbare Beurteilung des Face-ID-Systemdialogs, des Privacy Overlays im App-Umschalter oder der Inaktivitaetssperre.

## 2026-07-15 - Scanner-Backfill fuer bestehende Dateien

- Nach dem sicheren Dateiabruf-Rollout waren bestehende Assets weiterhin physisch vorhanden, standen aber wegen des additiven Datenbank-Defaults auf `scanStatus=PENDING`. Da `fileAssetForAccess` bewusst nur `CLEAN` ausliefert, verschwanden dadurch auch Profil- und Galeriebilder aus Web und iOS.
- `scripts/backfill-file-scan-status.js` migriert diese Altdateien nicht blind. Es prueft den Scanner zuerst mit sauberer Probe und EICAR, streamt danach jede `PENDING`-/`ERROR`-Datei einzeln per ClamAV INSTREAM und arbeitet standardmaessig nur als Dry-Run. Erst `--apply` setzt bestaetigt saubere Dateien auf `CLEAN`; erkannte Malware wird `REJECTED` und `QUARANTINED`, fehlende oder nicht pruefbare Dateien bleiben gesperrt und fuehren zum Fehlerstatus.
- Keine Schemaaenderung. Vor produktiver Anwendung sind Datenbank- und Quellbackup zu erstellen; danach muessen Statusgruppen, Profilbildabruf und Medien-API live geprueft werden. Rueckbau des Datenstatus erfolgt aus dem unmittelbar davor erzeugten PostgreSQL-Dump, nicht durch pauschales Zuruecksetzen auf `PENDING`.
- Produktiver Vorfall und Wiederherstellung: Das Upload-Volume war intakt (`73` physische Dateien, `73 MB`), waehrend `71` zugehoerige `FileAsset`-Zeilen auf `PENDING/UNKNOWN` standen. Der Dry-Run ergab `checked=71 clean=71 rejected=0 missing=0 errors=0`. Vor Anwendung wurde der validierte PostgreSQL-Dump `/opt/kink-social-platform/backups/pre-file-scan-backfill-20260715-083534/database.dump` erstellt. Der Apply-Lauf setzte exakt `71` gepruefte Assets auf `CLEAN`; danach enthielt die Datenbank `71 CLEAN` und keine `PENDING`-Zeile.
- `scripts/verify-media-access-live.js` erzeugte fuer reale aktive Besitzer nur kurzlebige interne API-Tokens, rief Profil- und Medien-API sowie jeweils den geschuetzten Binärdownload auf, loeschte die Tokens im `finally`-Pfad und verlangte danach HTTP 401. Ergebnis: `MEDIA_ACCESS_LIVE_OK profile=1 media=1 temporary_tokens_revoked=2`. Der Test gibt weder Identitaeten, Inhalte noch Tokens aus.
