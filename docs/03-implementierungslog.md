# Implementierungslog

Dieses Log fasst zusammen, was bisher im Projekt gebaut wurde. Neue Aenderungen sollen hier nachgetragen werden.

## Initiale App

- Next.js 14 App Router Projekt erstellt.
- Prisma und PostgreSQL angebunden.
- Dockerfile und Docker Compose eingerichtet.
- Traefik-Labels fuer `play.fesselspiel.com` vorbereitet.
- Admin-Seed ueber Environment-Variablen.
- Grundlayout mit Sidebar, Mobile Header, Panels, Buttons und Formfeldern.

## Auth und Benutzer

- Login-API unter `/api/auth/login`.
- Logout-API unter `/api/auth/logout`.
- Cookie/JWT-basierte Session.
- Admin/User-Rollen.
- Benutzerverwaltung unter `/settings/users`.
- Profilseite unter `/profile`.

## Domain-Korrektur

- Domain von `play.festspiel.com` auf `play.fesselspiel.com` geaendert.
- Docker Compose, App-URL, Traefik-Router und UI-Texte angepasst.

## Deployment auf VPS

- Deployment nach `/opt/<app-name>`.
- App-Container `kink_social_app`.
- PostgreSQL-Container `kink_social_postgres`.
- App gebunden auf `127.0.0.1:8097`.
- Build/Restart per `docker compose build app && docker compose up -d app`.
- Runtime-Logs nach `/opt/<app-name>/runtime-logs/startup.log`.

## Login UX

- Passwortfeld mit Auge/Toggle ergaenzt, damit Eingaben sichtbar gemacht werden koennen.

## Telegram

- Telegram-Einstellungen fuer Bot-Token und OpenAI-Key.
- Werte werden verschluesselt gespeichert.
- Chat- und Thread-Erkennung.
- Button/Reload-Logik zum Einlesen von Updates.
- Webhook setzen und loeschen.
- Bot-Kommandos und spaeter Agentenlogik.
- Agent beantwortet freie Nachrichten ueber OpenAI.
- Agent kann Aktionen im Portal ausfuehren.
- Kurzzeitgedaechtnis ueber die letzten ca. 10 Nachrichten.
- Dialogsystem fuer Item-Anlage.
- Dialog fragt benoetigte Felder ab und legt erst danach den Datensatz an.
- Dialoge fuer Spielzeug und Stellung.
- Telegram-Bilder koennen in laufenden Dialogen als Bild fuer das Item verwendet werden.
- Freie Telegram-Bilder werden automatisch als Medium gespeichert.
- Unbekannte Telegram-Chats oder Threads werden nur als `PENDING` in der App gespeichert.
- Der Bot schreibt beim reinen Erkennen eines Chats keine automatische Nachricht mehr in Telegram.
- Telegram-Webhook akzeptiert eine chatweite Freigabe: Wenn ein `ACTIVE`-Eintrag ohne Thread-ID existiert, werden Nachrichten und Bilder aus allen Threads dieses Chats verarbeitet.
- Telegram-Einstellungen zeigen erkannte `PENDING`-Chats separat an und koennen sie entweder threadgenau oder fuer den ganzen Chat aktivieren.

## Theme Changer

- `UserSettings.theme` im Prisma-Schema.
- Theme-Picker in Benutzereinstellungen/Profileinstellungen.
- Sofortige Theme-Vorschau beim Anklicken, nicht erst nach Speichern.
- Themes: Rot, Pink, Hellblau, Gelb, Orange, Violett, Gruen/Emerald, Mono.
- CSS-Variablen fuer Canvas, Surface, Paper, Line, Ink, Graphite, Redbrand und Hover.
- Hintergrundfarbe passt jetzt zum jeweiligen Farbschema.
- `UserSettings.darkMode` speichert zusaetzlich den persoenlichen Hell-/Dunkelmodus.
- Der Theme-Picker hat einen iPhone-artigen Toggle-Schalter fuer Dark Mode statt Checkbox.
- Dark Mode wird sofort als Vorschau angewendet und pro Benutzer gespeichert.
- Alle vorhandenen Farbschemas haben eine dunkle Variante mit schwarzem Hintergrund, dunklen Flaechen und angepasster Akzentfarbe.

