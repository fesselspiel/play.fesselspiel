# Implementierungslog

Dieses Log fasst zusammen, was bisher im Projekt gebaut wurde. Neue Änderungen sollen hier nachgetragen werden.

## Initiale App

- Next.js 14 App Router Projekt erstellt.
- Prisma und PostgreSQL angebunden.
- Dockerfile und Docker Compose eingerichtet.
- Traefik-Labels für `play.fesselspiel.com` vorbereitet.
- Admin-Seed über Environment-Variablen.
- Grundlayout mit Sidebar, Mobile Header, Panels, Buttons und Formfeldern.

## Auth und Benutzer

- Login-API unter `/api/auth/login`.
- Logout-API unter `/api/auth/logout`.
- Cookie/JWT-basierte Session.
- Admin/User-Rollen.
- Benutzerverwaltung unter `/settings/users`.
- Profilseite unter `/profile`.

## Domain-Korrektur

- Domain von `play.festspiel.com` auf `play.fesselspiel.com` geändert.
- Docker Compose, App-URL, Traefik-Router und UI-Texte angepasst.

## Deployment auf VPS

- Deployment in ein Docker-Compose-Projektverzeichnis auf dem VPS.
- App-Container `kink_social_app`.
- PostgreSQL-Container `kink_social_postgres`.
- App gebunden auf `127.0.0.1:8097`.
- Build/Restart per `docker compose build app && docker compose up -d app`.
- Runtime-Logs nach `runtime-logs/startup.log` im Projektverzeichnis.

## Login UX

- Passwortfeld mit Auge/Toggle ergänzt, damit Eingaben sichtbar gemacht werden können.

## Telegram

- Telegram-Einstellungen für Bot-Token und OpenAI-Key.
- Werte werden verschlüsselt gespeichert.
- Chat- und Thread-Erkennung.
- Button/Reload-Logik zum Einlesen von Updates.
- Webhook setzen und löschen.
- Bot-Kommandos und später Agentenlogik.
- Agent beantwortet freie Nachrichten über OpenAI.
- Agent kann Aktionen im Portal ausführen.
- Kurzzeitgedächtnis über die letzten ca. 10 Nachrichten.
- Dialogsystem für Item-Anlage.
- Dialog fragt benötigte Felder ab und legt erst danach den Datensatz an.
- Dialoge für Spielzeug und Szene.
- Telegram-Bilder können in laufenden Dialogen als Bild für das Item verwendet werden.
- Freie Telegram-Bilder werden automatisch als Bild gespeichert.
- Unbekannte Telegram-Chats oder Threads werden nur als `PENDING` in der App gespeichert.
- Der Bot schreibt beim reinen Erkennen eines Chats keine automatische Nachricht mehr in Telegram.
- Telegram-Webhook akzeptiert eine chatweite Freigabe: Wenn ein `ACTIVE`-Eintrag ohne Thread-ID existiert, werden Nachrichten und Bilder aus allen Threads dieses Chats verarbeitet.
- Telegram-Einstellungen zeigen erkannte `PENDING`-Chats separat an und können sie entweder threadgenau oder für den ganzen Chat aktivieren.

## Theme Changer

- `UserSettings.theme` im Prisma-Schema.
- Theme-Picker in Benutzereinstellungen/Profileinstellungen.
- Sofortige Theme-Vorschau beim Anklicken, nicht erst nach Speichern.
- Themes: Rot, Pink, Hellblau, Gelb, Orange, Violett, Grün/Emerald, Mono.
- CSS-Variablen für Canvas, Surface, Paper, Line, Ink, Graphite, Redbrand und Hover.
- Hintergrundfarbe passt jetzt zum jeweiligen Farbschema.
- `UserSettings.darkMode` speichert zusätzlich den persönlichen Hell-/Dunkelmodus.
- Der Theme-Picker hat einen iPhone-artigen Toggle-Schalter für Dark Mode statt Checkbox.
- Dark Mode wird sofort als Vorschau angewendet und pro Benutzer gespeichert.
- Alle vorhandenen Farbschemas haben eine dunkle Variante mit schwarzem Hintergrund, dunklen Flächen und angepasster Akzentfarbe.
- Feste weiße Link-Flächen auf Detailseiten wurden durch Theme-Flächen ersetzt, damit verknüpfte Spielzeuge, Szenen und Aktivitäten im Dark Mode lesbar bleiben.

## Geschützte Uploads

- `FileAsset` Modell.
- `src/lib/files.ts` für Speichern, URL-Erzeugung, ID-Erkennung und Löschen.
- Dateien werden benutzerbezogen unter `UPLOAD_PATH/<ownerId>/...` gespeichert.
- Keine absoluten Pfade in der UI.
- Keine direkte statische Auslieferung aus dem Dateisystem.
- Zugriff über `/api/files/[id]` mit Login- und Owner-Prüfung.
- Bilder und Dateien können hochgeladen werden.
- Beim Löschen von Bilder wird die Datei physisch entfernt.

## Bilderseite

- Bilderseite optisch ausgebaut.
- Galerie-Ansicht mit Bild-/Video-Karten.
- Spotlight für neueste Bilder.
- Album-Gruppierung.
- Metadaten wie Dateiname, MIME-Type, Größe und Erstellungsdatum.
- Upload-Formular.
- Album-Formular.
- Löschaktion je Bild.
- Bilder können die Sichtbarkeit ihres Albums übernehmen oder einzeln auf `Nur ich`, `Zirkel` oder `Alle` überschrieben werden.
- Album-Verwaltung erlaubt jetzt auch das Bearbeiten von Name, Beschreibung und Sichtbarkeit.
- Der geschützte Dateiabruf berücksichtigt sichtbare Bilder, damit freigegebene Bilder korrekt ausgeliefert werden und private Dateien geschützt bleiben.

## Szenen: Self-Bondage

- Szenen haben im Datenmodell das Boolean-Feld `selfBondageCapable`.
- Beim Anlegen und Bearbeiten einer Szene gibt es die Checkbox `Self-Bondage-fähig`.
- Szenen-Detailseiten zeigen den Status als Badge an.
- Die aufklappbare Szenenübersicht zeigt den Status in der Listenzeile und im geöffneten Detailbereich.
- Das Feld ist bewusst noch nicht in Filter oder Auswertungen eingebunden und steht für spätere Nutzung bereit.

## Mobile Navigation

- Mobile Navigation vom horizontalen Icon/Text-Menü zu Hamburger-Menü umgebaut.
- Hamburger oben rechts.
- Dropdown klappt nach unten auf und schwebt über dem Inhalt.
- Menü schließt nach Klick auf einen Eintrag.
- Danach optisch korrigiert: geschlossene Liste ohne Lücken zwischen den Menüpunkten.
- Mobile Menü-Overlay auf feste Viewport-Höhe umgestellt, mit eigenem Scrollbereich und Body-Scroll-Lock.
- Menü kann jetzt zuverlässig per X, Hintergrundklick, Escape oder Link-Auswahl geschlossen werden.
- Benutzerkarte und Abmelden liegen im scrollbaren Menübereich, damit sie auf iPad/iPhone erreichbar bleiben.

## Bearbeiten und Löschen

Ergaenzt für:

- Spielzeuge
- Szenen
- Aktivitäten
- Events
- Sessions

Details:

- Spielzeug bearbeiten unter `/toys/[slug]/edit`.
- Spielzeug löschen inklusive Bilddatei.
- Szene bearbeiten unter `/positions/[slug]/edit`.
- Szene löschen inklusive Bilddatei.
- Aktivität bearbeiten unter `/activities/[slug]/edit`.
- Aktivität löschen inklusive Verknüpfungen.
- Event bearbeiten unter `/events/[id]/edit`.
- Event löschen inklusive Check-ins.
- Session bearbeiten unter `/sessions/[id]/edit`.
- Session löschen aus Kalender, Historie und Auswertung.
- Slugs können beim Bearbeiten geändert werden.
- `uniqueSlugForUpdate` erlaubt den eigenen bestehenden Slug und verhindert Konflikte.
- Datums-/Zeitfelder nutzen `formatDateTimeLocal` für `datetime-local`.

## Dokumentation

- Wiederverwendbare Markdown-Dokumentation unter `docs/` angelegt.
- Projektüberblick, Deployment, Implementierungslog, Architektur und Prompt-Historie dokumentiert.
- Regel festgelegt: Bei weiteren Änderungen die Docs mitpflegen.

## Telegram-HTML-Ausgaben

