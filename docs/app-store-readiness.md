# App Store Readiness

Stand: 2026-07-14

Diese Matrix ist die operative Abnahme fuer die iOS-Einreichung. Ausfuehrliche Rueckbauhinweise stehen in `09-apple-guidelines-compliance.md`. Ein Status `Erfuellt` bedeutet, dass Implementierung und ein reproduzierbarer Nachweis vorhanden sind. Rechtliche Texte und Store-Angaben bleiben vor der Einreichung manuell zu pruefen.

| Guideline | Relevanz | Implementierte Massnahme | Quellcode/Route | Test | Status | Restrisiko |
| --- | --- | --- | --- | --- | --- | --- |
| 1.1.4 | Erwachsene Themen | Private Planerpositionierung, keine oeffentliche Discovery; nicht eingestufte reife UGC-Medien standardmaessig verborgen und nur nach persoenlicher Website-Einstellung sichtbar; grafisch explizite Medien bleiben in iOS gesperrt | `src/lib/ios-product-policy.ts`, `UserSettings.showSensitiveMedia`, Medien-API, iOS Safety Views, iOS `fastlane/metadata/age_rating.json` | Review-Mandant, Medien-Smoke, Website-/API-Vertrag, neutrale Store-Screenshots und ASC-Readback fuer 175 Regionen | Erfuellt | Store-Inhalte bei jeder Produktfunktionsaenderung erneut pruefen |
| 1.2 | UGC | Bytepruefung, Melden, Blockieren, Ausblenden, Moderation und Kontakte | `/api/external/reports`, `/blocks`, `/moderation`, Datei-API | Fremdinhalts-, Block- und Quarantaene-Smokes | Quellcode fertig / Live-Deploy offen | Die additiven Schutzvertraege fuer Feed-Kommentare, Packlisten/-Events und Kalendereintraege muessen auf Produktions- und Review-Mandant deployed und reversibel live geprueft werden; organisatorische Moderationsbereitschaft sicherstellen |
| 1.4.5 | Koerperliche Sicherheit | Auftraege nur freiwillig; versionierte Zustimmung, Gegenvorschlag, Widerruf; keine negative Punktefolge | Consent-Routen, Session-/Auftrags-API | Zwei-Nutzer-Live-Smoke | Erfuellt | App-Review-Texte muessen Produktgrenze klar erklaeren |
| 1.5 | Kontakt | Oeffentliche Support-, Moderations-, Datenschutz- und Sicherheitskontakte | `/support`, Legal-Publish-Skript | Oeffentliche HTTP- und Inhaltspruefung | Erfuellt nach Live-Publish | Erreichbarkeit organisatorisch pruefen |
| 1.6 | Datensicherheit | Bearer only, Keychain, TLS, Privacy Overlay, ClamAV, Quarantaene, persistente Login-/Reset-Limits | Auth-, Datei-, Rate-Limit- und iOS-Sicherheitscode | Token-, Datei-, Credential-Stuffing- und Simulator-Smokes | Erfuellt | Scannerbetrieb und Alarmierung organisatorisch ueberwachen |
| 2.1 | Vollstaendigkeit | Neutraler, reproduzierbarer Review-Mandant mit vier Rollen/Testfaellen und aktuellen Pflichtzustimmungen | `scripts/app-review-tenant.js` | Vier Logins, Compliance ohne Pending Documents, Kernstatus und Live-Dashboard | Erfuellt | Nach jeder neuen Pflichtdokumentversion erneut seeden und pruefen |
| 2.3 | Metadaten | Deutsche Store-Texte, Support-/Privacy-/Privacy-Choices-URL, Copyright, Lifestyle-/Productivity-Kategorien, Review Notes, Review-Kontakt, Demo-Zugang, neutrale iPhone-/iPad-Screenshots, ehrliche Altersdeklaration, veroeffentlichte Privacy Labels und konservative Accessibility-Deklarationen in ASC gesetzt | iOS `fastlane/metadata`, `fastlane/screenshots`, `docs/app-review-notes.md`, `store_review_details`, `store_privacy_labels`, `store_accessibility` | Fastlane-Laeufe, ASC-Readback mit 15 Privacy-Deklarationen, iPhone-/iPad-Accessibility-Entwurf fuer Dark Interface und Reduced Motion sowie echter Demo-Login | Erfuellt | Product Page vor Einreichung visuell endkontrollieren; Accessibility-Entwuerfe nach erstem Store-Release publizieren |
| 3.1 | Bezahlinhalte | Keine digitale iOS-Kauffunktion; physische Shopify-Produkte bleiben ein getrennter Katalog. StoreKit, Payment-SDKs, digitale Kaufmodelle und Checkout-Routen werden fail-closed geprueft | iOS `verify_app_store_readiness.rb`, Backend `verify-app-store-compliance.js`, Shopify-Produktansicht | Fastlane `verify_store`, `test:compliance:static`, Quellcodepruefung | Erfuellt | Bei neuem Abo, Kaufpfad oder Checkout muss die Pruefung bewusst angepasst und IAP neu bewertet werden |
| 4.2 | Mindestfunktionalitaet | Native SwiftUI-Flows fuer Login, Dashboard, Kalender, Chat, Medien, Tracker, Konto und Sicherheit | iOS-Projekt | iPhone-/iPad-Fastlane-Smokes | Erfuellt | Abschliessender On-Device-Regressionslauf |
| 5.1.1 | Datenschutz/Loeschung | Oeffentliche Datenschutzerklaerung, Datenexport, native getrennt widerrufbare Einwilligungen und echte Self-Service-Loeschung | `/privacy`, `/api/external/account/*`, `/api/external/compliance/consents`, iOS `ComplianceViews.swift` | Datei-, Token-, Login-, Consent-Restore- und letzter-Admin-Test | Erfuellt nach Live-Publish | Rechtliche Freigabe der Texte |

