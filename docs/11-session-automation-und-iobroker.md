# Session-Automation, Rule-Engine und ioBroker-Integration

## Auftrag an Codex

Implementiere diese Erweiterung vollständig in
`fesselspiel/play.fesselspiel`. Analysiere vor Änderungen die vorhandene
Architektur. Erweitere bestehende Systeme, statt parallele Tracker-,
Session-, Datei-, Rule-, Rechte- oder Notification-Systeme zu bauen.
Prüfe insbesondere `prisma/schema.prisma`, `SegufixSession`,
`TrackerType`, `TrackerEntry`, `ScheduledRule`, `ScheduledRuleRun`,
`AuditLog`, `FileAsset`, externe APIs, Telegram,
Tenant-/Kreis-/Rollenlogik und die Dokumentation unter `docs/`.

## Architektur

Playplaner ist die fachliche Source of Truth für Sessions, Regeln,
Zeitlogik, Rollen, Actions, Events, Tracker und Geräteabstraktion. Eine
interne Integrationsschicht übersetzt generische Actions in externe
Protokolle. Der ioBroker-Adapter `playplaner` ist nur die Bridge ins
private LAN. Er führt Befehle aus, spiegelt Zustände und meldet Events
zurück. Keine fachliche Rule- oder Session-Logik im Adapter.

## Session

Zustände: `IDLE`, `RUNNING`, `PENDING_END`, `FINISHED`, optional
`CANCELLED` nur für administrative Korrekturen.

Pro Kontext höchstens eine aktive Session. Start kann aus Web/App, API,
Telegram, Alexa/ioBroker oder einer Regel kommen. Start ist idempotent.
Läuft bereits eine Session, wird ein weiterer Start ignoriert und
erzeugt weder Session noch Tracker doppelt.

Beim Start genau einen Tracker `segufix-self` starten und eindeutig mit
der Session verknüpfen. Beim tatsächlichen Session-Ende diesen Tracker
stoppen. Kein separates Quoten-System bauen. Vorhandene Tracker-Quoten
verwenden, zum Beispiel 120 Minuten pro Woche. Bildanforderungen
verbrauchen keine Quote.

## Stop und Pending End

Ein Stop kann sofort oder über die Zeitlogik erfolgen. Bei Verzögerung
wechselt die Session zu `PENDING_END`; der konkrete Endzeitpunkt wird
persistiert.

Ein erneuter normaler Stop während `PENDING_END` darf das bestehende
Fenster nicht resetten, verlängern, verkürzen oder neu auswürfeln.
Während `PENDING_END` dürfen gemäß Rolle/Policy weiterhin andere Actions
laufen, etwa Bildanforderung, Lichtsignal, Status oder Voice.
Ausdrücklich berechtigte Controller-Overrides sind möglich.

## Zeitlogik

Unterstützen:

1.  sofort
2.  feste relative Verzögerung
3.  zufällige relative Verzögerung zwischen Min/Max
4.  bedingte Ausführung, optional mit anschließender Verzögerung

Bedingungen umfassen auch Event-Abwesenheit, zum Beispiel: Wenn
innerhalb von X Minuten keine Aktion einer Drittperson kommt, dann
Action Y. Weitere Beispiele: Zustandswechsel, erfolgreiche Action,
Geräteevent, Kamera wieder online.

Bei Zufallsfenstern genau einmal einen konkreten Wert bestimmen und
speichern. Neustarts dürfen nicht neu würfeln. Keine absolute Uhrzeit
als primäres Session-Zeitmodell.

## Commands und Actions

Alle Quellen werden auf ein gemeinsames Command-Modell normalisiert.
Clients enthalten keine eigene Geschäftslogik.

Action-Status mindestens: `CREATED`, `WAITING`, `READY`, `RUNNING`,
`SUCCEEDED`, `FAILED`, `CANCELLED`.

Actions speichern Tenant, Session, Typ, Quelle, Actor/Rolle, Ziel,
Device/Capability, Zeiten, aufgelöste Zeitparameter, Ergebnis/Fehler,
Correlation-ID und Execution Context.

Session-Zustandsänderungen serialisieren. Unabhängige Geräteaktionen
dürfen parallel laufen; bei Bedarf Reihenfolge pro Device/Capability.

## Rule-Engine

Regeln als versionierte Daten speichern:

`Trigger -> Bedingungen -> Zeitlogik -> Aktion(en)`

Trigger/Conditions mindestens für Session-Start/-Status, Pending End,
Action-Erfolg/-Fehler, Event-Eintritt, Event-Abwesenheit, Gerätezustand,
Capability-Event, Kamera-Health sowie Tracker-/Quota-Ereignisse.