## Geschuetzte Uploads

- `FileAsset` Modell.
- `src/lib/files.ts` fuer Speichern, URL-Erzeugung, ID-Erkennung und Loeschen.
- Dateien werden benutzerbezogen unter `UPLOAD_PATH/<ownerId>/...` gespeichert.
- Keine absoluten Pfade in der UI.
- Keine direkte statische Auslieferung aus dem Dateisystem.
- Zugriff ueber `/api/files/[id]` mit Login- und Owner-Pruefung.
- Bilder und Dateien koennen hochgeladen werden.
- Beim Loeschen von Medien oder Nachrichten wird die Datei physisch entfernt.

## Medienseite

- Medienseite optisch ausgebaut.
- Galerie-Ansicht mit Bild-/Video-Karten.
- Spotlight fuer neueste Medien.
- Album-Gruppierung.
- Metadaten wie Dateiname, MIME-Type, Groesse und Erstellungsdatum.
- Upload-Formular.
- Album-Formular.
- Loeschaktion je Medium.

## Mobile Navigation

- Mobile Navigation vom horizontalen Icon/Text-Menue zu Hamburger-Menue umgebaut.
- Hamburger oben rechts.
- Dropdown klappt nach unten auf und schwebt ueber dem Inhalt.
- Menue schliesst nach Klick auf einen Eintrag.
- Danach optisch korrigiert: geschlossene Liste ohne Luecken zwischen den Menuepunkten.

## Bearbeiten und Loeschen

Ergaenzt fuer:

- Spielzeuge
- Stellungen
- Aktivitaeten
- Events
- Sessions

Details:

- Spielzeug bearbeiten unter `/toys/[slug]/edit`.
- Spielzeug loeschen inklusive Bilddatei.
- Stellung bearbeiten unter `/positions/[slug]/edit`.
- Stellung loeschen inklusive Bilddatei.
- Aktivitaet bearbeiten unter `/activities/[slug]/edit`.
- Aktivitaet loeschen inklusive Verknuepfungen.
- Event bearbeiten unter `/events/[id]/edit`.
- Event loeschen inklusive Check-ins.
- Session bearbeiten unter `/sessions/[id]/edit`.
- Session loeschen aus Kalender, Historie und Auswertung.
- Slugs koennen beim Bearbeiten geaendert werden.
- `uniqueSlugForUpdate` erlaubt den eigenen bestehenden Slug und verhindert Konflikte.
- Datums-/Zeitfelder nutzen `formatDateTimeLocal` fuer `datetime-local`.

## Dokumentation

- Wiederverwendbare Markdown-Dokumentation unter `docs/` angelegt.
- Projektueberblick, Deployment, Implementierungslog, Architektur und Prompt-Historie dokumentiert.
- Regel festgelegt: Bei weiteren Aenderungen die Docs mitpflegen.

## Telegram-HTML-Ausgaben

- Telegram-Sendefunktion um `parse_mode: HTML` erweitert.
- Fallback eingebaut: Wenn Telegram HTML nicht akzeptiert, wird dieselbe Nachricht ohne Parse-Mode gesendet.
- HTML-Escape-Helper fuer sichere Telegram-Ausgabe ergaenzt.
- Slash-Command-Listen `/toys`, `/positions`, `/activities`, `/sessions`, `/status`, `/id` mit fetten Ueberschriften, nummerierten Eintraegen und klickbaren Links formatiert.
- Agent-Tool-Ergebnisse fuer Portalstatus und Suche werden direkt als Telegram-HTML formatiert.
- Dialog-Ergebnisse fuer neu angelegte Spielzeuge/Stellungen nutzen klickbare Links.

## Spielzeug-Detailheader