- Telegram-Sendefunktion um `parse_mode: HTML` erweitert.
- Fallback eingebaut: Wenn Telegram HTML nicht akzeptiert, wird dieselbe Nachricht ohne Parse-Mode gesendet.
- HTML-Escape-Helper für sichere Telegram-Ausgabe ergänzt.
- Slash-Command-Listen `/toys`, `/positions`, `/activities`, `/sessions`, `/status`, `/id` mit fetten Überschriften, nummerierten Einträgen und klickbaren Links formatiert.
- Agent-Tool-Ergebnisse für Portalstatus und Suche werden direkt als Telegram-HTML formatiert.
- Dialog-Ergebnisse für neu angelegte Spielzeuge/Szenen nutzen klickbare Links.

## Spielzeug-Detailheader

- Der rote runde Badge `Permanente URL` auf der Spielzeug-Detailseite wurde durch eine dezente eckige URL-Info ersetzt.
- Dadurch bleibt `Bearbeiten` die einzige primaere Aktion im Header und die URL-Kennzeichnung wirkt nicht mehr wie ein zusammenhangloser Button.

## Kurzanleitungen pro Seite

- Wiederverwendbare Komponente `PageGuide` in `src/components/ui.tsx` ergänzt.
- Auf allen App-Seiten mit `PageHeader` kurze Beschreibungen eingefügt: Zweck der Seite, was man dort tun kann und wie der Benutzer vorgeht.
- Login-Seite um einen kurzen Hinweis zur Anmeldung und zum Passwort-Auge ergänzt.
- Texte bewusst kompakt gehalten, damit sie Orientierung geben ohne die Arbeitsoberflaeche zu überladen.
- PageGuide wurde später von einer prominenten Box unter der Überschrift zu einer eingeklappten Info-Schaltfläche unten rechts umgebaut.
- Die Hilfe ist damit außerhalb des Hauptsichtfelds, aber bei Bedarf per Klick aufklappbar.
- PageGuide wurde danach aus dem schwebenden `fixed` Overlay entfernt.
- Die Hilfe ist jetzt ein normales, dezentes Element am Seitenende rechts und liegt nicht mehr über dem Inhalt.
- Auf der Bilderseite wurde der erklärende Header-Subtitle entfernt; die Formulierung steht jetzt als Titel in der unteren Info-Box.
- Rein erklärende Header-Untertitel wurden auf allen Übersichts-, Neu-, Bearbeiten- und Einstellungsseiten entfernt. Die Erklärungen stehen jetzt als Titel/Inhalt in der unteren `PageGuide`-Info-Box.
- Funktionale Detailseiten-Anzeigen wie Slug, Pfad oder kopierbare URL bleiben im Header sichtbar.

## Detailseiten-Aktionen

- Bearbeiten-Aktionen auf Detailseiten für Spielzeuge, Szenen und Aktivitäten aus dem Header entfernt.
- Bearbeiten liegt jetzt in einem Aktionsbereich am unteren Ende der Detailseite.
- Der Header bleibt dadurch ruhiger und zeigt primaer Titel, URL/Status und Inhalt.
- Auf Aktivitäts-Detailseiten kopiert ein Klick auf den sichtbaren Pfad im Header die komplette HTTPS-URL in die Zwischenablage, ohne die Anzeige zu verändern.

## Upload-UX und iPhone-Bilder

- Next.js Server-Action Body-Limit auf `50mb` angehoben, damit iPhone-Fotos und größere Uploads nicht still an der Standardgrenze scheitern.
- Wiederverwendbare Komponente `FileUploadField` eingeführt.
- Datei-Auswahl zeigt jetzt sichtbaren Auswahlbereich, Dateiname, Größe und bei Bildern eine Vorschau.
- Beim Bearbeiten von Spielzeugen und Szenen wird das aktuelle Bild angezeigt; ein neu ausgewähltes Bild ersetzt es automatisch.
- Die Checkbox zum Entfernen erscheint nur, wenn kein neues Bild gewählt wurde. Sie setzt den Eintrag wieder auf das System-Standardbild.
- Datei-Uploads in Spielzeugen, Szenen und Bilder verwenden die neue Komponente.
- Für Spielzeug- und Szenenbilder wurde ein direkter Upload-Endpunkt `/api/uploads` ergänzt.
- Bei Bildauswahl wird die Datei sofort hochgeladen; der Speichern-Button speichert danach nur noch die fertige `/api/files/...` Referenz.
- Solange der direkte Upload noch läuft oder fehlgeschlagen ist, verhindert die Komponente das Absenden und zeigt einen Hinweis.
- Profilbilder in der Admin-Benutzerverwaltung verwenden ebenfalls den direkten Upload-Flow.
- Beim Bearbeiten eines Benutzers wird ein vom Admin hochgeladenes Profilbild dem Zielbenutzer zugeordnet, damit der geschützte Dateiabruf danach korrekt funktioniert.
- Speichern-Buttons in der Benutzerbearbeitung zeigen während des Speicherns Feedback und melden erfolgreiche Speicherung oder Uploadfehler.
- Der öffentliche Upload scheiterte zusätzlich an Nginx mit `413 Request Entity Too Large`, weil für `play.fesselspiel.com` kein `client_max_body_size` gesetzt war.
- Nginx-Site `play.fesselspiel.com` auf `client_max_body_size 50m` gesetzt, Konfiguration getestet und Nginx neu geladen.

## Dashboard-Wochenansicht

- Die Liste `Nächste Aktivitäten` auf dem Dashboard wurde durch `Gemeinsame Woche` ersetzt.
- Angezeigt werden heute plus die nächsten sechs Tage.
- Geplante Aktivitäten und Events werden zusammen als klickbare Einträge je Tag dargestellt.
- Tage mit Einträgen erhalten eine rote Akzentmarkierung, leere Tage bleiben neutral.
- Der Bereich hat einen direkten Button zum Planen neuer Aktivitäten.

## Seitentitel als Dashboard-Link

- Die wiederverwendbare Komponente `PageHeader` verlinkt den sichtbaren Seitentitel jetzt auf `/`.
- Dadurch führt ein Klick auf Seitentitel wie `Spielzeuge`, `Bilder`, `Events` oder Detailtitel direkt zurück zum Dashboard.
- Der Link hat einen dezenten roten Hover-Zustand und einen sichtbaren Fokusrahmen für Tastaturbedienung.

## Navigation: Lass uns spielen

- Der Hauptmenüpunkt `Aktivitäten` heißt jetzt `Lass uns spielen`.

## Seiten-/Mandanten-Trennung

- Benutzerkonten bleiben globale Logins; Seitenrechte werden über `TenantMembership` pro Seite abgebildet.
- Dieselbe Person kann dadurch mit gleichem Login in mehreren Seiten vorkommen, aber pro Seite eine eigene Rolle und Kreiszuordnung haben.
- Benutzerverwaltung zeigt nur noch Mitglieder der aktiven Seite.
- Admins können vorhandene globale Benutzer über „Bestehenden Benutzer übernehmen“ in die aktive Seite aufnehmen.
- Kreise sind pro Seite eindeutig und werden über Mitgliedschaften statt globale `User.circleId` ausgewertet.
- Alte Inhaltsmodelle wurden um `tenantId` erweitert: Spielzeuge, Szenen, Aktivitäten/Aufträge, Segufix-Sessions, KG-Sessions, Alben, Bilder, Events, Dateien und API-Tokens.
- Listen- und Detailseiten für Spielzeuge, Szenen und Aktivitäten laden Slugs nur noch im Kontext der aktiven Seite.
- Dashboard-Spielampel, E-Mail-/Telegram-Zielauswahlen und API-Token-Ausführung wurden auf Seitenkontext umgestellt.
- Telegram-Webhook, Telegram-Agent und Telegram-Erfassungsdialoge speichern neue Inhalte mit der ermittelten Seite.
- Seed/Startup führt einen Backfill aus: vorhandene Benutzer bekommen Mitgliedschaften, vorhandene Inhalte erhalten `tenantId` aus dem bisherigen Besitzer.
- VPS-Prüfung am 21.06.2026: neue Seite `rope` hatte danach keine alten Spielzeuge, Szenen, Sessions, Bilder oder Alben; alle alten Inhalte hatten eine `tenantId`.
- Die Menü-Reihenfolge wurde angepasst: Dashboard, Lass uns spielen, Szenen, Spielsachen.
- Der separate Menüpunkt `Events` wurde aus Desktop- und Mobile-Navigation entfernt, damit Termine nicht als doppeltes Hauptmodul neben der Spielplanung wirken.
- Bestehende Event-Daten werden nicht gelöscht; Termine aus Events erscheinen weiterhin in der Dashboard-Wochenansicht als `Termin`.
- Die Aktivitätsübersicht, Neu-Anlage, Detailseite und Bearbeitung wurden in der sichtbaren Sprache auf `Lass uns spielen`, `Spielidee`, `Spielplan` und `Spielsachen` umgestellt.
- Die Dashboard-Kachel `Events` wurde entfernt; stattdessen gibt es Kacheln für `Lass uns spielen`, `Szenen` und `Spielsachen`.