Regeln unterstützen `ONCE` und `REPEAT`, Standard `ONCE`. Historische
Ausführungen referenzieren die tatsächlich verwendete Rule-Version.

## Rule-Editor

Genau eine vollständige Oberfläche, keine Anfänger-/Expertenansichten.

Der Editor ist abhängigkeitsgesteuert. Nur Felder zeigen, die zur
Auswahl passen. Min/Max nur bei Zufallsfenster. Capability-Felder nur im
passenden Kontext. Widersprüchliche Kombinationen nicht gleichzeitig
zulassen. Client- und Servervalidierung.

Zusätzlich eine menschenlesbare Regelbeschreibung erzeugen.

## Simulation

Regeln ohne echte Side Effects simulieren. Scrubbaren Zeitstrahl bauen,
keinen automatisch durchlaufenden Film. Beim Verschieben des Reglers
Events, Zustände, Bedingungen und deren Ergebnis, ausgelöste Regeln,
wartende/fällige Actions, Zufallswerte, Pending End und Variablen
anzeigen. Simulation darf keine realen MQTT-, ioBroker-, Kamera-, Voice-
oder Notification-Aktionen ausführen.

## Events und Protokoll

Wichtige Events unveränderlich speichern; aktuellen Zustand zusätzlich
materialisieren.

Events enthalten Zeit, internen Typ, menschenlesbaren Titel, Quelle,
Actor/Rolle, Referenzen auf
Session/Rule/Version/Action/Device/Capability, Correlation-ID, Parent
und strukturierte Details.

Standardansicht in verständlichem Deutsch, zum Beispiel
`18:42:13 · Kamera hat kein gültiges Bild geliefert.` Pro Eintrag
Aufklapper `Technische Details` mit vollständigen IDs, Keys, Payloads,
Context und Fehlerdaten. Ursache-Wirkungs-Ketten navigierbar machen.

## Execution Context

Unveränderlicher Snapshot jeder relevanten Entscheidung: Tenant,
Session, Actor, Rolle, Quelle/Integration, auslösendes Event,
Rule/Version, Action, Device/Capability, Variablen, Bedingungen und
Ergebnisse, Policy-Entscheidung, Zeitmodell, Zufallswert, geplante Zeit,
Correlation-ID und Parent-Context. Folgeausführungen erzeugen neue
Contexts mit Parent-Referenz.

## Rollen

Mindestens:

-   Owner / Session-Benutzer
-   Controller / berechtigte Drittperson
-   System / Rule-Engine

Berechtigungen nach Rolle + Session-Zustand + Action prüfen.
Entscheidungen protokollieren. Beispiel `PENDING_END`: normaler erneuter
Stop ändert das Fenster nicht; Bild kann erlaubt bleiben; automatische
Lichtaktion darf reagieren; ausdrücklich erlaubter Controller-Override
kann verfügbar sein.

## Devices und Capabilities

Devices über Fähigkeiten statt Hersteller modellieren. Device mindestens
mit logischer ID, Tenant, Name, Integration, Health, Metadaten und
Capabilities.

Capability definiert Actions, Events, Zustände, Conditions,
Parameter/Datentypen, Abhängigkeiten und UI-Metadaten.

Camera: Zustände online/offline/booting/error; Actions Bild anfordern
und Health prüfen; Events Bild angefordert/empfangen/ungültig, nicht
erreichbar/wieder erreichbar; Conditions online/offline und letztes Bild
jünger als X.

Switch: Zustände ein/aus/schaltet/nicht erreichbar/Fehler; Actions
ein/aus/umschalten; Events eingeschaltet/ausgeschaltet/Fehler;
Conditions ist ein/aus und seit X Minuten.

Voice: Action Text sprechen; Events Ausgabe gestartet/beendet/nicht
erreichbar. Keine Sprachwahl und keine fachlich feste maximale
Textlänge.

## MQTT und ioBroker

Mosquitto auf dem Playplaner-VPS. TLS, keine anonymen Verbindungen,
getrennte Credentials/ACLs, installations-/tenant-spezifische Topics,
Command-/Correlation-ID, Heartbeat und versionierte Topic-Struktur wie
`playplaner/v1/...`.

MQTT nur für Commands, Status, Events und Metadaten. Keine Bilder als
Base64 über MQTT.

ioBroker-Adapter `playplaner`: ausgehende MQTT-Verbindung,
Auth/Heartbeat, Device-/Capability-Sync, Sessionzustand in Datenpunkte
spiegeln, lokale Trigger wie Alexa entgegennehmen, idempotente Commands
senden, Servercommands empfangen, lokale Geräte/Datenpunkte bedienen,
Ergebnisse melden und Kamerabilder per HTTPS hochladen.

