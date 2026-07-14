# App-Store-Datenschutzangaben

Stand: 2026-07-14

Diese Datei ist die kanonische Arbeitsgrundlage fuer die Datenschutzangaben in App Store Connect. Sie bildet den dauerhaften iOS-Funktionsumfang, die Serververarbeitung und optionale Drittanbieterfunktionen ab. Vor jeder Einreichung muessen App, Backend, eingebundene SDKs und diese Liste gemeinsam geprueft werden.

Offizielle Grundlage:

- https://developer.apple.com/app-store/app-privacy-details/
- https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy

## Grundentscheidungen

- Playplaner sammelt Daten: **Ja**.
- Daten fuer Tracking: **Nein**. Es gibt keine Werbenetzwerke, keinen Datenbroker und keine Verknuepfung mit Drittanbieterdaten fuer zielgerichtete Werbung oder Werbemessung.
- App Tracking Transparency: **Nicht erforderlich**, solange diese Aussage wahr bleibt und kein entsprechendes SDK hinzukommt.
- Die unten genannten Daten sind grundsaetzlich mit dem Benutzerkonto verknuepft. Eine optionale Funktion bleibt deklarationspflichtig, wenn sie Bestandteil des eingereichten Produkts ist und die Kriterien fuer Apples optionale Nichtangabe nicht vollstaendig erfuellt.
- Apple-eigene App-Analytics- und Crashdaten, die Apple selbst erhebt und die die App nicht an den Betreiber uebertraegt, werden nicht als eigene Sammlung deklariert.

## In App Store Connect auszuwaehlen

| Apple-Kategorie | Datentyp | Zweck | Mit Benutzer verknuepft | Tracking | Produktbezug |
| --- | --- | --- | --- | --- | --- |
| Kontaktinformationen | Name | App-Funktionalitaet; Produktpersonalisierung | Ja | Nein | Konto, Profil, Anzeigename |
| Kontaktinformationen | E-Mail-Adresse | App-Funktionalitaet | Ja | Nein | Anmeldung, Einladung, Reset, Benachrichtigung |
| Kontaktinformationen | Sonstige Benutzerkontaktinformationen | App-Funktionalitaet | Ja | Nein | Optionale Telegram-Zuordnung beziehungsweise Chat-ID |
| Standort | Ungefaehrer Standort | App-Funktionalitaet | Ja | Nein | Benutzerseitige Ortsangaben fuer Termine/Pack-Events; IP-basierte Sicherheits- und Zugriffsprotokolle. Keine iOS-Standortberechtigung. |
| Sensible Informationen | Sensible Informationen | App-Funktionalitaet; Produktpersonalisierung | Ja | Nein | Private Interessen, Grenzen, Szenen, Planung und andere besonders persoenliche Angaben |
| Benutzerinhalte | E-Mails oder Textnachrichten | App-Funktionalitaet | Ja | Nein | Kreis-Chat und private Nachrichten |
| Benutzerinhalte | Fotos oder Videos | App-Funktionalitaet | Ja | Nein | Private Medien, Alben, Kommentar- und Chatbilder |
| Benutzerinhalte | Audiodaten | App-Funktionalitaet | Ja | Nein | Spracheingabe fuer Chat und Inhaltsbereiche; standardmaessige Loeschung nach erfolgreicher Transkription, optionale Aufbewahrung nur auf Nutzerwunsch |
| Benutzerinhalte | Sonstige Benutzerinhalte | App-Funktionalitaet; Produktpersonalisierung | Ja | Nein | Kommentare, Tagebuch/Wiki, Ideen, Szenen, Spielsachen, Planung, Tracker-Notizen, Packlisten und Freitext |
| Kennungen | Benutzer-ID | App-Funktionalitaet | Ja | Nein | Konto-, Tenant-, Zirkel- und Berechtigungszuordnung |
| Kennungen | Geraete-ID | App-Funktionalitaet | Ja | Nein | APNs-/FCM-Geraetetoken, Geraetename und App-Version fuer Push und Sitzungsverwaltung |
| Nutzungsdaten | Produktinteraktion | App-Funktionalitaet | Ja | Nein | Loginzeitpunkt, Sicherheits-/Auditereignisse, Zustimmungsrevisionen, Feed-Interaktionen und Funktionsstatus |