## Navigation: Einstellungen gebuendelt

- Die Hauptnavigation wurde weiter verschlankt.
- `Profil`, `Benutzer` und `Telegram` sind nicht mehr eigene Hauptpunkte.
- Stattdessen gibt es den Hauptpunkt `Einstellungen` mit den Unterpunkten `Profil`, `Benutzer` und `Telegram`.
- Die Buendelung wurde für Desktop-Sidebar und mobiles Hamburger-Menü umgesetzt.

## Spielzeug-URL-Anzeige reduziert

- Auf Spielzeug-Detailseiten wird oben die URL ohne `https://` angezeigt.
- Die Kennzeichnung `Permanente URL` wurde aus dem Header entfernt.
- Am Seitenende im Aktionsbereich sitzt jetzt ein dezenter Copy-Link ohne `https://`.
- Ein Klick kopiert den angezeigten Link ohne `https://` und markiert keinen Text auf der Seite.
- Die Spielzeug-Bearbeiten-Seite zeigt im Header ebenfalls nur den Slug statt `/toys/...`.

## Paar-/Gruppen-Kreise

- Daten waren bisher strikt pro Benutzer über `ownerId` sichtbar.
- Neues Modell `Circle` eingeführt; Benutzer können einem Kreis zugeordnet werden.
- Mitglieder desselben Kreises sehen automatisch gemeinsame Inhalte, ohne einzelne Freigaben setzen zu müssen.
- Benutzerverwaltung erweitert:
  - Kreise anlegen.
  - Beim Anlegen und Bearbeiten Benutzer einem Kreis zuordnen.
  - Kreisnamen bearbeiten.
  - Mitglieder eines Kreises per Checkbox hinzufügen oder entfernen.
- Zentrale Zugriffshilfen in `src/lib/access.ts` eingeführt:
  - `accessibleOwnerIds`
  - `ownerScope`
  - `isAccessibleOwner`
- Kreiszugriff für Weboberflaeche umgesetzt:
  - Dashboard
  - Spielsachen
  - Szenen
  - Lass uns spielen
  - Events/Termine
  - Sessions
  - Bilder
  - Dateiauslieferung
- Telegram-Ziele und Protokollkontext innerhalb des Kreises
- Neue Datensätze behalten weiterhin den Ersteller als `ownerId`, sind aber für Kreis-Mitglieder sichtbar und bearbeitbar.
- Admins können Kreise in der Benutzerverwaltung nachträglich umbenennen und die Mitgliedschaft zentral pflegen.
- Die Kreisverwaltung ist als aufklappbarer Bereich umgesetzt.
- Einzelne Kreise werden ebenfalls als Accordion dargestellt; bei mehreren Kreisen bleiben sie zunächst eingeklappt.

## Kompakte Listen für Spielsachen und Szenen

- Die Übersichten für Spielsachen und Szenen wurden von großen Kartenrastern auf kompakte Listen umgestellt.
- Jede Zeile zeigt Thumbnail, Titel und kurze Metadaten.
- Native `details/summary`-Elemente ermöglichen Ausklappen ohne zusätzliches JavaScript.
- Im ausgeklappten Bereich stehen Beschreibung und ein klarer Button zur Detailseite.
- Dadurch sind lange Kataloge auf Mobile und Desktop schneller scannbar.
- Nachbesserung: Der aufgeklappte Bereich enthält wieder ein großes Bild, Beschreibung, Slug, Zähler für Verknüpfungen und bei Szenen verknüpfte Spielsachen als Chips.

## Protokoll statt Nachrichten

- Der bisherige Hauptmenüpunkt `Nachrichten` wurde aus der Hauptnavigation entfernt.
- Unter `Einstellungen` gibt es jetzt den Punkt `Protokoll`, weiterhin unter der Route `/messages`.
- Die alte Nachricht-senden-Oberfläche wurde entfernt, damit der Bereich nicht mehr wie ein unfertiger Messenger wirkt.
- Neues Prisma-Modell `AuditLog` für App-Aktionen eingeführt.
- Neuer Helper `src/lib/audit.ts` schreibt Protokolleinträge fehlertolerant.
- Erste protokollierte Aktionen:
  - Login erfolgreich.
  - Login fehlgeschlagen.
  - Logout.
  - Session per Web angelegt.
  - Session aufgerufen.
  - Session bearbeitet.
  - Session gelöscht.
  - Session per API gestartet, automatisch geschlossen oder beendet.
  - Session-Bilder und Kommentare.
  - Telegram-Texte, Telegram-Bilder, gespeicherte Telegram-Bilder und Bot-Antworten.
- Die Protokollseite gruppiert Einträge nach Tag und Stunde mit aufklappbaren Bereichen.
- Es werden seitenweise nur 120 Audit-Einträge geladen; alte Telegram-/Nachrichten-Einträge werden nur auf der ersten Seite als Altprotokoll eingeblendet.
- Links führen, wo möglich, direkt zum betroffenen Datensatz oder zur Datei.
- Alte Telegram-HTML-Nachrichten werden im Protokoll mit erlaubten Tags wie `<b>`, `<i>`, `<code>` und Telegram-Links formatiert dargestellt statt als roher Klartext.

## Spielplan-Anfragen und Katalog-Reihenfolge

- `ActivityStatus` wurde um `REQUESTED` erweitert.
- In `Lass uns spielen` kann ein Spielplan jetzt den Status `angefragt` haben.
- Der Uhrzeit-Auswahler beim Neuanlegen nutzt Viertelstunden statt einzelner Minuten.
- Angefragte Spielpläne erscheinen in der Wochenansicht des Dashboards.
- Angefragte Spielpläne können im Dashboard und auf der Detailseite bestätigt werden; der Status wird dann `geplant`.
- Telegram-Kommandos erweitert:
  - `/activity_request Titel` legt eine Anfrage an.
  - `/activities` listet angefragte und geplante Spielpläne.
  - Angefragte Einträge enthalten klickbare Befehle wie `/activity_confirm_1`.
  - `/activity_confirm_1` bestätigt den entsprechenden angefragten Spielplan aus der aktuellen Liste.
- Der Telegram-Agent kann Aktivitäten jetzt auch als `REQUESTED` anlegen und den Status auf `REQUESTED`, `PLANNED`, `DONE` oder `DISCARDED` setzen.
- Spielzeuge und Szenen haben ein neues Feld `sortOrder`.
- Die Übersichten für Spielzeuge und Szenen können per Drag-and-drop sortiert werden.
- Neue API `/api/reorder` speichert die Reihenfolge für berechtigte Spielzeuge und Szenen.

## Dashboard-Reihenfolge

- Die Wochen-/Kalenderansicht `Gemeinsame Woche` wurde im Dashboard direkt unter den Header verschoben.
- Kennzahlen-Kacheln und letzte Sessions stehen darunter.
- Dadurch ist sofort sichtbar, was in den nächsten Tagen ansteht.

## Dashboard-Spielampel

- Auf dem Dashboard steht vor der Wochenansicht eine Spielampel für alle aktiven Mitglieder des eigenen Kreises.
- Jeder Benutzer sieht die Ampel der anderen, kann aber nur die eigene Ampel umschalten.
- Es gibt nur Rot und Grün:
  - Rot: gerade nicht.
  - Grün: voll Lust.