- Der rote runde Badge `Permanente URL` auf der Spielzeug-Detailseite wurde durch eine dezente eckige URL-Info ersetzt.
- Dadurch bleibt `Bearbeiten` die einzige primaere Aktion im Header und die URL-Kennzeichnung wirkt nicht mehr wie ein zusammenhangloser Button.

## Kurzanleitungen pro Seite

- Wiederverwendbare Komponente `PageGuide` in `src/components/ui.tsx` ergaenzt.
- Auf allen App-Seiten mit `PageHeader` kurze Beschreibungen eingefuegt: Zweck der Seite, was man dort tun kann und wie der Benutzer vorgeht.
- Login-Seite um einen kurzen Hinweis zur Anmeldung und zum Passwort-Auge ergaenzt.
- Texte bewusst kompakt gehalten, damit sie Orientierung geben ohne die Arbeitsoberflaeche zu ueberladen.
- PageGuide wurde spaeter von einer prominenten Box unter der Ueberschrift zu einer eingeklappten Info-Schaltflaeche unten rechts umgebaut.
- Die Hilfe ist damit ausserhalb des Hauptsichtfelds, aber bei Bedarf per Klick aufklappbar.
- PageGuide wurde danach aus dem schwebenden `fixed` Overlay entfernt.
- Die Hilfe ist jetzt ein normales, dezentes Element am Seitenende rechts und liegt nicht mehr ueber dem Inhalt.
- Auf der Medienseite wurde der erklaerende Header-Subtitle entfernt; die Formulierung steht jetzt als Titel in der unteren Info-Box.
- Rein erklaerende Header-Untertitel wurden auf allen Uebersichts-, Neu-, Bearbeiten- und Einstellungsseiten entfernt. Die Erklaerungen stehen jetzt als Titel/Inhalt in der unteren `PageGuide`-Info-Box.
- Funktionale Detailseiten-Anzeigen wie Slug, Pfad oder kopierbare URL bleiben im Header sichtbar.

## Detailseiten-Aktionen

- Bearbeiten-Aktionen auf Detailseiten fuer Spielzeuge, Stellungen und Aktivitaeten aus dem Header entfernt.
- Bearbeiten liegt jetzt in einem Aktionsbereich am unteren Ende der Detailseite.
- Der Header bleibt dadurch ruhiger und zeigt primaer Titel, URL/Status und Inhalt.
- Auf Aktivitaets-Detailseiten kopiert ein Klick auf den sichtbaren Pfad im Header die komplette HTTPS-URL in die Zwischenablage, ohne die Anzeige zu veraendern.

## Upload-UX und iPhone-Bilder

- Next.js Server-Action Body-Limit auf `50mb` angehoben, damit iPhone-Fotos und groessere Uploads nicht still an der Standardgrenze scheitern.
- Wiederverwendbare Komponente `FileUploadField` eingefuehrt.
- Datei-Auswahl zeigt jetzt sichtbaren Auswahlbereich, Dateiname, Groesse und bei Bildern eine Vorschau.
- Beim Bearbeiten von Spielzeugen und Stellungen wird das aktuelle Bild angezeigt; ein neu ausgewaehltes Bild ersetzt es automatisch.
- Die Checkbox zum Entfernen erscheint nur, wenn kein neues Bild gewaehlt wurde. Sie setzt den Eintrag wieder auf das System-Standardbild.
- Datei-Uploads in Spielzeugen, Stellungen, Medien und Nachrichten verwenden die neue Komponente.
- Fuer Spielzeug- und Stellungsbilder wurde ein direkter Upload-Endpunkt `/api/uploads` ergaenzt.
- Bei Bildauswahl wird die Datei sofort hochgeladen; der Speichern-Button speichert danach nur noch die fertige `/api/files/...` Referenz.
- Solange der direkte Upload noch laeuft oder fehlgeschlagen ist, verhindert die Komponente das Absenden und zeigt einen Hinweis.
- Der oeffentliche Upload scheiterte zusaetzlich an Nginx mit `413 Request Entity Too Large`, weil fuer `play.fesselspiel.com` kein `client_max_body_size` gesetzt war.
- Nginx-Site `play.fesselspiel.com` auf `client_max_body_size 50m` gesetzt, Konfiguration getestet und Nginx neu geladen.