State-Baum mindestens für Connection/Health, Session-ID, Session-State,
Start/Stop, Pending End, Devices, Capability-Zustände sowie letzte
Commands/Responses/Fehler. Nach Reconnect vollständig resynchronisieren.

Alexa setzt lokale Datenpunkte. Der Adapter sendet Commands an
Playplaner. Alexa enthält keine eigene Session- oder Verzögerungslogik.

## ESP32-Cam und Bilder

ESP32-Cam bleibt im privaten LAN. Bildanforderung erzeugt in Playplaner
eine Request-ID. MQTT fordert den lokalen Adapter an. Adapter ruft
Kamera lokal ab, validiert Antwort/Bild und lädt das Bild
authentifiziert per HTTPS zu Playplaner. Dort als geschütztes
`FileAsset` speichern und mit Session/Image Request verknüpfen. Keine
direkte Kamera-URL an Clients.

Bei Fehler: Event erzeugen, Empfänger verständlich informieren,
konfigurierte Power-Capability auslösen, zum Beispiel Shelly über
ioBroker-Datenpunkt aus/ein, Bootzeit warten, erneut prüfen und Bild
erneut abrufen. Retry-Anzahl, Timeout und Bootzeit konfigurierbar. Ganze
Recovery-Kette protokollieren und simulieren können.

## API und Worker

Command-orientierte API nach vorhandenen Playplaner-Mustern. Mindestens
aktuelle Session, Start, Ende anfordern, erlaubter Override, Historie,
Rules CRUD/Versionierung/Simulation, Devices/Capabilities,
Bridge-Health, Image Request/Upload sowie Actions/Events.

Alle Mutationen mit Authentifizierung, Autorisierung, Tenant-Prüfung und
Idempotenz.

Zeitabhängige Actions serverseitig persistent schedulen. Nicht von
Browser- oder ioBroker-Timern als Source of Truth abhängen. Nach
Neustart fortsetzen. Mehrfachausführung durch atomare Claims/idempotente
Executor-Logik verhindern.

## UI

Mindestens Session-Übersicht, Pending-End-Anzeige, Session-Historie,
menschenlesbares Detailprotokoll mit Raw-Aufklappern, Rule-Liste,
vollständiger Rule-Editor, scrubbbarer Simulator,
Device-/Capability-Verwaltung, Bridge-Health sowie geschützte
Session-Bilder/Image Requests. Bestehende Playplaner-Komponenten und
Designmuster verwenden.

## Sicherheitsgrenze

Playplaner darf Session-Timing, Status, Benachrichtigungen,
Kameraüberwachung, Tracker, Beleuchtung, Voice-Ausgabe und allgemeine
Geräteautomation verwalten.

Eine unabhängige physische Not-/Sicherheitsfreigabe bleibt offline und
unabhängig von Playplaner, MQTT, Internet, ioBroker und der
Stromversorgung der Automationskette. Playplaner soll vor Beginn einer
entsprechenden Session an deren Einrichtung beziehungsweise Prüfung
erinnern.

## Tests

Mindestens testen:

-   idempotenter Doppelstart
-   Session-/Tracker-Kopplung
-   `RUNNING -> PENDING_END -> FINISHED`
-   feste Verzögerung
-   persistiertes Zufallsfenster
-   Event-Abwesenheit als Bedingung
-   erneuter Stop resetet Pending End nicht
-   Rollen und Overrides
-   serialisierte Session-Transitions
-   parallele unabhängige Device-Actions
-   Rule-Versionierung
-   Simulation ohne Side Effects
-   Event-/Correlation-Ketten
-   MQTT-Duplikate und Reconnect
-   Kamera Erfolg, Fehler, Recovery und Retry
-   geschützte Bildrechte
-   Tenant-Isolation

## Umsetzungsvorgabe

Vor Implementierung bestehende Architektur vollständig prüfen.
Bestehende Modelle und Services bevorzugt weiterentwickeln.
Schemaänderungen sauber migrieren. Relevante Tests, Typecheck, Lint und
Build ausführen. Die vorhandenen Dokumentationsdateien gemäß den Regeln
in `docs/README.md` aktualisieren.

Die Erweiterung soll in einem zusammenhängenden Implementierungsauftrag
vollständig umgesetzt werden. Keine künstliche Reduktion auf einen MVP,
sofern nicht eine konkrete technische Abhängigkeit dies erzwingt.