- Der Status wird in `UserSettings.playReady` gespeichert.
- `UserSettings.playReadyUpdatedAt` merkt den letzten Umschaltzeitpunkt.
- Jeder Ampelwechsel verschickt eine Telegram-Nachricht an aktive gespeicherte Chats im selben Kreis, sofern ein Bot-Token vorhanden ist.
- Die Telegram-Nachricht nutzt HTML-Markup, nennt Benutzer und den neuen Zustand mit passendem Rot-/Grün-Emoji.
- Wenn für denselben Telegram-Chat ein konkreter Thread aktiv ist, werden Push-Nachrichten an diesen Thread gesendet und nicht an den threadlosen Hauptgruppen-Eintrag.
- Telegram-Kanäle haben optionale Ziele: einzelner Benutzer oder ganzer Kreis.
- In den Telegram-Einstellungen können aktive Kanäle aufgeklappt, bearbeitet, gelöscht und einem Benutzer oder Kreis zugeordnet werden.
- Push-Nachrichten werden nur noch an Kanäle mit explizitem Ziel gesendet; unzugeordnete Kanäle empfangen keine Ampel-Pushes.
- Der Telegram-Webhook verarbeitet nur noch exakt aktivierte `Chat-ID + Thread-ID`-Kombinationen. Andere Threads, andere Gruppen und die Hauptgruppe werden still ignoriert und nicht als Pending gespeichert.
- Erkannte Pending-Threads können in den Telegram-Einstellungen gelöscht werden und zeigen die letzte erkannte Testnachricht inklusive Absender/Zeitpunkt.
- Bei erkannten Threads mit Thread-ID wird kein Button mehr angeboten, um den gesamten Chat zu aktivieren.
- Die manuelle Telegram-Chat-Anlage wurde entfernt; Kanäle werden nur noch über erkannte Testnachrichten übernommen.
- Aktive Kanäle zeigen im aufgeklappten Bereich ebenfalls die zuletzt erkannte Testnachricht.
- Telegram-Testnachricht-Einlesen fängt Telegram-/Browser-Fehler ab und zeigt statt technischer Exceptions eine verständliche Meldung.
- Gespeicherte Telegram- und OpenAI-Token zeigen in den Einstellungen die letzten sechs Zeichen an, damit der hinterlegte Schlüssel erkennbar ist.
- Beim Telegram-Token wird zusätzlich der aktive Bot-Name über Telegram `getMe` angezeigt, wenn der gespeicherte Token gültig ist.
- Der Speichern-Button für Zugangsdaten zeigt während der Server-Action `Speichert...` und danach eine sichtbare Erfolgsmeldung.

## Bilderseite als Bild-Feed

- Die Bilderseite wurde von einer informationslastigen Verwaltungsansicht auf einen bildzentrierten Feed umgestellt.
- Upload, Albumanlage und Filter sind kompakte, aufklappbare Werkzeuge unterhalb des Feeds.
- Bilder erscheinen als quadratische Kacheln im Instagram-ähnlichen Raster.
- Metadaten werden erst beim Hover/Fokus als Overlay angezeigt.
- Ein Klick auf ein Bild öffnet eine große Detailansicht mit Bild/Video, Metadaten, Dateiinfos, Öffnen- und Löschaktion.
- Neues Modell `MediaComment` ermöglicht Kommentare/Notizen direkt am Bild.
- Bilder können in der Detailansicht einem Album zugeordnet werden.
- Bilder können in der Detailansicht als Albumansichtbild festgelegt werden.
- Im Album-Werkzeug können mehrere Bilder per Thumbnail-Auswahl gleichzeitig einem Album hinzugefügt werden.
- Layout-Reihenfolge angepasst: Album-Cover stehen direkt über dem Bildraster, Upload/Albumverwaltung/Filter stehen darunter.
- Jedes Album zeigt ein Coverbild; falls kein Cover festgelegt ist, wird automatisch das erste Bild des Albums genutzt.

## Datenexport und Datenimport

- Neue Einstellungsseite `Daten` unter `/settings/data`.
- Export erzeugt ein ZIP-Archiv über `/api/settings/data-transfer`.
- Das Archiv enthält `data.json` mit Portal-Inhalten und einen `files/`-Ordner mit geschützten Upload-Dateien.
- Exportiert werden Spielsachen, Szenen, Aktivitäten, Sessions, Bilder, Alben, Bildkommentare, Termine, Check-ins und zugehörige Dateien, soweit sie für den angemeldeten Benutzer sichtbar sind.
- Nicht exportiert werden Passwörter, Login-Tokens, Telegram-Token und OpenAI-Keys.
- Import nimmt ein Fesselspiel-ZIP entgegen und fügt die Inhalte dem aktuell angemeldeten Benutzer hinzu.
- Beim Import werden neue Datei-IDs erzeugt, Datei-URLs neu verknüpft und Slugs automatisch eindeutig gemacht.
- Album-Cover werden beim Import auf die neu importierten Bilder gemappt.
- Bestehende Inhalte werden beim Import nicht gelöscht oder überschrieben.

## Externe API und Bearer Tokens

- Neues Datenmodell `ApiToken` für externe API-Zugriffe.
- Tokens werden nur einmalig im Klartext angezeigt; gespeichert wird ein HMAC-Hash und die letzten sechs Zeichen.
- Neue Einstellungsseite `API Tokens` unter `/settings/api`.
- Tokens können per `Authorization: Bearer <token>` oder für einfache Alexa-/Shortcut-Aufrufe per URL-Parameter `?token=<token>` verwendet werden.
- Erste externe Endpunkte:
  - `GET /api/external/status?token=...`
  - `GET|POST /api/external/sessions/start?token=...&note=...`
  - `GET|POST /api/external/sessions/stop?token=...&note=...`
  - `GET|POST /api/external/sessions/toggle?token=...`
  - `POST /api/external/media` mit `multipart/form-data`, Feld `file`
- Session-Endpunkte akzeptieren optionale ISO-Zeiten:
  - `startTime`
  - `endTime`
  - `moodBefore`
  - `moodAfter`
  - Notizfelder
- Externe Bilduploads werden als geschützte Dateien gespeichert und direkt als Bild angelegt.

## Telegram-Benutzer-Mapping

- Neues Datenmodell `TelegramUserMapping`.
- Neues Datenmodell `TelegramKnownUser` für automatisch erkannte Telegram-Absender.
- In den Telegram-Einstellungen können Telegram-Usernames wie `@name` einem App-Benutzer zugeordnet werden.
- Der Telegram-Webhook prüft pro Nachricht `message.from.username`.
- Wenn ein Mapping existiert, werden Befehle, Agentenaktionen, Dialoge und Bildspeicherungen aus Sicht dieses App-Benutzers ausgeführt.
- Ohne Mapping bleibt das bisherige Verhalten bestehen: Der Besitzer der Telegram-Einstellung ist der ausführende Benutzer.
- Aktive Telegram-Absender werden mit Telegram-ID, Username, Name und letzter Nachricht gespeichert.
- Erkannte Telegram-Benutzer können direkt in den Telegram-Einstellungen einem App-Benutzer zugeordnet werden.
- Das Mapping nutzt bevorzugt die Telegram-ID und fällt auf den Username zurück.
- Telegram-Hilfenachrichten bleiben im HTML-Modus formatiert, aber Slash-Befehle werden nicht mehr in `<code>` verpackt, damit Telegram sie wieder als Befehle antippen kann.
- Der manuelle Telegram-Sende-Endpunkt verwendet ebenfalls HTML-Markup und deaktivierte Link-Vorschauen.

## Session-Detailseiten

- Sessions haben einen optionalen sprechenden Slug, z.B. `session-2026-06-19-1542`.
- Bestehende Sessions erhalten beim Anzeigen automatisch einen Slug.
- Neue Detailroute `/sessions/[slug]` zeigt Start, Ende, Dauer, Stimmungen, Notizen, Bilder und Kommentare.
- Die alte Bearbeitungsroute wurde auf `/sessions/[slug]/edit` vereinheitlicht und findet Sessions per Slug oder ID.
- Session-Stimmungslabels enthalten Emojis; fehlende Werte zeigen `😐 neutral`.
- Session-Bilder werden als geschützte Bilder mit `sessionId` gespeichert.
- Einzelne Session-Bilder können kommentiert werden.
- Sessions selbst können kommentiert werden.
- Dashboard und Session-Historie verlinken direkt auf die neue Detailseite.
- Export/Import sichert und rekonstruiert Session-Kommentare sowie die Zuordnung von Bilder zu Sessions.
- Laufende Sessions ohne Endzeit werden auf Dashboard und Sessions-Seite sichtbar hervorgehoben.
- Externer API-Start einer Session beendet eine bereits offene Session automatisch und startet danach eine neue.

## KG Time Tracker und Demo-Seed

- Der Seed legt Demo-Spielzeuge, Demo-Szene und den Demo-Spielplan `Entspannungsabend` nur noch an, wenn `SEED_DEMO_DATA=true` gesetzt ist.
- Dadurch taucht der Demo-Spielplan nach Löschen und Neustart nicht mehr automatisch wieder auf.
- Der auf dem VPS vorhandene Demo-Spielplan `entspannungsabend` wurde einmalig gelöscht.
- Neues Prisma-Modell `KgSession` für KG-Tragezeiten.
- Unter `Sessions` gibt es zwei Reiter:
  - `Segufix Time Tracker`
  - `KG Time Tracker`
- Der KG Time Tracker erfasst Startzeit, Endzeit, Dauer und Notiz minutengenau.
- KG-Jahresübersicht nutzt Blau statt Rot, damit sie vom Segufix-Kalender unterscheidbar bleibt.
- Neue externe API-Endpunkte:
  - `/api/external/kg/start`
  - `/api/external/kg/stop`
