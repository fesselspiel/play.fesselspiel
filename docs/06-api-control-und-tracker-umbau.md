# API-Control und Tracker-Umbau

Diese Notiz beschreibt den lokalen Umbau gegenueber dem GitHub-Ausgangsstand. Sie ist als Uebergabe fuer Review, Weiterentwicklung und moegliche Aufteilung in kleinere Commits gedacht.

## Ziel

Die Webapp soll nicht nur Daten anzeigen, sondern zentrale API- und Tracker-Funktionen direkt bedienbar machen. Der Schwerpunkt liegt auf einer nativen Admin-Oberflaeche fuer API-Funktionen und einer schnelleren Tracker-Bedienung auf Dashboard, Session-Uebersicht und Tracker-Detailseite.

## Neue API-Control-Seite

- Neue Route: `src/app/settings/api-control/page.tsx`
- Neuer Admin-Menuepunkt: Einstellungen -> API Kontrolle
- Zweck: zentrale Bedien- und Pruefoberflaeche fuer externe Aktionen.
- Enthalten sind unter anderem:
  - Portalstatus und Capabilities-Preview
  - Play-Ready/Ampel lesen und setzen
  - Tracker-Quotas, Tracker starten/stoppen
  - Einladungsauslastung und Einladungserstellung
  - Medien-, Bild- und Datei-Feeds
  - Endpunktliste mit Beispiel-Payloads und curl-Vorlagen
  - Vollstaendigkeitscheck zwischen Capabilities und Konsole

Die Seite ist absichtlich breit angelegt, weil sie als Arbeitsoberflaeche fuer App-/API-Integration dienen soll.

## Native API-Konsole

- Neue Komponente: `src/components/api-native-console.tsx`
- Neuer Katalog: `src/lib/api-native-tool-catalog.ts`

Die Konsole macht API-Endpunkte als Tools bedienbar. Sie unterstuetzt gespeicherte Token-Eingabe im Browser, Methodenauswahl, Pfad- und Query-Parameter, JSON/Form-Body, Multipart-Upload und einen Roh-Request-Modus. Ziel ist, API-Funktionen ohne externe Tools wie curl oder Postman testen zu koennen.

Der Tool-Katalog besteht aus manuell kuratierten Hauptfunktionen plus automatisch aus `apiEndpointSpecs` abgeleiteten Capability-Endpunkten. Dadurch sollen neue Capabilities leichter sichtbar werden.

## Navigation und Feature-Logik

- Neue zentrale Navigation: `src/lib/app-navigation.ts`
- Neue clientfaehige Feature-Helfer: `src/lib/feature-utils.ts`
- Angepasst:
  - `src/components/app-shell.tsx`
  - `src/components/mobile-menu.tsx`
  - `src/lib/features.ts`

Vorher waren Desktop- und Mobile-Navigation separat dupliziert. Jetzt kommen beide aus derselben Navigationsdefinition. Die Feature-Sichtbarkeit wurde in `feature-utils.ts` ausgelagert, damit Client-Komponenten keine Server-only-Imports aus `next/headers` ziehen.

Wichtig fuer Reviewer: `features.ts` bleibt die serverseitige Eintrittsstelle fuer `hasFeature` und `requireFeature`, re-exportiert aber die reinen Helfer.

## Tracker-Bedienung

Geaendert:

- `src/app/page.tsx`
- `src/app/sessions/page.tsx`
- `src/app/trackers/[trackerKey]/[slug]/page.tsx`
- `src/lib/tracker-core.ts`

Neue Funktionen:

- Tracker direkt vom Dashboard starten und stoppen
- alle eigenen laufenden Tracker gesammelt stoppen
- laufende Tracker mit Ruecksprung auf derselben Seite beenden
- Tracker-Zentrale auf `/sessions` mit Karten fuer alle sichtbaren Tracker
- Start/Stop-Status auf Tracker-Detailseiten
- neue Core-Helfer `runningTrackerEntriesForUser` und `stopAllRunningTrackerEntriesForUser`

Der Grund fuer diese Aenderung: Die App soll weniger wie eine reine Historie wirken und mehr wie ein Kontrollpanel fuer aktuelle Aktionen.

## Capabilities

Geaendert: `src/lib/capabilities.ts`

Ergaenzt wurden POST-Varianten in der Capability-Beschreibung fuer:

- Play-Ready/Ampel setzen
- Tracker starten
- Tracker stoppen
- Einladungen erstellen
- Punkte lesen und Punkteregeln verwalten

Das beschreibt die bereits naheliegende native App-Nutzung besser, weil mobile Clients nicht alle Schreibaktionen ueber GET-URLs abbilden sollten.

Punkte-Endpunkte:

- `GET /api/external/points`
- `GET /api/external/points/rules`
- `POST /api/external/points/rules`

`GET /api/external/points` liefert den eigenen Punktestand, sichtbares Leaderboard und letzte eigene Buchungen. Admins koennen ueber `/points/rules` Punkte pro Audit-Aktion lesen und setzen.

Wiki-Endpunkte:

- `GET /api/external/wiki`
- `POST /api/external/wiki`
- `GET /api/external/wiki/{id}`
- `PATCH /api/external/wiki/{id}`
- `DELETE /api/external/wiki/{id}`