## Dashboard-Wochenansicht

- Die Liste `Naechste Aktivitaeten` auf dem Dashboard wurde durch `Gemeinsame Woche` ersetzt.
- Angezeigt werden heute plus die naechsten sechs Tage.
- Geplante Aktivitaeten und Events werden zusammen als klickbare Eintraege je Tag dargestellt.
- Tage mit Eintraegen erhalten eine rote Akzentmarkierung, leere Tage bleiben neutral.
- Der Bereich hat einen direkten Button zum Planen neuer Aktivitaeten.

## Seitentitel als Dashboard-Link

- Die wiederverwendbare Komponente `PageHeader` verlinkt den sichtbaren Seitentitel jetzt auf `/`.
- Dadurch fuehrt ein Klick auf Seitentitel wie `Spielzeuge`, `Medien`, `Events` oder Detailtitel direkt zurueck zum Dashboard.
- Der Link hat einen dezenten roten Hover-Zustand und einen sichtbaren Fokusrahmen fuer Tastaturbedienung.

## Navigation: Lass uns spielen

- Der Hauptmenuepunkt `Aktivitaeten` heisst jetzt `Lass uns spielen`.
- Die Menue-Reihenfolge wurde angepasst: Dashboard, Lass uns spielen, Stellungen, Spielsachen.
- Der separate Menuepunkt `Events` wurde aus Desktop- und Mobile-Navigation entfernt, damit Termine nicht als doppeltes Hauptmodul neben der Spielplanung wirken.
- Bestehende Event-Daten werden nicht geloescht; Termine aus Events erscheinen weiterhin in der Dashboard-Wochenansicht als `Termin`.
- Die Aktivitaetsuebersicht, Neu-Anlage, Detailseite und Bearbeitung wurden in der sichtbaren Sprache auf `Lass uns spielen`, `Spielidee`, `Spielplan` und `Spielsachen` umgestellt.
- Die Dashboard-Kachel `Events` wurde entfernt; stattdessen gibt es Kacheln fuer `Lass uns spielen`, `Stellungen` und `Spielsachen`.

## Navigation: Einstellungen gebuendelt

- Die Hauptnavigation wurde weiter verschlankt.
- `Profil`, `Benutzer` und `Telegram` sind nicht mehr eigene Hauptpunkte.
- Stattdessen gibt es den Hauptpunkt `Einstellungen` mit den Unterpunkten `Profil`, `Benutzer` und `Telegram`.
- Die Buendelung wurde fuer Desktop-Sidebar und mobiles Hamburger-Menue umgesetzt.

## Spielzeug-URL-Anzeige reduziert

- Auf Spielzeug-Detailseiten wird oben die URL ohne `https://` angezeigt.
- Die Kennzeichnung `Permanente URL` wurde aus dem Header entfernt.
- Am Seitenende im Aktionsbereich sitzt jetzt ein dezenter Copy-Link ohne `https://`.
- Ein Klick kopiert den angezeigten Link ohne `https://` und markiert keinen Text auf der Seite.
- Die Spielzeug-Bearbeiten-Seite zeigt im Header ebenfalls nur den Slug statt `/toys/...`.

## Paar-/Gruppen-Kreise

- Daten waren bisher strikt pro Benutzer ueber `ownerId` sichtbar.
- Neues Modell `Circle` eingefuehrt; Benutzer koennen einem Kreis zugeordnet werden.
- Mitglieder desselben Kreises sehen automatisch gemeinsame Inhalte, ohne einzelne Freigaben setzen zu muessen.
- Benutzerverwaltung erweitert:
  - Kreise anlegen.
  - Beim Anlegen und Bearbeiten Benutzer einem Kreis zuordnen.
  - Kreisnamen bearbeiten.
  - Mitglieder eines Kreises per Checkbox hinzufuegen oder entfernen.