- Der externe Status-Endpunkt gibt zusätzlich `openKgSession` zurück.
- Telegram-Kommandos erweitert:
  - `/kg` zeigt KG-Auswertung für das aktuelle Jahr.
  - `/kg_start Notiz` startet den KG Tracker und schließt einen offenen KG-Eintrag automatisch.
  - `/kg_stop Notiz` beendet den laufenden KG Tracker.
- Der Telegram-Agent kann den KG Tracker ebenfalls per freier Sprache starten und stoppen.
- Datenexport/-import enthält jetzt auch KG-Einträge.

## Profiltext und Profilbild

- Die sichtbaren Profilfelder wurden vereinfacht.
- Das Feld `Beschreibung` heißt jetzt `Profiltext`.
- Das bisher sichtbare JSON-Feld `Eigene Felder als JSON` wurde aus der Profiloberflaeche entfernt; vorhandene Werte bleiben in der Datenbank erhalten.
- `Profile.imageUrl` wurde als geschütztes Profilbild-Feld ergänzt.
- Profilbilder werden über den bestehenden geschützten Upload gespeichert und bei Ersatz/Entfernung aus dem Dateisystem gelöscht.
- Profilbilder erscheinen in Sidebar, Dashboard-Spielampel und Benutzerverwaltung.

## Session-Reiter und mobiler Kalender

- Die Umschaltung zwischen Segufix und KG Time Tracker ist jetzt als Registerkarten/Tabs gestaltet statt als lose Buttons.
- Die Jahreskalender verwenden auf Mobile kleinere Tagesfelder, ausgeblendete Tageszahlen und Monatsinitialen.
- Dadurch bleibt die Jahresübersicht auch auf schmalen Displays sichtbar, ohne die Seite horizontal zu sprengen.

## Zeitdarstellung

- Zentrale Datums- und Uhrzeitformatierung nutzt jetzt fest `Europe/Berlin`.
- `datetime-local`-Formularwerte werden ebenfalls für Berlin-Zeit vorbereitet.
- In der Admin-Benutzerverwaltung gibt es eine Systemzeit-Anzeige mit App-Zeitzone, Anzeigezeit und Server-UTC-Zeit.

## Feature-Video

- Ein kurzes peppiges Feature-Video wurde als MP4 erzeugt.
- Das Video erklärt Dashboard, Spielampel, Lass uns spielen, Spielsachen, Szenen, Bilder, Sessions und Telegram-Agent.
- Die Techno-Musik ist synthetisch erzeugt und nicht aus externen Musikquellen kopiert.
- Das Rendering erfolgte ausschliesslich in Docker/FFmpeg; auf dem Server wurde nichts installiert.
- Datei: `entfernt`
- Plattform-Link: `entfernt`

## Einstellungen, Protokoll und Bilderalben

- Profil- und Benutzerformulare nutzen `SubmitButton`, damit Buttons beim Absenden sichtbar auf "wird gespeichert" wechseln.
- Dashboard-Wochentage verlinken leere Tage und Kalender-Icons direkt auf `/activities/new?date=YYYY-MM-DD`.
- Die neue Spielplanung übernimmt dieses Datum automatisch.
- Benutzerverwaltung und Kreise sind als aufklappbare Bereiche umgesetzt.
- Beim Anlegen eines Benutzers ist E-Mail optional, wenn ein Benutzername gesetzt ist.
- Benutzername wird beim Verlassen des Feldes gegen `/api/users/check-username` geprüft.
- Passwortlänge wird nicht mehr clientseitig begrenzt.
- Benutzer können direkt beim Anlegen ein Profilbild hochladen.
- Das mobile Einstellungsmenü enthält am Ende einen Logout-Button.
- Die Systemzeit steht in der Admin-Benutzerverwaltung weiter unten und hat eine einfache Zeitkorrektur in Minuten (`UserSettings.timeOffsetMinutes`).
- Das Protokoll hat ein Suchfeld mit Live-Vorschlägen; Treffer springen direkt zum passenden Eintrag.
- Telegram-Protokolleinträge werden so zusammengeführt, dass empfangene Nachricht und Antwort nicht mehr wie getrennte Fremdeinträge wirken.
- Bilder ohne Album werden nicht mehr als eigenes Ziel angeboten.
- Für jeden Benutzer wird ein persönliches Hauptalbum angelegt.
- Der Albumname kommt aus dem Profil-Anzeigenamen, danach Name, Benutzername oder E-Mail.
- Alte Standardalben mit den Namen `Standard` oder `Eingang` werden automatisch in dieses persönliche Hauptalbum überführt.
- Neue Uploads aus Webformularen, Session-Detailseiten, Import, externer API und Telegram landen automatisch im persönlichen Hauptalbum, wenn kein Album gesetzt ist.
- Telegram-Bilduploads senden nach dem Speichern eine HTML-formatierte Albumauswahl mit anklickbaren `/media_album_...`-Kommandos.
- Telegram-Befehl `/album_new` startet einen Dialog zum Album-Anlegen, wenn kein Name angegeben ist; `/album_new Name` legt direkt ein privates Album an.

## Telegram-Aktionsregeln

- Neues Prisma-Modell `TelegramNotificationRule`.
- Admins können in den Telegram-Einstellungen aktionsbasierte Regeln anlegen.
- Das Aktions-Dropdown kombiniert bekannte Systemaktionen mit bereits im Protokoll vorhandenen Aktionen.
- Jede Regel besteht aus Aktion, Ziel-Benutzer oder Ziel-Kreis, HTML-Nachricht und Aktiv-Status.
- Nachrichten unterstützen Variablen: `{title}`, `{actor}`, `{event}`, `{action}`, `{url}`, `{details}`.
- `logAction` prüft nach dem Speichern eines Protokolleintrags passende Regeln und sendet Telegram-HTML an aktive Kanäle, die diesem Benutzer oder Kreis zugeordnet sind.
- Dadurch können z.B. Ampelwechsel, Spielanfragen, Telegram-Nachrichten, API-Sessions oder Logins gezielt an Benutzer oder Kreise gepusht werden.

## Bilder-Alben nachgeschärft

- In der Bild-Detailansicht kann direkt ein neues Album für das geöffnete Bild angelegt werden.
- Nach dem Anlegen bleibt die Detailansicht offen und das Bild wird sofort dem neuen Album zugeordnet.
- Der Album-Bereich ist in `Neues Album`, `Bilder verschieben` und `Alben verwalten` getrennt.
- Diese drei Album-Werkzeuge sind innerhalb des Album-Bereichs nochmals einzeln einklappbar, damit der Bereich übersichtlich bleibt.
- Album-Speichern nutzt den wiederverwendbaren `SubmitButton` mit Ladefeedback.
- Sichtbarkeit heißt jetzt in der UI `Nur ich`, `Zirkel`, `Alle`.
- Die Bilderseite respektiert diese Sichtbarkeit: eigene Bilder immer, Zirkel-Bilder nur mit `Zirkel`/`Alle`, globale Bilder mit `Alle`.
- Alben können gelöscht werden.
- Beim Löschen werden Bilder standardmäßig in das persönliche Hauptalbum verschoben.
- Optional können Bilder und Dateien bewusst mitgelöscht werden.
- Das persönliche Hauptalbum selbst kann nicht gelöscht werden.

## Navigation, Admin-Dateien und Demo-Seed

- Logout nutzt jetzt einen `303`-Redirect, damit POST-Logout im Browser sauber auf `/login` landet.
- Admins dürfen geschützte Dateien aktiver Benutzer sehen; dadurch erscheinen Profilbilder in Dashboard und Benutzerverwaltung auch außerhalb des eigenen Kreises.
- Das Dashboard zeigt für Admins ohne eigenen Kreis alle aktiven Benutzer in der Spielampel.
- Demo-Daten werden nicht mehr allein durch `SEED_DEMO_DATA=true` erneut angelegt; zusätzlich ist `SEED_ALLOW_DEMO_RECREATE=true` erforderlich.

## Umlaute, Tracker-Texte und Telegram-Regeln