Das Wiki ist ein eigenes Feature (`wiki`) mit Benutzer-Namensraeumen unter `/wiki/{benutzerSlug}`. Inhalte werden als MediaWiki-kompatibler Rohtext gespeichert. Der Seiten-Slug wird automatisch aus dem Titel erzeugt. Die Webansicht rendert Ueberschriften, Listen, fett/kursiv und interne Links. Der Web-Export einer Seite liegt unter `/wiki/{benutzerSlug}/{seitenSlug}/export` und liefert eine `.wiki`-Datei. API-Antworten enthalten `content`, `mediaWikiExport`, `revisions[]` und `images[]`.

Ergaenzt wurden ausserdem Katalog-Endpunkte fuer native Apps:

- `GET /api/external/catalog/categories?kind=all`
- `GET /api/external/catalog/toys?limit=100`
- `POST /api/external/catalog/toys`
- `GET /api/external/catalog/positions?limit=100`

Diese Endpunkte liefern Kategorien, Bilder, Favoriten und Verknuepfungen fuer Spielsachen und Szenen. `POST /api/external/catalog/toys` legt eine Spielsache mit `title`, optionaler `description`, `categoryId`/`category`, `positionIds[]` und `imageUrl` an. Alternativ akzeptiert der Endpunkt `multipart/form-data` mit Datei-Feld `file`; die Datei wird als geschuetztes FileAsset gespeichert und als normales Spielzeugbild zurueckgegeben. Der Endpunkt gibt das normale Katalog-Item-Shape zurueck. Sie verwenden denselben Bearer-Token wie die restliche externe API und respektieren Mandant, Berechtigungen und Feature-Schalter.

Tracker-Historie fuer native Kalender:

- `GET /api/external/trackers/history?from=YYYY-MM-DD&to=YYYY-MM-DD`
- optional `trackerKey={key}`

Der Endpunkt liefert echte `TrackerEntry`-Datensaetze im Zeitraum, keine Protokoll- oder Reminder-Ereignisse. Das Shape enthaelt bewusst Alias-Felder fuer native Apps: `trackerKey`/`key`, `trackerTitle`/`trackerName`, `startedAt`/`startTime`, `date`/`calendarDate`, `endedAt`/`endTime`, `durationMinutes`/`minutes` und `allDay`.

## Build-Fixes waehrend Docker-Verifikation

Beim Docker-Build wurden mehrere TypeScript-/TSX-Probleme sichtbar und direkt repariert:

- falsch geschlossene JSX-Struktur in der API-Control-Seite
- falscher Import von `ensureDefaultAlbum`
- client/server Import-Konflikt in der Mobile-Navigation
- fehlende Defaults und zu breite Typinferenz in der API-Konsole
- `disabled` an einem lokalen `Button`-Wrapper, der diese Prop nicht akzeptiert
- unsichere `openEntry`-Verwendung in der Session-Seite

Verifikation:

- `docker compose --progress plain build app` laeuft erfolgreich durch.
- `docker compose up -d` startet die im Compose-Setup definierten Services.
- Die neue Admin-Seite ist nach Login unter `/settings/api-control` erreichbar.

Deployment-Hinweis: Die Aenderungen setzen keine neue lokale Toolchain voraus. Der bestehende Dockerfile-Pfad nutzt weiterhin npm (`npm install`, `npm run build`, `npm start`). Fuer produktive Hosts bleiben die vorhandenen Environment-Variablen und Reverse-Proxy-Regeln massgeblich.

## Review-Hinweise

Der Umbau ist funktional zusammenhaengend, aber gross. Fuer einen leichteren Review koennte man ihn in diese PRs aufteilen:

1. Navigation/Feature-Split ohne Funktionsaenderung
2. Tracker-Start/Stop-UX
3. API-Control-Seite und API-Konsole
4. Capabilities-Dokumentation fuer POST-Endpunkte

Vor Merge sollte jemand mit Produktkontext pruefen, ob die API-Control-Seite nur fuer Admins sichtbar sein soll und ob die Roh-Request-Konsole in Produktion gewuenscht ist.

## Nachgezogen nach Review

- Die API-Control-Server-Actions pruefen jetzt selbst auf Admin/Super-Admin, nicht nur die Seite.
- Die API-Konsole speichert eingegebene Tokens nur noch in der aktuellen Browser-Session.
- Kuratierte Requests senden API-Tokens standardmaessig nur noch als Bearer-Header. Token-in-URL bleibt in den kopierbaren Beispielen bewusst als separate Alexa-/Webhook-Variante sichtbar.
- Der Roh-Request-Modus ist auf die eigene Domain und `/api/external/*` begrenzt, damit Tokens nicht versehentlich an fremde Hosts gesendet werden.
- Tokenwerte in angezeigten Request-URLs werden maskiert.
- Datei-Downloads ueber `/api/external/files/:id` haengen nicht mehr pauschal am Medien-Feature, sondern an `externalApi` plus der bestehenden Dateizugriffspruefung. Dadurch funktionieren Bildfeeds fuer Spielsachen, Szenen, Ideen und Produkte auch ohne aktivierte Mediengalerie.
- Der externe Status-Endpunkt nutzt fuer Medienzaehler den Medien-Sichtbarkeits-Scope.
- Tracker-Start/Stop bevorzugt bei gleichem Key zuerst den Tracker der aktuellen Seite und faellt erst danach auf globale Tracker zurueck.