- Zentrale Zugriffshilfen in `src/lib/access.ts` eingefuehrt:
  - `accessibleOwnerIds`
  - `ownerScope`
  - `isAccessibleOwner`
- Kreiszugriff fuer Weboberflaeche umgesetzt:
  - Dashboard
  - Spielsachen
  - Stellungen
  - Lass uns spielen
  - Events/Termine
  - Sessions
  - Medien
  - Dateiauslieferung
- Nachrichtenempfaenger innerhalb des Kreises
- Neue Datensaetze behalten weiterhin den Ersteller als `ownerId`, sind aber fuer Kreis-Mitglieder sichtbar und bearbeitbar.
- Admins koennen Kreise in der Benutzerverwaltung nachtraeglich umbenennen und die Mitgliedschaft zentral pflegen.
- Die Kreisverwaltung ist als aufklappbarer Bereich umgesetzt.
- Einzelne Kreise werden ebenfalls als Accordion dargestellt; bei mehreren Kreisen bleiben sie zunaechst eingeklappt.

## Kompakte Listen fuer Spielsachen und Stellungen

- Die Uebersichten fuer Spielsachen und Stellungen wurden von grossen Kartenrastern auf kompakte Listen umgestellt.
- Jede Zeile zeigt Thumbnail, Titel und kurze Metadaten.
- Native `details/summary`-Elemente ermoeglichen Ausklappen ohne zusaetzliches JavaScript.
- Im ausgeklappten Bereich stehen Beschreibung und ein klarer Button zur Detailseite.
- Dadurch sind lange Kataloge auf Mobile und Desktop schneller scannbar.
- Nachbesserung: Der aufgeklappte Bereich enthaelt wieder ein grosses Bild, Beschreibung, Slug, Zaehler fuer Verknuepfungen und bei Stellungen verknuepfte Spielsachen als Chips.

## Dashboard-Reihenfolge

- Die Wochen-/Kalenderansicht `Gemeinsame Woche` wurde im Dashboard direkt unter den Header verschoben.
- Kennzahlen-Kacheln und letzte Sessions stehen darunter.
- Dadurch ist sofort sichtbar, was in den naechsten Tagen ansteht.

## Dashboard-Spielampel

- Auf dem Dashboard steht vor der Wochenansicht eine Spielampel fuer alle aktiven Mitglieder des eigenen Kreises.
- Jeder Benutzer sieht die Ampel der anderen, kann aber nur die eigene Ampel umschalten.
- Es gibt nur Rot und Gruen:
  - Rot: gerade nicht.
  - Gruen: voll Lust.
- Der Status wird in `UserSettings.playReady` gespeichert.
- `UserSettings.playReadyUpdatedAt` merkt den letzten Umschaltzeitpunkt.
- Jeder Ampelwechsel verschickt eine Telegram-Nachricht an aktive gespeicherte Chats im selben Kreis, sofern ein Bot-Token vorhanden ist.
- Die Telegram-Nachricht nutzt HTML-Markup, nennt Benutzer und den neuen Zustand mit passendem Rot-/Gruen-Emoji.
- Wenn fuer denselben Telegram-Chat ein konkreter Thread aktiv ist, werden Push-Nachrichten an diesen Thread gesendet und nicht an den threadlosen Hauptgruppen-Eintrag.
- Telegram-Kanaele haben optionale Ziele: einzelner Benutzer oder ganzer Kreis.
- In den Telegram-Einstellungen koennen aktive Kanaele aufgeklappt, bearbeitet, geloescht und einem Benutzer oder Kreis zugeordnet werden.
- Push-Nachrichten werden nur noch an Kanaele mit explizitem Ziel gesendet; unzugeordnete Kanaele empfangen keine Ampel-Pushes.
- Der Telegram-Webhook verarbeitet nur noch exakt aktivierte `Chat-ID + Thread-ID`-Kombinationen. Andere Threads, andere Gruppen und die Hauptgruppe werden still ignoriert und nicht als Pending gespeichert.
- Erkannte Pending-Threads koennen in den Telegram-Einstellungen geloescht werden und zeigen die letzte erkannte Testnachricht inklusive Absender/Zeitpunkt.
- Bei erkannten Threads mit Thread-ID wird kein Button mehr angeboten, um den gesamten Chat zu aktivieren.
- Die manuelle Telegram-Chat-Anlage wurde entfernt; Kanaele werden nur noch ueber erkannte Testnachrichten uebernommen.
- Aktive Kanaele zeigen im aufgeklappten Bereich ebenfalls die zuletzt erkannte Testnachricht.
- Telegram-Testnachricht-Einlesen faengt Telegram-/Browser-Fehler ab und zeigt statt technischer Exceptions eine verstaendliche Meldung.
- Gespeicherte Telegram- und OpenAI-Token zeigen in den Einstellungen die letzten sechs Zeichen an, damit der hinterlegte Schluessel erkennbar ist.
- Beim Telegram-Token wird zusaetzlich der aktive Bot-Name ueber Telegram `getMe` angezeigt, wenn der gespeicherte Token gueltig ist.
- Der Speichern-Button fuer Zugangsdaten zeigt waehrend der Server-Action `Speichert...` und danach eine sichtbare Erfolgsmeldung.