- Sichtbare deutsche Texte in App und Dokumentation wurden von Umschreibungen wie `ae`, `oe`, `ue` auf echte Umlaute umgestellt. Slugs und technische ASCII-Erzeugung bleiben unverändert.
- Im Segufix Time Tracker wurden die drei Textfelder `Stimmung vorher Text`, `Stimmung nachher Text` und `Notizen` zu einem Feld `Sessionkommentar` zusammengeführt.
- Alte Inhalte aus den beiden Stimmungstext-Feldern werden in Detail- und Bearbeitungsansicht in den gemeinsamen Kommentar übernommen.
- Der KG Time Tracker nutzt statt `Notizen` das Feld `Sessionbeschreibung`.
- KG-Historieneinträge und markierte KG-Kalendertage verlinken auf die neue Detailroute `/sessions/kg/[id]`.
- KG-Einträge können über `/sessions/kg/[id]/edit` bearbeitet und gelöscht werden.
- Laufende KG-Einträge können aus Übersicht und Detailseite beendet werden.
- Segufix-Historienkarten verlinken zusätzlich über den Textbereich direkt auf die jeweilige Detailseite.
- Die Sortierung der Szenen ist nicht mehr prominent per Drag-and-drop sichtbar, sondern für Admins unten als eingeklappter Bereich mit Hoch-/Runter-Schaltern erreichbar.
- Unter Einstellungen wurde ein Dark-Mode-Toggle eingefügt, auch im mobilen Hamburger-Menü zwischen Protokoll und Abmelden.
- Telegram-Aktionsregeln senden jetzt auch dann, wenn eine Regel auf einen Kreis zielt, der aktive Telegram-Thread aber einem Mitglied dieses Kreises zugeordnet ist. Umgekehrt kann eine Benutzer-Regel auch den zugehörigen Kreis-Thread erreichen.
- Telegram-Kommandos wie `/activity_confirm_1` und `/media_album_...` werden in HTML-Nachrichten als normaler Text ausgegeben, nicht in `<code>`, damit Telegram sie antippbar erkennt.

## Profilbild-Referenzen

- Die Profilseite prüft gespeicherte Profilbild-URLs gegen vorhandene `FileAsset`-Datensätze.
- Verwaiste Bild-URLs werden nicht mehr weiter als aktuelles Profilbild übernommen.
- Auf dem VPS wurde eine verwaiste Profilbild-Referenz bereinigt, deren Datei-Datensatz nicht mehr existierte.

## Spielanfragen, laufende Sessions und Telegram-Regeltests

- Der Bestätigen-Knopf für angefragte Spielpläne erscheint nur noch bei anderen Mitgliedern im Zirkel, nicht beim Ersteller der Anfrage.
- Die Server Action zum Bestätigen blockiert ebenfalls Selbstbestätigungen.
- Laufende eigene Segufix-Sessions zeigen auf Dashboard, Session-Übersicht und Session-Detailseite einen Button `Session beenden`.
- `Session beenden` setzt die Endzeit auf den aktuellen Zeitpunkt, berechnet die Dauer neu und protokolliert `session_stopped`.
- Laufende Sessions zeigen als Titel die erste Zeile des Sessionkommentars oder `Segufix-Session`.
- Die Zielauswahl bei Telegram-Aktionsbenachrichtigungen zeigt nur noch die passende Auswahl für `Ein Benutzer` oder `Ganzer Kreis`; widersprüchliche Benutzer-/Kreis-Kombinationen sind im Formular nicht mehr auswählbar.
- Jede Telegram-Aktionsregel hat einen Button `Test senden`, der genau diese Regel mit Testdaten über dieselbe Versandlogik wie echte Protokollereignisse ausführt.

## Logout-Button

- Logout wird in der UI nicht mehr als reines HTML-Formular ausgelöst.
- Neuer Client-Button `LogoutButton` sendet `POST /api/auth/logout` per `fetch` mit Session-Credentials und navigiert danach aktiv nach `/login`.
- Das verhindert, dass der mobile Menüzustand den Formular-Submit vorzeitig unmountet.
- Das mobile Hamburger-Dropdown ist jetzt eine eigene Scrollfläche mit Viewport-Maximalhöhe, Touch-Scrolling und unterem Abstand, damit der Punkt `Abmelden` auch auf kleinen Displays erreichbar bleibt.

## Protokoll und Aktionsbenachrichtigungen

- Audit-Protokolleinträge enthalten in der Protokollansicht jetzt zusätzlich den internen `action`-Key.
- Jeder protokollierte Audit-Eintrag zeigt einen Link `Benachrichtigung`.
- Der Link führt zu `/settings/telegram?action=<action>#notifications`.

## KG-Bearbeitung, Telegram-Alben und Spielplanung

- KG-Tracker-Einträge haben eine Bearbeitungsroute `/sessions/kg/[id]/edit`.
- KG-Einträge können dort aktualisiert oder gelöscht werden.
- Laufende KG-Einträge können aus Übersicht und Detailseite beendet werden.
- Telegram-Befehl `/album_new` startet einen Dialog zum Album-Anlegen; `/album_new Name` legt direkt ein privates Album an.
- Telegram-Befehl `/toy_new` startet einen Dialog zum Spielzeug-Anlegen; `/toy_new Name` übernimmt den Namen direkt und fragt Beschreibung sowie Bild im Chat ab.
- In der Benutzerverwaltung ist die Systemzeit als einklappbarer Bereich umgesetzt.
- Admins können beim Bearbeiten eines Benutzers dessen Profilbild hochladen oder entfernen.
- `Lass uns spielen` zeigt oben einen großen zentralen Button `Neuen Spieltermin anlegen`.
- Darunter gibt es einen Self-Bondage-Auftrag mit Button `Self-Bondage-Auftrag erteilen`.
- Die Self-Bondage-Variante nutzt Auftrag-Wording, blendet URL-Slug und Kategorie aus und bietet keine Spielsachen an.
- Für Self-Bondage-Aufträge werden nur Szenen angeboten, die als `Self-Bondage-fähig` markiert sind.
- Self-Bondage-Aufträge können `Ohne Datum/Uhrzeit` gespeichert werden; dann gilt der Auftrag sofort beim Lesen und die Termin-Felder werden im Formular ausgeblendet.
- Self-Bondage-Aufträge nutzen eigene Statuswörter: `beauftragt`, `angenommen`, `umgesetzt`, `verworfen`.
- Self-Bondage-Aufträge verlangen genau eine Auftragsszene: eine `Self-Bondage-fähige` Szene, Freitext oder `Denk dir was aus`; ohne Auswahl wird nicht gespeichert.

## Bildzuschnitt beim Upload

- `FileUploadField` unterstützt für Bilduploads einen clientseitigen Zuschnitt per Canvas.
- Benutzer können Format, horizontalen Ausschnitt, vertikalen Ausschnitt und Zoom wählen.
- Profilbilder nutzen standardmäßig Quadrat-Zuschnitt.
- Spielzeug- und Szenenbilder nutzen standardmäßig ein Querformat.
- Der gewählte Ausschnitt wird beim Speichern automatisch übernommen; ein separater Bestätigen-Button ist nicht mehr nötig.
- Der automatische Zuschnitt nutzt synchrone Status-Refs, damit der direkt anschließende Formular-Submit nicht durch veralteten React-State als `Upload läuft noch` blockiert wird.
- Bilduploads bleiben unverändert, damit die Galerie Originalbilder und Videos behalten kann.
- Der Zuschnitt speichert PNG/WebP-Quellen als PNG, damit transparente Hintergründe nicht durch JPEG-Konvertierung verloren gehen.
- Bereits gespeicherte Bilder können im Bearbeiten-Dialog über `Aktuelles Bild neu zuschneiden` erneut geladen, zugeschnitten und ersetzt werden.
- Die Telegram-Einstellungsseite übernimmt diesen Query-Parameter und wählt die Aktion im Formular zum Anlegen einer Aktionsbenachrichtigung vor.
- Falls die Aktion noch nicht in den bekannten Aktionen enthalten ist, wird sie dynamisch in die Auswahlliste aufgenommen.

## Bilder-Vollbildansicht und Albenraster

- Die Album-Auswahl auf der Bilderseite ist kein horizontaler Scrollstreifen mehr.
- Alben werden als eigenes Raster angezeigt, mobil mit vier Spalten, damit sie sich vom dreispaltigen Bilderfeed unterscheiden.
- Ein Klick auf das Bild in der Bilddetailansicht öffnet eine Vollbildansicht.
- Die Vollbildansicht nutzt URL-State (`viewer=1`), zeigt oben ein `X` zurück zur Detailansicht und links/rechts Pfeile zum vorherigen oder nächsten Bild.
- Die mobile Bilddetailansicht gewichtet das Bild stärker: Der Bildbereich belegt etwa zwei Drittel der Viewport-Höhe, die Detail- und Aktionsbereiche scrollen darunter.

## Telegram-Threads für Aktionsbenachrichtigungen