## Derzeit nicht auszuwaehlen

- Gesundheits- oder Fitnessdaten: Die App fragt keine spezifischen HealthKit-, Medizin- oder Fitnessdaten ab. Beliebige Freitexte werden als sonstige Benutzerinhalte behandelt.
- Praeziser Standort: Die App verwendet keine Core-Location-Berechtigung und erhebt keine hochaufgeloesten Koordinaten. Wird spaeter GPS oder ein exakter Kartenpunkt eingefuehrt, muss diese Entscheidung neu bewertet werden.
- Kontakte/Adressbuch: Es gibt keinen Zugriff auf das iOS-Adressbuch.
- Zahlungs- oder Kaufdaten: Die native App verarbeitet keine digitalen Zahlungen und speichert keine Kaufhistorie. Physische Shopify-Produkte sind ein getrennter Katalog; bei einem spaeteren Checkout erneut pruefen.
- Such- oder Browserverlauf: Suchanfragen werden nicht als personenbezogener Verlauf gespeichert. Der interne Browser ist kein allgemeiner Browser.
- Werbedaten: Es gibt keine Werbung.
- Crash-, Performance- oder sonstige Diagnosedaten: Es ist kein eigener Crash-/Telemetry-Dienst in der iOS-App eingebunden. Server-Audit und Sicherheitsprotokollierung werden als Produktinteraktion/App-Funktionalitaet deklariert.

## Drittanbieter

- Apple APNs beziehungsweise optional FCM erhalten nur die fuer die Zustellung erforderlichen Geraetekennungen und diskreten Payloads.
- Telegram und OpenAI werden nur nach getrennter Einwilligung und bei aktivierter beziehungsweise konkret gestarteter Funktion verwendet. Diese Uebertragungen aendern nicht die Einstufung `Tracking: Nein`.
- Shopify dient dem Import beziehungsweise der Darstellung physischer Produkte. Keine digitalen iOS-Kaeufe oder Zahlungsdaten werden im geprueften Stand verarbeitet.
- SMTP-/E-Mail-Dienstleister verarbeiten E-Mail-Adresse und funktionsbezogene Nachrichten fuer Anmeldung, Einladung, Reset und Benachrichtigung.

## Manuelle ASC-Abnahme

1. Unter App-Datenschutz `Daten werden gesammelt` auswaehlen.
2. Exakt die in der Tabelle genannten Datentypen aktivieren.
3. Fuer jeden Typ die genannten Zwecke, `mit Benutzer verknuepft: Ja` und `fuer Tracking verwendet: Nein` setzen.
4. Privacy Policy URL auf die oeffentliche Playplaner-Datenschutzerklaerung setzen.
5. Privacy Choices URL auf `https://playplaner.com/privacy` setzen. Die oeffentliche Seite nennt Datenexport, Einwilligungen und Kontoloeschung. ASC-Readback vom 2026-07-14 bestaetigt Privacy Policy URL und Privacy Choices URL auf diesem Ziel.
6. Product Page Preview kontrollieren und den finalen ASC-Zustand per Screenshot/Readback dokumentieren.

## Aenderungsausloeser

Die Angaben muessen vor dem naechsten Build neu geprueft werden, wenn eines davon eintritt:

- neues Analytics-, Crash-, Werbe-, Login- oder Marketing-SDK
- Standort-, Kontakte-, HealthKit- oder Tracking-Berechtigung
- digitales Abo, In-App-Kauf oder gespeicherte Kaufhistorie
- neue Datenweitergabe an Telegram, OpenAI, Shopify oder andere Anbieter
- dauerhafte Speicherung neuer Audio-, Diagnose-, Such- oder Browserverlaufsdaten
- Aenderung der Serverlogs, Aufbewahrungsfristen oder Identitaetsverknuepfung