Generische Inhaltsbereiche sind additiv modelliert: bestehende Wiki-/Tagebuchseiten und Ideen bleiben die kanonischen Quelldaten und werden nur ueber stabile IDs Bereichen zugeordnet. Bereiche und Zuordnungen sind Teil des persoenlichen Datenexports; Kontoloeschung entfernt sie ueber relationale Kaskaden. Zirkel-Austritt setzt eigene geteilte Bereiche auf privat und entfernt Nutzer-/Zirkel-Freigaben.

## Einreichungsblocker

- Die vier versionierten Rechtsdokumente sind auf Produktions- und Review-Mandant veroeffentlicht; ihre finale rechtliche Freigabe bleibt manuell.
- Support-, Moderations-, Datenschutz- und Sicherheitspostfach muessen erreichbar und organisatorisch besetzt sein.
- App Store Connect enthaelt Store-Texte, Support-/Privacy-URL, Lifestyle als Primaer- und Productivity als Sekundaerkategorie, ehrliche 18+-Altersdeklaration, Review-Kontakt, Review Notes, einen live geprueften Demo-Zugang, je drei neutrale iPhone- und iPad-Screenshots sowie 15 veroeffentlichte Privacy-Deklarationen. Die sichtbare Product-Page-Endkontrolle bestaetigte am 14.07.2026 Build 110, drei iPhone-Screenshots und die ausgefuellten Metadaten; es wurde keine Review-Einreichung erzeugt.
- Die Versionsveroeffentlichung ist bewusst auf manuell gestellt. Eine spaetere Apple-Freigabe kann die App deshalb nicht ohne separate Launch-Entscheidung automatisch live schalten.
- Die fachlich abgeleitete Privacy-Label-Konfiguration liegt unter `docs/app-store-privacy-labels.md`; der maschinenlesbare Stand und die reversible Fastlane-Synchronisierung liegen im iOS-Repository.
- Die bereits gepushten Schutzvertraege fuer Feed-Kommentare, Packlisten/-Events, Kalendereintraege und das physische Entfernen von Push-Geraeten muessen noch auf `playplaner.com` und `test.playplaner.com` ausgerollt werden. Der anonyme Readback von `DELETE /api/external/push/devices/probe-id` lieferte am 14.07.2026 auf beiden Hosts HTTP 404 mit HTML und beweist, dass der neue ID-Vertrag dort noch nicht aktiv ist. Nach dem Deploy sind ausschliesslich temporaere Testdaten zu verwenden und vollstaendig zu bereinigen.
- Der finale App-Store-Build braucht einen vollstaendigen On-Device-Test mit Review-Zugang.

## Kein hartes Standard-Altersgate

Die regulaere iOS-Konfiguration verwendet kein zusaetzliches hartes Altersgate. Der Dienst ist sichtbar als Angebot fuer Volljaehrige beschrieben und wird in App Store Connect entsprechend eingestuft. Das additive Mandantenfeld `iosRequiresAgeConfirmation` bleibt standardmaessig `false`; bei einer spaeteren ausdruecklichen Aktivierung ist die Checkbox nicht vorausgewaehlt.

## Abhaengigkeits- und Buildnachweis 2026-07-14

- `package-lock.json` ist kanonisch; Docker verwendet ausschliesslich `npm ci` und `npm ci --omit=dev`.
- Next.js `15.5.20`, `eslint-config-next` `15.5.20` und PostCSS `8.5.10` sind exakt fixiert. Der frische Audit meldet null bekannte Build- oder Produktionsschwachstellen.
- Lokaler und serverseitiger Produktionsbuild bestanden Kompilierung, Lint/Typecheck und Seitengenerierung.
- Ein isoliertes Serverimage bestand mit dem Review-Tenant die oeffentlichen Seiten sowie Login, Compliance, Status, Capabilities, Sitzungen, Chat, Medien, Tracker-History und Kalender. Der Testtoken wurde anschliessend widerrufen und mit HTTP 401 nachgeprueft.