- Erkannte Telegram-Threads zeigen neben Chat-ID und Thread-ID jetzt auch einen Thread-Namen an.
- Aktionsbenachrichtigungen können optional auf einen konkreten aktiven Ausgabe-Thread gelegt werden.
- Ist ein Ausgabe-Thread gesetzt, wird die Nachricht genau in diesen Chat/Thread gesendet.
- Ohne Ausgabe-Thread bleibt die bisherige automatische Zustellung über Benutzer- oder Kreis-Zuordnung aktiv.
- Die Variablen der Telegram-Nachricht sind als klickbare Chips umgesetzt und werden an der aktuellen Cursorposition in die Nachricht eingefügt.
- Die aktiven Telegram-Kanäle verwenden die Überschrift `Aktive Kanäle` und zeigen fehlende Thread-Namen klar als `Thread-Name fehlt` statt nur als ID an.
- Der Self-Bondage-Auftrag auf `Lass uns spielen` nutzt denselben zentrierten Aufbau wie `Spieltermin planen`.

## Ideensammlung

- `Lass uns spielen` hat eine dritte große Rubrik `Ideensammlung` mit Button `Idee festhalten`.
- Ideen werden als `ActivityPlan` mit Kategorie `IDEA_COLLECTION` gespeichert und ohne Datum/Uhrzeit geführt.
- Für Ideen gibt es eigenes Status-Wording: `vorgeschlagen`, `auf der Liste`, `ausprobiert`, `verworfen`.
- Die Ideendetailseite erlaubt mehrere geschützte Bild-Uploads, die als eigene `ActivityImage`-Anhänge direkt an der Idee hängen.
- Neue Ideenbilder werden nicht mehr als normale `Media`-Einträge angelegt und haben keine Albumlogik.
- Alte Zwischenlösungs-Einträge über `Media.activityId` bleiben als Legacy-Fallback sichtbar und löschbar.
- Das Dashboard zeigt eine kompakte Ideensammlungs-Box mit den neuesten offenen Ideen.

## Umbenennung Bilder

- Die sichtbare Navigation und Seitentexte nennen die Galerie jetzt `Bilder`.
- Telegram-Rückmeldungen, Dashboard-Kacheln, Datenexport-Hinweise und Dokumentation verwenden ebenfalls die Bezeichnung `Bilder`.
- Technische Pfade und interne Modellnamen wie `/media` und `Media` bleiben stabil, damit vorhandene Links, API-Endpunkte und Datenbanktabellen kompatibel bleiben.

## Spielzeug-Szenen-Verknüpfung

- Beim Anlegen und Bearbeiten von Spielsachen können vorhandene Szenen per Checkbox verknüpft werden.
- Die Auswahl nutzt denselben Benutzer-/Zirkel-Scope wie die restlichen Spielzeug- und Szenenansichten.
- Die Spielzeug-Detailseite zeigt die Verknüpfungen weiterhin direkt im Bereich `Verknüpfungen`.

## Startseite und Benutzeransicht

- Der Hauptmenüpunkt `Dashboard` heißt sichtbar jetzt `Start`.
- Der Hauptmenüpunkt `Lass uns spielen` wurde aus der Navigation entfernt; die drei zentralen Aktionen `Spieltermin planen`, `Self-Bondage-Auftrag` und `Ideensammlung` stehen direkt auf `Start` unter der Spielampel.
- Die Schnellzugriffe auf `Spiel`, `Szenen` und `Spielsachen` sind auf der Startseite optisch von den weiteren Kacheln getrennt.
- Im mobilen Kopfbereich steht neben dem Hamburger-Menü ein kompakter Dark-Mode-Schalter.
- Normale Benutzer sehen in den Einstellungen nur `Profil`; `Benutzer`, `Telegram`, `Daten`, `API Tokens` und `Protokoll` sind nur in der Admin-Ansicht sichtbar.
- Die direkten Seiten und Server-Actions für diese Admin-Bereiche prüfen die Rolle ebenfalls und leiten Nicht-Admins zurück zur Startseite.

## Umbenennung Szenen

- Die sichtbare Bezeichnung `Stellung`/`Stellungen` wurde fachlich auf `Szene`/`Szenen` umgestellt.
- Technische Routen und Datenmodelle wie `/positions` und `Position` bleiben stabil, damit bestehende Links und Daten nicht brechen.
- Telegram-Dialoge verstehen weiterhin alte Begriffe wie `Stellung` und zusätzlich `Szene`.
- Self-Bondage-Notizen lesen alte `Stellung:`-Einträge weiter, speichern neue Angaben aber als `Szene:`.

## Spielzeugliste und Menütrennung

- Die Spielzeugliste zeigt in der eingeklappten Zeile nicht mehr den URL-Slug, sondern wie die Szenenliste graue Verknüpfungszahlen.
- Der URL-Slug wurde auch aus den Detail-Badges der Spielzeugliste entfernt; Detailseite und permanente URL bleiben auf der Spielzeugdetailseite.
- Desktop- und Mobile-Menü sind optisch getrennt: `Start`, dann `Szenen`/`Spielsachen`/`Sessions`, dann `Bilder`, dann `Einstellungen`.

## Domainwechsel auf playplaner.com

- `playplaner.com` ist die neue primäre Systemdomain für sichtbare Domaintexte, `APP_URL`, Telegram-Links und neu erzeugte permanente URLs.
- `play.fesselspiel.com` bleibt als zweite echte Nginx-Domain ohne Weiterleitung auf dieselbe Docker-App aktiv.
- Bestehende Slugs und Pfade bleiben unverändert; nur die bevorzugte Basisdomain für neue Links wechselt.
- Logout nutzt den aktuellen Request-Host, damit beide Domains unabhängig sauber funktionieren.

## Startseite ohne Erreichbar-Kacheln

- Der Schnellzugriffsbereich mit den Kacheln `Spiel`, `Szenen`, `Spielsachen`, `Sessions/Jahr`, `Bilder` und `Protokoll` wurde von der Startseite entfernt.
- Die Startseite fokussiert damit auf Spielampel, zentrale Spiel-Aktionen, Ideensammlung, Wochenkalender und letzte Sessions.

## Öffentliche Startseite statt Login-Karte

- Die Seite `/login` ist jetzt eine öffentliche Startseite mit Hero-Bereich, Funktionsübersicht, Ablaufsektion und Login-Panel.
- Der bestehende Login-Flow bleibt unverändert; geschützte Seiten leiten weiterhin auf `/login`, dort ist der Login nun in die Startseite eingebettet.
- Die öffentliche Startseite nutzt `playplaner.com` als sichtbare Hauptdomain.

## Postfix und E-Mail-Templates

- Docker Compose enthält einen eigenen Postfix-Service `postfix`, den die App intern über SMTP nutzt.
- Es gibt eine neue Admin-Seite `E-Mail` unter Einstellungen mit Systemschalter, Absender, SMTP-Daten, Templates, Testmail und Versandprotokoll.
- E-Mail-Templates sind kontrolliert abschaltbar; zusätzlich gibt es einen globalen Schalter für das komplette E-Mail-System.
- Die Benutzeranlage kann die Vorlage `Neues Benutzerkonto` senden, Login-Ereignisse können optional die Vorlage `Login-Benachrichtigung` senden.
- Alle Versandversuche werden als `EmailLog` protokolliert.
- Die Testmail kann eine beliebige gespeicherte Vorlage auswählen; der Empfänger ist standardmäßig die E-Mail des aktuellen Admins.
- Template-Texte nutzen anklickbare Variablen-Chips wie die Telegram-Vorlagen. Unterstützt werden u. a. `{{confirmUrl}}`, `{{resetUrl}}` und Audit-Variablen wie `{{title}}`, `{{actor}}`, `{{event}}`, `{{url}}`.
- Die E-Mail-Seite ist in aufklappbare Bereiche gegliedert: Postfix/Absender, Testmail, Aktions-E-Mails, Templates und Versandprotokoll.
- Aktions-E-Mails spiegeln die Telegram-Aktionsbenachrichtigungen: Admins wählen eine protokollierte Aktion, Zielbenutzer oder Kreis und eine E-Mail-Vorlage. Beim `logAction` werden passende Regeln automatisch ausgelöst.
- Das Protokoll verlinkt pro Aktion nun getrennt zu Telegram- und E-Mail-Regeln mit vorausgewählter Aktion.
- Die Protokollsuche springt beim Anklicken eines Treffers direkt zum Eintrag, klappt geschlossene Tages-/Stundenbereiche automatisch auf und markiert den Treffer kurz. Direkte `#entry-...`-Links verhalten sich beim Laden genauso.
- Benutzer mit echter E-Mail-Adresse erhalten beim Anlegen einen Bestätigungslink über die Vorlage `Benutzerkonto bestätigen`; auf `/email/confirm` setzen sie ihr Passwort und bestätigen die Adresse.
- Benutzer können ihre E-Mail-Adresse im Profil ändern; Admins können sie in der Benutzerverwaltung ändern. Jede neue echte Adresse wird als unbestätigt gespeichert und bekommt einen neuen Bestätigungslink.
- Bestätigungslinks sind an die konkrete E-Mail-Adresse gebunden, damit alte Links keine später erneut geänderte Adresse bestätigen können.
- Passwort-Reset ist über `/password/forgot` und `/password/reset` vorhanden und verwendet die Vorlage `Passwort zurücksetzen`.