## Medienseite als Bild-Feed

- Die Medienseite wurde von einer informationslastigen Verwaltungsansicht auf einen bildzentrierten Feed umgestellt.
- Upload, Albumanlage und Filter sind jetzt kompakte, aufklappbare Werkzeuge oberhalb des Feeds.
- Medien erscheinen als quadratische Kacheln im Instagram-aehnlichen Raster.
- Metadaten werden erst beim Hover/Fokus als Overlay angezeigt.
- Ein Klick auf ein Medium oeffnet eine grosse Detailansicht mit Bild/Video, Metadaten, Dateiinfos, Oeffnen- und Loeschaktion.
- Neues Modell `MediaComment` ermoeglicht Kommentare/Notizen direkt am Medium.
- Medien koennen in der Detailansicht einem Album zugeordnet oder wieder auf `Kein Album` gesetzt werden.
- Im Album-Werkzeug koennen mehrere Medien per Thumbnail-Auswahl gleichzeitig einem Album hinzugefuegt werden.
- Layout-Reihenfolge angepasst: Album-Auswahlchips stehen direkt ueber dem Bildraster, Upload/Albumverwaltung/Filter stehen darunter.

## Datenexport und Datenimport

- Neue Einstellungsseite `Daten` unter `/settings/data`.
- Export erzeugt ein ZIP-Archiv ueber `/api/settings/data-transfer`.
- Das Archiv enthaelt `data.json` mit Portal-Inhalten und einen `files/`-Ordner mit geschuetzten Upload-Dateien.
- Exportiert werden Spielsachen, Stellungen, Aktivitaeten, Sessions, Medien, Alben, Medienkommentare, Termine, Check-ins und zugehoerige Dateien, soweit sie fuer den angemeldeten Benutzer sichtbar sind.
- Nicht exportiert werden Passwoerter, Login-Tokens, Telegram-Token und OpenAI-Keys.
- Import nimmt ein Fesselspiel-ZIP entgegen und fuegt die Inhalte dem aktuell angemeldeten Benutzer hinzu.
- Beim Import werden neue Datei-IDs erzeugt, Datei-URLs neu verknuepft und Slugs automatisch eindeutig gemacht.
- Bestehende Inhalte werden beim Import nicht geloescht oder ueberschrieben.

## Feature-Video

- Ein kurzes peppiges Feature-Video wurde als MP4 erzeugt.
- Das Video erklaert Dashboard, Spielampel, Lass uns spielen, Spielsachen, Stellungen, Medien, Sessions und Telegram-Agent.
- Die Techno-Musik ist synthetisch erzeugt und nicht aus externen Musikquellen kopiert.
- Das Rendering erfolgte ausschliesslich in Docker/FFmpeg; auf dem Server wurde nichts installiert.
- Datei: `entfernt`
- Plattform-Link: `entfernt`