## Authentifizierung und Missbrauchsschutz 2026-07-14

- Login, Passwort-Reset, Einladungsannahme/-erstellung und API-Token-Erzeugung sind persistent rate-limitiert. Schluessel werden ausschliesslich HMAC-hashiert gespeichert.
- Fehlgeschlagene Logins schreiben keine Kennung oder IP in Auditlogs. Die iOS-App uebersetzt HTTP 429 in einen ruhigen Nutzerhinweis und behaelt Eingaben.
- API-Tokens erscheinen nicht in URLs, Browser-Historie, Capability-Beispielen, Multipartfeldern oder Mobile-Dokumentationsbeispielen. Die externe Einladungserstellung ist ein Bearer-authentifizierter POST.
- Reproduzierbare Nachweise: `npm run test:compliance:static` und `npm run test:rate-limit:live`; reversible Migration unter `prisma/manual-migrations/20260714_security_rate_limits/`.

## Gezielter VoiceOver-Nachweis 2026-07-14

- Der kompakte Dashboard-Feed bietet alle sichtbaren Interaktionen auch als benannte VoiceOver-Aktionen; Medienkacheln und Albumfilter besitzen gesprochene Typ-, Schutz-, Kommentar-, Auswahl- und Mengeninformationen.
- `verify_store` sichert diese zentralen Beschriftungen fail-closed ab. iPhone- und iPad-Simulator-Builds bestanden, der Dark-Mode-Feed wurde auf beiden Geraeteklassen visuell geprueft.
- Dies ist bewusst kein vollstaendiger VoiceOver-End-to-End-Nachweis. Die App-Store-Accessibility-Deklaration bleibt fuer VoiceOver bis zur kompletten Abnahme aller haeufigen Aufgaben auf `false`.
- Chatnachrichten ergaenzen diesen Teilnachweis: Informationen, Loeschen, Melden, Blockieren und Ausblenden sind nicht mehr ausschliesslich von Long-Press abhaengig, sondern entsprechend der vorhandenen Berechtigung als VoiceOver-Aktionen erreichbar. Bild-, Objektkarten- und Consent-Kindaktionen bleiben separat bedienbar.
- Szenen und Spielsachen ergaenzen den Teilnachweis um gesprochene Kachel-, Kategorie-, Favoriten-, Bild- und Detailbildzustaende. Die optionale App-Sperre besitzt ausserdem einen ausfuehrbaren Negativtest gegen die zweite Face-ID-Abfrage direkt nach dem Einschalten.
- Kalender und Tracker-Jahresansicht ergaenzen den Teilnachweis um vollstaendige Datumswerte, textlich bezeichnetes Heute, verborgene leere Randtage, eine neutrale Zoombezeichnung und einzeln erreichbare Mehrfacheintraege. Die globale VoiceOver-Deklaration bleibt bis zum vollstaendigen End-to-End-Audit unveraendert `false`.
- Die Anfrageplanung ergaenzt den Teilnachweis um eindeutig gesprochene Zeitwerte, Ausgangsobjekt, Auswahlzustaende, fehlende Pflichtangaben und Sendezustand. Der visuelle Schnell- und Detailflow bestand auf kleinem iPhone, grosser Schrift und iPad.
- Die Self-Service-Kontoloeschung ergaenzt den Teilnachweis um gesprochenen Bestaetigungszustand, laufende Loeschung, Unwiderruflichkeit, Fehler und stabile UI-Testziele. Der zweite Schritt bestand visuell auf kleinem iPhone mit grosser Schrift und iPad.

## Multi-Rollen-Review-Nachweis 2026-07-14

- `npm run test:review-roles:live` prueft den dauerhaft erreichbaren Review-Mandanten mit Alex, Sam und Review Admin. Alle drei Logins muessen getrennte Benutzer, denselben Review-Zirkel, bestaetigte Pflichtdokumente sowie funktionsfaehige Status- und Chat-Endpunkte liefern.
- Alex und Sam muessen Moderationswarteschlange und Benutzerverwaltung mit HTTP `403 forbidden` abgewiesen bekommen. Review Admin muss beide Routen mit HTTP `200` lesen koennen. Damit wird die Rollenabgrenzung nicht aus dem Seed oder aus sichtbaren Menues abgeleitet, sondern live serverseitig bewiesen.
- Der Test widerruft jede erzeugte App-Sitzung in einem `finally`-Pfad und verlangt danach HTTP `401` vom ehemaligen Token. Der aktuelle Nachweis endete mit `APP_REVIEW_ROLES_LIVE_OK accounts=3 user=2 admin=1 sessions_revoked=3`.