## Telegram Chatname und Threadname

- Telegram-Kanäle speichern Chatname und Threadname getrennt als `chatTitle` und `threadTitle`.
- Der alte `title`-Wert bleibt als Legacy-Feld erhalten, wird aber nicht mehr als Threadname verwendet, wenn er dem Chatnamen entspricht.
- Die Adminseite zeigt bei aktiven Kanälen jetzt Threadname, Chatname, Chat-ID und Thread-ID getrennt an.
- Ausgabe-Thread-Dropdowns verwenden eindeutige Labels mit Threadname und Chatname.
- Der Telegram-Webhook verarbeitet Bilder und Texte jetzt auch aus `channel_post`-Updates, nicht nur aus normalen `message`-Updates.

## Seiten, Features und Tracker-Core

- Es gibt jetzt einen `Tenant`-Core für getrennte Seiten mit Domain-Mapping über `TenantDomain`; `playplaner.com` und `play.fesselspiel.com` werden beim Seed als Alias-Domains auf die Default-Seite `Playplaner` gelegt.
- Die Session kann neben einer Benutzeransicht auch eine Seitenansicht tragen. `SUPER_ADMIN` wurde als globale Betreiberrolle ergänzt und die Seite `Ansicht wechseln` kann Seiten und Benutzeransichten öffnen.
- Pro Seite gibt es Feature-Schalter (`TenantFeature`) und eine Einstellungsseite `Seite`, über die Admins Name, Beschreibung, Sperrseite und Feature-Sichtbarkeit pflegen können.
- Superadmins verwalten unter `Einstellungen > Seiten` neue Seiten, Domains, Hauptdomains, Status, Sperrseiten und Features. Die Hauptseite `playplaner` ist vor Löschen/Deaktivieren geschützt; leere Zusatzseiten können gelöscht werden, Seiten mit Daten werden deaktiviert.
- Navigation und Mobile-Menü lesen die aktiven Features der Seite und blenden deaktivierte Hauptmodule aus, ohne Daten zu löschen.
- Direkte URLs zu deaktivierten Features landen auf einer freundlich formulierten, pro Seite konfigurierbaren Sperrseite. Server-Actions und externe API-Endpunkte prüfen die Features zusätzlich, damit bekannte Direktlinks nicht weiter Daten ändern.
- Abhängigkeiten werden berücksichtigt: Self-Bondage hängt an Szenen, Tracker-Untertypen hängen am Tracker-Core. Wenn Spielsachen deaktiviert sind, werden Verknüpfungen aus Szenen/Spielplanung ausgeblendet statt weiter auf gesperrte Detailseiten zu zeigen.
- Unterfeatures respektieren zusätzlich ihren eigenen Schalter: `selfBondage` ist nur sichtbar, wenn Self-Bondage und Szenen aktiv sind; `tracker.segufix`, `tracker.kg` und dynamische `tracker.*` sind nur sichtbar, wenn sowohl der Tracker-Core als auch der jeweilige Untertracker aktiv sind.
- Die Feature-Prüfung nutzt bei gewechselten Seitenansichten die effektive Seite aus der Session. Dadurch bleiben z. B. KG/Segufix in der Seite `rope` ausgeblendet, obwohl sie auf der Hauptseite aktiv sind.
- Der normale Menüpunkt `Sessions` wird nur angezeigt, wenn mindestens ein konkreter `tracker.*` auf der aktuellen Seite aktiv ist. Ein aktiver Tracker-Core ohne aktive Untertracker bleibt damit für Admin-Konfiguration verfügbar, führt aber nicht mehr auf eine funktionslose Sessions-Seite.
- In der Seitenverwaltung bleibt die Liste `Vorhandene Seiten` offen, einzelne Seiten starten aber zugeklappt. Auf-/Zuklappen wird dort mit einem drehenden Pfeilsymbol statt Text angezeigt.
- Segufix und KG wurden zusätzlich in einen generischen Tracker-Core gespiegelt: `TrackerType` definiert Tracker-Arten, `TrackerEntry` speichert gemeinsame Start-/End-/Dauer-/Notizdaten und JSON-Feldwerte.
- Der Seed migriert bestehende Segufix- und KG-Einträge idempotent in `TrackerEntry`, behält die alten Tabellen aber für Kompatibilität weiter bei.
- Neue generische API-Endpunkte `/api/external/trackers/[trackerKey]/start` und `/api/external/trackers/[trackerKey]/stop` erlauben externe Tracker-Starts/-Stops für beliebige aktivierte Tracker-Typen.
- Eine generische Detailseite `/trackers/[trackerKey]/[slug]` zeigt migrierte und neue Tracker-Einträge an.
- Admins können unter `Einstellungen > Tracker` Tracker-Typen pro Seite anlegen, bearbeiten, farblich markieren und für die Seite sichtbar oder unsichtbar schalten.
- Die Startseite blendet Spielplanung, Ideensammlung, Self-Bondage und letzte Segufix-Sessions abhängig von den aktiven Features aus, statt nur die Zielseiten zu sperren.
- Die Sessions-Seite zeigt KG und Segufix nur noch, wenn die jeweiligen Untertracker aktiv sind. Sind beide Legacy-Tracker ausgeschaltet, werden stattdessen aktivierte generische Tracker angezeigt.

## Shopify Bondage-System

- Es gibt das eigene Feature `shopifyBondageSystem` mit Menüpunkt `Bondage-System`, eigener Übersicht `/bondage-system` und Detailseiten `/bondage-system/[slug]`.
- Shopify-Produkte werden nicht in den privaten Spielzeugkatalog kopiert, sondern in `ShopifyProduct` gespiegelt und über `BondageSystemItem` einzeln sichtbar geschaltet.
- Die Adminseite `Einstellungen > Shopify` speichert Shop-Domain, Shopify Admin API-Version, verschlüsselte Shopify Client ID, verschlüsseltes Client Secret und Produkt-Tag-Filter. Ein manueller Sync erzeugt bei Bedarf automatisch einen kurzlebigen Shopify Access Token per Client-Credentials-Flow, cached ihn bis kurz vor Ablauf und liest Produkte per Shopify Admin GraphQL API ein.
- Die Admin API-Version ist pro Seite editierbar; Standard ist `2026-04`.
- Wenn Shopify beim Produktabruf `Access denied for products field` meldet, verwirft der Sync den gecachten Token und versucht den Abruf einmal mit einem frisch erzeugten Token erneut. Das hilft, wenn Scopes in Shopify gerade erst geändert oder neu bestätigt wurden.
- Die Shopify-Adminseite hat zusätzlich den Button `Shopify-Token erneuern`, der den Token sofort per Client Credentials neu erzeugt und Ablaufzeit/Scopes aktualisiert, ohne einen Produkt-Sync starten zu müssen.
- Importierte Shopify-Produkte können in der Adminliste gesammelt mit `Alle anzeigen` oder `Alle verbergen` freigeschaltet werden.
- Die Shopify-Adminliste speichert Produkt-Sichtbarkeit, externe Links und Zielgruppen gesammelt mit einem gemeinsamen Button `Alle Änderungen speichern`.
- Shopify-Beschreibungen werden mit `descriptionHtml` synchronisiert und auf der Detailseite mit bereinigter HTML-Formatierung dargestellt.
- Die öffentliche Bondage-System-Übersicht nutzt dieselbe kompakte, aufklappbare Katalogdarstellung wie Spielsachen und unterstützt für Admins eine eingeklappte Reihenfolge-Bearbeitung.
- Für den Client-Credentials-Flow wird keine OAuth-Callback-URL aktiv genutzt. Falls Shopify im Dev Dashboard eine URL verlangt, kann `https://playplaner.com/settings/shopify` eingetragen werden.
- Sichtbarkeit pro freigegebenem Produkt unterstützt Benutzer, Zirkel und alle Benutzer der aktuellen Seite.
- Szenen und Spielpläne können Bondage-System-Produkte getrennt von normalen Spielsachen verknüpfen.
- `POST /api/shopify/sync` ist als JSON-Sync-Endpunkt vorhanden und blockiert bei deaktiviertem Feature mit `feature_disabled`.
