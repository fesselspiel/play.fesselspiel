# Prompts und Anforderungen

Diese Datei dokumentiert die Anforderungen aus dem Chat. Sie ist keine Secret-Ablage. Inhalte aus `logins.md` werden bewusst nicht übernommen.

## Quellanhänge

Der Startprompt verwies auf diese Anhänge:

- `anwendung_tecnologie_stack.md`
- `telegram-voice.md`
- `deployment_auf_vps.md`
- `logins.md`
- `Telegram_anbindung.md.txt`

Hinweis: `logins.md` kann Zugangsdaten enthalten und wird nicht in diese Dokumentation kopiert.

## Initialer Produktprompt

Der initiale Auftrag war:

- Kink Social Platform für Paare bauen.
- Webanwendung bereitstellen.
- Hauptdomain zunächst `play.festspiel.com`, später korrigiert zu `play.fesselspiel.com`.
- Lesbare, slug-basierte URLs mit internen IDs.
- Slugs sollen bearbeitbar sein.
- Permanente URLs für QR-Codes und Verlinkungen.
- Modernes, helles, hochwertiges, minimalistisches Mobile-First-Design.
- Primärfarbe kräftiges Rot `#E30613`.
- Weiße Oberflächen, hellgraue Karten, schwarze/dunkelgraue Texte.
- Einheitliche Icons, große Touchflächen und konsistentes Designsystem.

Gewünschte Module:

- Benutzer und Profile.
- Registrierung und Login.
- Individuelle Profilinformationen.
- Direktnachrichten.
- Bilder/Videos in Nachrichten.
- Events mit Check-in.
- Medienverwaltung mit Bildern, Videos, Alben und Sichtbarkeiten.
- Segufix-Timetracker mit Start, Ende, Dauer, Notizen.
- Stimmung vorher und nachher mit fünfstufigen Labels und Freitext.
- Jahresübersicht als Session-Kalender mit 12 Zeilen und 31 Spalten.
- Auswertungen zu Dauer und Stimmung.
- Spielzeugkatalog mit Titel, Beschreibung, Foto, URL-Slug, Erstell-/Updatezeit.
- Detailseite und QR-Code pro Spielzeug.
- QR-Code anzeigen, herunterladen, drucken.
- Spätere Sets/Zusammenstellungen.
- "Lass uns was machen"-Feature.
- Aktivitäten mit Spielzeugauswahl, Notiz, Datum, Uhrzeit und Status.
- Stellungen mit Name, Bild, Beschreibung.
- Stellungen mit Spielzeugen und Aktivitäten verknüpfen.
- Suche und Filter für Stellungen.
- Baukastensystem aus Aktivitäten, Stellungen und Spielzeugen.

## Deployment-Prompts

Spätere Anforderungen:

- Build erneut probieren, aber nur auf dem VPS.
- Immer per SSH auf den Server.
- Über die IP gehen.
- IP von `example.invalid` verwenden.
- Korrekte IP: `x.x.x.x`.
- So lange probieren, bis die Webseite auf dem VPS läuft.

Aktueller Stand:

- App läuft auf dem VPS unter `/opt/<app-name>`.
- Container: `kink_social_app`, `kink_social_postgres`.
- Port: `127.0.0.1:8097`.
- Domain: `play.fesselspiel.com`.

## Login-Prompt

Anforderung:

- Login funktioniert nicht.
- Passwortfeld soll wie in Datei mit Auge sichtbar/unsichtbar gemacht werden können.

Umsetzung:

- Login behoben.
- Passwort-Auge eingebaut.

## Telegram-Prompts

Anforderungen:

- Wenn in Telegram-Thread eine Nachricht geschrieben wird, soll nach Reload/Button Einlesen Chat-ID und Thread-ID angezeigt werden.
- Bot soll Befehle können.
- Bot soll als Agent funktionieren, mit dem man sich unterhalten kann.
- Bot soll Fragen beantworten und Aktionen im Portal ausführen.
- Agent soll Gedächtnis haben, etwa letzte 5 bis 10 Nachrichten.
- Beim Anlegen neuer Items soll der Bot einen Dialog starten und alle benötigten Felder abfragen.
- Wenn ein Bild benötigt wird, soll es direkt in den Telegram-Chat gesendet und verarbeitet werden können.
- Freier Bildupload im Telegram-Chat soll automatisch in Medien gespeichert werden.

Umsetzung:

- Chat-/Thread-Einlesen erweitert.
- Webhook- und Updates-APIs ergänzt.
- OpenAI-Agent eingebaut.
- Kurzzeitgedächtnis implementiert.
- Dialoge für Spielzeug/Stellung eingebaut.
- Telegram-Bildverarbeitung eingebaut.
- Telegram-Bilder können als Item-Bild oder als Medium gespeichert werden.

Nachbesserung:

- Beim Erkennen eines Telegram-Channels oder Threads soll der Bot keine Nachricht mehr schreiben.
- Der Bot kann auch in anderen Installationen oder Chats vorhanden sein.
- Es soll gewartet werden, bis der Chat in der App freigeschaltet wird.
- Erkannte Chats sollen nur in der App sichtbar sein.

Umsetzung:

- Unbekannte Chats werden weiterhin als `PENDING` gespeichert.
- Die automatische Antwort `Chat erkannt` wurde aus dem Webhook entfernt.

## Theme-Prompts

Anforderungen:

- Theme Changer mit mehreren Farbschemas.
- Themes für Rot, Schwarz/Grau, Pink, Hellblau, Gelb, Orange und weitere.
- In Benutzereinstellungen gut verpacken.
- Beim Anklicken sofort umschalten, nicht erst nach Speichern.
- Hintergrundfarbe soll zum Theme passen und nicht weiss bleiben.
- Zusätzlich soll es keinen Checkbox-Haken, sondern einen iPhone-artigen Toggle für Dark Mode geben.
- Jedes Farbschema soll auch als Dark Mode funktionieren: schwarzer Hintergrund, dunkle Flächen, passende Akzentfarbe.

Umsetzung:

- Theme-Picker mit Sofortvorschau.
- Theme wird pro Benutzer gespeichert.
- CSS-Variablen für gesamte App.
- Hintergrund und Panels passen sich dem Theme an.
- Dark Mode wird als `UserSettings.darkMode` gespeichert.
- Der Toggle schaltet `data-mode` direkt im Browser um, sodass man die Wirkung sofort sieht.
- Pro Theme gibt es eigene Dark-Swatches und CSS-Akzentwerte.

## Upload-Prompts

Anforderungen:

- Keine Dateisystem-Pfade in der UI.
- Benutzer sollen Dateien hochladen können.
- Dateien sollen löschbar sein.
- Gelöschte Dateien sollen vom Dateisystem verschwinden.
- Pfade sollen nur für berechtigte Benutzer sichtbar sein.
- Keine absoluten Pfade von aussen erreichbar.

Umsetzung:

- `FileAsset` Modell.
- geschützte Datei-API `/api/files/[id]`.
- Uploads benutzerbezogen im Docker-Volume.
- Löschen entfernt Datenbankeintrag und physische Datei.

## Medienseiten-Prompt

Anforderung:

- Medienseite aufhübschen.
- Galerien schön machen.
- Bildern Metadaten, Ordnung und etwas Cooles zum Anschauen geben.
- Seite soll für die Plattform Sinn machen.

Umsetzung:

- Galerie mit Spotlight, Stats, Metadaten, Album-Ordnung, Uploads und Löschfunktionen.

## Mobile-Menü-Prompts

Anforderung:

- In mobiler Ansicht aus oberem Icon/Text-Menü ein Hamburger Dropdown machen.
- Drei Striche oben rechts.
- Menü soll nach unten aufklappen und über dem Inhalt schweben.
- Nach Klick auf eine Seite soll es wieder einklappen.

Nachbesserung:

- Zwischen den Menüzeichen waren Lücken sichtbar.
- Lücken entfernen.

Umsetzung:

- `src/components/mobile-menu.tsx`.
- Mobile Hamburger-Navigation.
- Geschlossene Dropdown-Liste ohne Zwischenräume.

## Edit/Delete-Prompt

Anforderung:

- Spielzeuge, Stellungen, Events und so weiter können nach dem Anlegen nicht geändert werden.
- Alles soll bearbeitbar und löschbar sein.

Umsetzung:

- Edit/Delete für Spielzeuge, Stellungen, Aktivitäten, Events und Sessions.
- Bild ersetzen/entfernen für Spielzeuge und Stellungen.
- Alte Upload-Datei wird bei Bildersatz oder Löschen entfernt.
- Edit-Routen:
  - `/toys/[slug]/edit`
  - `/positions/[slug]/edit`
  - `/activities/[slug]/edit`
  - `/events/[id]/edit`
  - `/sessions/[id]/edit`

## Dokumentations-Prompt

Anforderung:

- Alles bisher Gemachte in mehrere wiederverwendbare `.md` Files packen.
- Files zugänglich machen.
- Kuenftige Arbeiten sollen dort weiter dokumentiert werden.
- Reproduzierbarkeit inklusive Files und Prompt.

## Stellungen Self-Bondage Prompt

Anforderung:

- Bei Stellungen in der Konfiguration beim Anlegen und Ändern ein Checkboxfeld ergänzen.
- Feldname: `Self-Bondage-fähig`.
- Das Feld soll später weiterverwendet werden können.

Umsetzung:

- `Position.selfBondageCapable` als Boolean mit Default `false`.
- Checkbox in `/positions/new`.
- Checkbox in `/positions/[slug]/edit`.

## Medien-Sichtbarkeit Prompt

Anforderung:

- Einzelne Bilder in Alben sollen eine eigene Sichtbarkeit bekommen.
- Album-Bearbeitung soll Sichtbarkeit enthalten, nicht nur Löschen.
- Einzelne Medien sollen standardmäßig die Album-Sichtbarkeit übernehmen, aber überschrieben werden können.
- Der Abruf muss so umgesetzt werden, dass Benutzer nur sehen, was sie sehen dürfen.

Umsetzung:

- `Media.visibility` ist optional; `null` bedeutet `Wie Album`.
- Medien-Detailansicht erlaubt Albumwechsel und Sichtbarkeits-Override.
- Album-Verwaltung erlaubt Name, Beschreibung und Sichtbarkeit zu ändern.
- Medienlisten filtern nach effektiver Sichtbarkeit.
- Geschützter Dateiabruf prüft sichtbare Medien zusätzlich zum Eigentümer-/Zirkelzugriff.

Umsetzung:

- Dokumentation unter `docs/` angelegt.
- README verlinkt die Doku.
- Reproduktions-, Deployment-, Architektur-, Implementierungs- und Prompt-Dateien erstellt.

## Telegram-Listenformat-Prompt

Anforderung:

- Die Ausgabe vom Telegram-Bot ist bei Listen schlecht lesbar.
- Für Listen soll Telegrams HTML-Markup genutzt werden.
- Listen sollen besser formatiert werden.

Umsetzung:

- `sendTelegramMessage` kann jetzt `parse_mode: HTML` setzen.
- Slash-Commands geben sauber formatierte HTML-Listen aus.
- Agent-Suchlisten und Portalstatus werden direkt als HTML formatiert.
- Klickbare Links werden über Telegram-HTML erzeugt.
- Nutzergenerierte Inhalte werden escaped.
- Fallback auf Plain Text verhindert, dass der Bot bei HTML-Fehlern gar nichts sendet.

## Spielzeug-Header-Prompt

Anforderung:

- Der Button beziehungsweise Badge `Permanente URL` auf der Spielzeug-Detailseite ist rund und wirkt zusammenhanglos.
- Das soll visuell repariert werden.

Umsetzung:

- `Permanente URL` ist kein roter Pill-Badge mehr.
- Auf der Spielzeug-Detailseite wird stattdessen eine dezente eckige URL-Info mit Link-Icon angezeigt.
- Der Bearbeiten-Button bleibt die klare Aktion im Header.

## Kurzanleitungs-Prompt

Anforderung:

- Auf jeder Seite soll eine kurze Beschreibung stehen.
- Die Beschreibung soll erklären, was man auf der Seite machen kann.
- Sie soll den Zweck des Features erklären.
- Sie soll dem Benutzer eine kurze Anleitung geben.

Umsetzung:

- `PageGuide` als wiederverwendbare Hilfebox angelegt.
- Alle Seiten mit App-Header erhalten eine knappe Beschreibung direkt unter der Seitenüberschrift.
- Die Login-Seite erhält einen passenden Hinweis innerhalb des Login-Panels.
- Dokumentation wurde nachgezogen.

Nachbesserung:

- Die Box `Kurz erklärt` war oben zu prominent und sollte aus dem Hauptsichtfeld raus.
- Die Hilfetexte wurden in eine eingeklappte Info-Schaltfläche unten rechts verschoben.
- Die Hilfe lässt sich per Klick aufklappen und enthält zusätzlichen Bedienhinweis.
- Bearbeiten-Buttons auf Detailseiten wurden aus dem Header an das Seitenende verschoben.

Weitere Nachbesserung:

- Die schwebende Info unten rechts war weiterhin zu prominent.
- `PageGuide` ist deshalb kein `fixed` Overlay mehr.
- Die Hilfe sitzt jetzt als normales, dezentes `details`-Element am rechten Seitenende und verdeckt keine Inhalte.

## Bildänderungs-Prompt

Anforderung:

- Bildändern bei Spielzeugen und wahrscheinlich anderen Modulen funktioniert nicht verlässlich.
- iPhone-Foto aus der Mediathek mit `.jpg` wurde nicht sichtbar übernommen.
- Der Datei-Auswahlknopf zeigt zu wenig Rückmeldung.
- Die Entfernen-Checkbox soll nur für "Bild entfernen und Standardbild verwenden" relevant sein.
- Wenn ein neues Bild ausgewählt wird, soll es automatisch das alte Bild ersetzen.

Umsetzung:

- Server-Action Upload-Limit auf `50mb` erhöht.
- Sichtbare Upload-Komponente mit Dateiname, Größe und Bildvorschau eingeführt.
- Aktuelles Bild wird auf Bearbeiten-Seiten angezeigt.
- Bei neuer Bildauswahl wird die Entfernen-Option ausgeblendet und das neue Bild ersetzt das alte.
- Entfernen ohne neue Datei setzt wieder das System-Standardbild.

Nachbesserung:

- Auf iPad funktionierte die Vorschau, aber der Speichern-Button reagierte beim Bildwechsel nicht verlässlich.
- Deshalb wurde für Spielzeug- und Stellungsbilder ein direkter Upload beim Auswählen eingebaut.
- Der Button `Änderungen speichern` muss dadurch keine große Bilddatei mehr mitsenden, sondern nur noch die fertige Datei-Referenz speichern.
- Während des Uploads wird das Absenden blockiert und ein Status angezeigt.

Weitere Nachbesserung:

- Das vom Nutzer bereitgestellte iPhone-JPEG wurde direkt am Container erfolgreich hochgeladen, über die öffentliche Domain aber mit `413 Request Entity Too Large` von Nginx abgelehnt.
- Ursache war das fehlende Nginx-Uploadlimit für `play.fesselspiel.com`.
- `client_max_body_size 50m` wurde in der Nginx-Site gesetzt und Nginx neu geladen.
- Danach funktionierte der Upload des konkreten iPhone-Bildes über `https://play.fesselspiel.com/api/uploads`.

## Dashboard-Kalender-Prompt

Anforderung:

- Im Dashboard soll `Nächste Aktivitäten` nicht nur als Liste erscheinen.
- Gewünscht ist eher eine Kalenderansicht oder Wochenübersicht.
- Aktivitäten/Events sollen visuell deutlicher markiert sein, zum Beispiel mit roten Akzenten und größeren Buttons.

Umsetzung:

- Dashboard-Bereich `Gemeinsame Woche` eingeführt.
- Zeigt heute und die nächsten sechs Tage.
- Aktivitäten und Events erscheinen je Tag als klickbare Karten.
- Tage mit Einträgen werden rot markiert.
- Leere Tage zeigen eine ruhige Notiz `Noch nichts geplant.`

## Seitentitel-Home-Link-Prompt

Anforderung:

- Wenn man auf den Seitentitel klickt, soll man wieder auf die Homepage bzw. das Dashboard kommen.

Umsetzung:

- `PageHeader` rendert den Titel als `Link` auf `/`.
- Damit gilt das Verhalten automatisch für alle Seiten, die den gemeinsamen Header verwenden.
- Hover- und Fokus-Stil machen den Titel als interaktives Element erkennbar, ohne den Header optisch zu überladen.

## Navigation-Lass-uns-spielen-Prompt

Anforderung:

- Der Menüpunkt `Aktivitäten` soll `Lass uns spielen` heissen.
- Die Überschrift `Lass uns was machen` soll ebenfalls `Lass uns spielen` heissen.
- In der Navigation soll `Lass uns spielen` an zweiter Position stehen, danach `Stellungen`, danach `Spielsachen`.
- `Events` wirkt redundant zu Aktivitäten und soll aus der Hauptnavigation verschwinden oder mit `Lass uns spielen` zusammengeführt werden.

Umsetzung:

- Desktop- und Mobile-Menü neu sortiert und umbenannt.
- `Events` aus der Hauptnavigation entfernt, ohne bestehende Event-Daten zu löschen.
- Event-Termine werden in der Dashboard-Wochenansicht weiterhin angezeigt, dort aber als `Termin` im Kontext von `Lass uns spielen`.
- Dashboard-Kacheln auf `Lass uns spielen`, `Stellungen`, `Spielsachen`, Sessions, Medien und Nachrichten reduziert.
- Aktivitätsseiten in der sichtbaren Sprache auf `Spielidee`, `Spielplan` und `Spielsachen` angepasst.

## Info-und-Einstellungen-Prompt

Anforderung:

- Die schwebende Info unten rechts ist zu prominent.
- Sie soll nicht schweben, sondern unten auf der Seite rechts sitzen.
- `Telegram`, `Profil` und `Benutzer` sollen unter `Einstellungen` zusammengefasst werden, damit das Menü schlanker wird.

Umsetzung:

- `PageGuide` rendert nicht mehr `fixed`, sondern als normales `details`-Element mit `order-last`, `self-end` und dezenterer Größe.
- Der AppShell-Inhaltsbereich ist ein Flex-Container, sodass PageGuide visuell ans Seitenende wandert, auch wenn die Komponente im JSX nahe am Header steht.
- Desktop- und Mobile-Navigation enthalten nun `Einstellungen` als Hauptpunkt.
- Unter `Einstellungen` liegen `Profil`, `Benutzer` und `Telegram`.

## Spielzeug-URL-Anzeige-Prompt

Anforderung:

- Bei den Spielsachen wird oben der komplette Pfad zu prominent angezeigt.
- Auch die permanente URL soll nicht oben prominent stehen.
- Der URL-Slug kann oben bleiben, aber die eigentliche URL soll nach unten.
- `https://` soll in der sichtbaren Anzeige wegfallen.
- Ein Klick auf den Link soll die URL kopieren, ohne dass Text markiert wird.

Umsetzung:

- Spielzeug-Detailseiten zeigen im Header die URL ohne `https://`.
- `Permanente URL` wurde aus dem Header entfernt.
- Im Aktionsbereich unten wird ein dezenter Copy-Link angezeigt, der `play.fesselspiel.com/toys/...` ohne Protokoll zeigt.
- Die Copy-Funktion kopiert denselben sichtbaren Link ohne `https://` in die Zwischenablage.
- `src/components/copy-link.tsx` wurde als wiederverwendbare Client-Komponente eingeführt.

## Paar-Kreis-Prompt

Anforderung:

- Ein zweiter Benutzer, zum Beispiel Anna, soll die Inhalte des anderen Accounts sehen können.
- Die Plattform ist für Paare gedacht, daher soll nicht jedes Objekt einzeln freigegeben werden müssen.
- Beste Loesung: Benutzer können als Paar oder Gruppe verknüpft werden und sehen dann automatisch alles Gemeinsame.

Umsetzung:

- Neues Prisma-Modell `Circle` und Feld `User.circleId`.
- Admins können in der Benutzerverwaltung Kreise anlegen und Benutzer zuordnen.
- Gemeinsame Webbereiche nutzen `ownerScope(user)` statt nur `ownerId: user.id`.
- Kreis-Mitglieder sehen automatisch gemeinsame Spielsachen, Stellungen, Spielpläne, Termine, Sessions, Medien, Dateien und passende Nachrichten.
- Neue Inhalte behalten ihren Ersteller als Besitzer, werden aber allen aktiven Kreis-Mitgliedern angezeigt.

Nachbesserung:

- Admins müssen Kreise nachträglich bearbeiten können.
- Der Kreisname muss änderbar sein.
- Mitglieder müssen zentral in einen Kreis aufgenommen oder aus einem Kreis entfernt werden können.

Umsetzung:

- Benutzerverwaltung enthält einen Bereich `Kreise bearbeiten`.
- Pro Kreis gibt es ein Formular für Kreisname und Mitglieder-Checkboxen.
- Beim Speichern wird der Kreis umbenannt, angehakte Benutzer werden hinzugefügt und nicht mehr angehakte Benutzer aus diesem Kreis entfernt.

Weitere Nachbesserung:

- Kreise sollen wie andere Listen aufklappbar sein.
- Innerhalb von `Kreise bearbeiten` sollen einzelne Kreise ebenfalls aufklappbar sein, besonders wenn mehr als ein Kreis vorhanden ist.

Umsetzung:

- `Kreise bearbeiten` ist ein nativer `details/summary`-Bereich.
- Jeder Kreis ist ein eigenes `details/summary`-Element.
- Wenn nur ein Kreis vorhanden ist, ist dieser direkt geöffnet; bei mehreren Kreisen starten die einzelnen Kreise eingeklappt.

## Kompakte-Listen-Prompt

Anforderung:

- Bei Stellungen und Spielsachen sollen Listen kompakter werden.
- Sichtbar sein sollen Thumbnail und Überschrift.
- Beim Klick soll das jeweilige Spielzeug oder die jeweilige Stellung ausklappen.

Umsetzung:

- Kartenraster auf `details/summary`-Listen umgestellt.
- Summary-Zeile enthält Thumbnail, Titel und kurze Metadaten.
- Ausgeklappter Bereich enthält Beschreibung und Button zur Detailseite.
- Native Browser-Interaktion, kein extra Client-JavaScript nötig.

Nachbesserung:

- Der aufgeklappte Bereich soll wieder deutlich mehr vom alten Karteninhalt zeigen.
- Deshalb enthalten ausgeklappte Einträge jetzt großes Bild, Beschreibung, Slug, Verknüpfungszähler und Detailbutton.
- Bei Stellungen werden verknüpfte Spielsachen als klickbare Chips gezeigt.

## Dashboard-Reihenfolge-Prompt

Anforderung:

- Der Kalender beziehungsweise die Wochenansicht soll im Dashboard weiter nach oben.
- Man soll sofort sehen, was die nächsten Tage los ist.
- Die bisher oberen Kennzahlen sollen darunter stehen.

Umsetzung:

- `Gemeinsame Woche` direkt unter den Dashboard-Header verschoben.
- Kennzahlen-Kacheln und letzte Sessions folgen darunter.

## Dashboard-Spielampel-Prompt

Anforderung:

- Auf dem Dashboard soll oberhalb der Termine eine Ampel eingebaut werden.
- Keine gelbe Stufe, nur Rot und Grün.
- Pro Benutzer im Zirkel eine Ampel, zum Beispiel Admin und Anna nebeneinander.
- Jeder darf nur die eigene Ampel anklicken und zwischen Rot und Grün wechseln.
- Rot bedeutet: gerade keine Lust zu spielen.
- Grün bedeutet: voll Lust.

Umsetzung:

- `UserSettings.playReady` speichert den Status.
- `UserSettings.playReadyUpdatedAt` speichert den letzten Wechsel.
- Dashboard laedt alle aktiven Benutzer des eigenen Kreises.
- Eigene Ampel wird als Button gerendert; fremde Ampeln sind nur Anzeige.
- Die Ampel steht vor der Wochen-/Terminansicht.

Nachbesserung:

- Wenn sich der Ampelstatus aendert, soll eine Telegram-Nachricht gesendet werden.
- Die Nachricht soll sagen, wer den Status geändert hat.
- Die Nachricht soll nur den neuen Zustand farblich anzeigen; der alte Zustand soll nicht mit Farbe angezeigt werden.
- Die Nachricht soll schöne passende Emojis für Ampel, Rot und Grün enthalten.
- Die Nachricht soll als Telegram-HTML gut formatiert sein.

Umsetzung:

- Beim Umschalten wird eine HTML-Nachricht per `sendTelegramMessage(..., { parseMode: "HTML" })` verschickt.
- Die Nachricht zeigt nur `Status: ...` mit dem neuen roten oder grünen Zustand.
- Ziel sind aktive Telegram-Chats aller Benutzer im selben Kreis, die einen Bot-Token gespeichert haben.
- Doppelte Chat-/Thread-Ziele werden dedupliziert.

## Medien-Feed-Prompt

Anforderung:

- Die Medienseite soll komplett überarbeitet werden.
- Zu viele Informationen und zu viel Scrollen sollen verschwinden.
- Orientierung am Instagram-Feed: zuerst Bilder, Metadaten erst beim Draufgehen beziehungsweise Öffnen.
- Kommentarfunktionen und weitere Aktionen dürfen in der Detailansicht erscheinen.

Umsetzung:

- Bildzentriertes quadratisches Feed-Raster.
- Upload, Album und Filter als kompakte Klappbereiche.
- Hover-/Fokus-Overlay mit Titel, Typ, Sichtbarkeit und Datei-/Albumhinweis.
- Detailansicht per Klick mit großer Medienanzeige, Metadaten, Dateiinfos, Löschen und Öffnen.
- Kommentare werden über `MediaComment` gespeichert und in der Detailansicht angezeigt.

Nachbesserung:

- Ein nachträglich hochgeladenes Bild muss in der Detailansicht einem Album zugeordnet werden können.
- Bei den Alben muss es eine Funktion geben, um Bilder beziehungsweise Medien hinzuzufügen.

Umsetzung:

- Detailansicht enthält ein Album-Auswahlfeld mit Speichern-Button.
- Album-Werkzeug enthält eine Zielalbum-Auswahl und eine Thumbnail-Mehrfachauswahl für Medien.
- Server-Actions prüfen Album und Medien gegen den Benutzer-/Paar-Scope, bevor `albumId` gesetzt wird.

Weitere Nachbesserung:

- Bilder sollen ganz nach oben, damit sie sofort sichtbar sind.
- Darüber soll nur der Albumselektor stehen.
- Upload, Filter und restliche Werkzeuge sollen nach unten wandern.

Umsetzung:

- Album-Chips stehen direkt oberhalb des Bildrasters.
- Das Bildraster folgt unmittelbar danach.
- Upload, Albumverwaltung und Filter stehen unterhalb des Rasters.

Weitere Nachbesserung:

- `Ohne Album` soll verschwinden.
- Jedes Bild soll in einem Album liegen.
- Es soll ein Standardalbum geben, in das neue Medien automatisch gespeichert werden.
- Telegram-Bilduploads sollen im Standardalbum landen und danach eine Nachricht mit Album-Kommandos senden.

Umsetzung:

- Standardalbum heißt `Standard`.
- `ensureDefaultAlbum(ownerId)` legt es bei Bedarf an.
- Medienseite, Session-Bilder, externe Medien-API, Import und Telegram nutzen `Standard` als Fallback.
- Die Telegram-Antwort nach einem Bild-Upload listet alle Alben mit anklickbaren `/media_album_<nummer>_<mediaId>`-Kommandos auf.

Weitere Nachbesserung:

- Der Name `Eingang` gefällt nicht, weil nicht alles dort "reingeht".
- Gewünscht ist ein Name ähnlich zu "Default", aber nicht "Default".

Umsetzung:

- Neuer Name: `Standard`.
- Bestehende `Eingang`-Alben werden beim Zugriff und per Deploy-Script zu `Standard` umbenannt.

## Telegram-Aktionsregeln-Prompt

Anforderung:

- Im Admin-Bereich soll es eine Logik geben, die alle Portal-Events beziehungsweise Aktionen auflistet.
- Aktionen wie Ampel veraendert, Spiel angefragt oder Telegram-Nachricht empfangen sollen per Dropdown auswählbar sein.
- Danach soll ein Benutzer oder Kreis ausgewählt werden.
- Für diese Kombination soll eine Telegram-Nachricht definiert werden, die bei dieser Aktion an den Benutzer oder Kreis gesendet wird.

Umsetzung:

- Neues Modell `TelegramNotificationRule`.
- Regeln werden in `/settings/telegram#notifications` verwaltet.
- Das Dropdown nutzt bekannte Aktionen plus bereits gespeicherte `AuditLog.action`-Werte.
- Regeln senden an aktive Telegram-Kanäle, deren Ziel-Benutzer oder Ziel-Kreis zur Regel passt.
- Nachrichten werden als Telegram-HTML gesendet.
- Templates können `{title}`, `{actor}`, `{event}`, `{action}`, `{url}` und `{details}` einsetzen.

## Medien-Album-Nachbesserung-Prompt

Anforderung:

- In der Bilddetailansicht soll direkt ein neues Album angelegt und das Bild sofort dorthin verschoben werden können.
- Der Album-Speichern-Button braucht Feedback.
- Sichtbarkeit `Privat`, `Partner`, `geteilt` ist unklar und soll klarer benannt und logisch geprüft werden.
- Alben sollen sichtbar verwaltet und gelöscht werden können.
- Beim Album-Löschen dürfen Bilder nicht versehentlich gelöscht werden; Standard ist Verschieben ins Standardalbum.
- Album-Anlegen, Zielalbum und Verschieben sollen nicht unklar in einem Block vermischt sein.

Umsetzung:

- Neues `QuickAlbumForm` in der Medien-Detailansicht.
- Album-Werkzeug in drei Bereiche getrennt: `Neues Album`, `Medien verschieben`, `Alben verwalten`.
- Sichtbarkeit heißt `Nur ich`, `Zirkel`, `Alle`.
- `visibilityScope` filtert Medien und Alben entsprechend.
- Album-Löschen verschiebt Medien standardmäßig nach `Standard`; Dateilöschung ist nur per ausdrücklicher Checkbox möglich.

## Navigation- und Seed-Nachbesserung

Anforderung:

- Logout soll funktionieren.
- Dashboard-Spielampel soll wieder alle Benutzer im Zirkel bzw. für Admins sichtbar zeigen.
- Profilbilder sollen in Dashboard und Benutzerverwaltung angezeigt werden.
- Demo-Position `Rückenlage` soll nicht nach jedem Neustart wieder auftauchen.

Umsetzung:

- Logout-Route nutzt `303`.
- Admin-Dateizugriff auf aktive Benutzer wurde in `accessibleOwnerIds` ergänzt.
- Dashboard zeigt für Admins ohne Kreis alle aktiven Benutzer.
- Seed-Demo-Daten brauchen neben `SEED_DEMO_DATA=true` zusätzlich `SEED_ALLOW_DEMO_RECREATE=true`.

## Einstellungen- und Protokoll-Prompt

Anforderung:

- Profil- und Einstellungsseiten sollen beim Speichern Button-Feedback zeigen.
- Dashboard-Wochentage ohne Planung sollen direkt eine Planung für dieses Datum öffnen.
- Systemzeit soll weiter nach unten und korrigierbar sein.
- Benutzerverwaltung soll einklappbar sein.
- Benutzer anlegen soll Profilbild erlauben, E-Mail optional machen und keine Passwortlängen-Regel erzwingen.
- Logout soll auf Mobile unter Einstellungen erreichbar sein.
- Protokolleinträge sollen gruppierter wirken und eine Suche mit Vorschlägen haben.

Umsetzung:

- `SubmitButton` zeigt Pending-Texte wie `Profil wird gespeichert...`.
- Dashboard erzeugt pro Tag `/activities/new?date=YYYY-MM-DD`; die neue Planung übernimmt das Datum.
- Admin-Zeitkorrektur wird als Minutenwert in `UserSettings.timeOffsetMinutes` gespeichert.
- Kreise, Benutzer anlegen und Benutzer bearbeiten sind als Accordions aufgebaut.
- Neuer Benutzer kann direkt ein Profilbild hochladen.
- Benutzername wird auf Blur über `/api/users/check-username` geprüft.
- E-Mail ist nur noch optionaler Zusatz; ohne E-Mail wird eine lokale interne Adresse aus dem Benutzernamen erzeugt.
- Mobile Einstellungen zeigen nach dem Protokoll einen Logout-Button.
- `ProtocolSearch` filtert die geladenen Protokolleinträge im Browser und springt per Anker zum Treffer.

## Feature-Video-Prompt

Anforderung:

- Ein peppiges Video soll die Funktionen der Seite erklären.
- Gewünscht war ReMotion beziehungsweise ein ReMotion-Skill.
- Der ReMotion-Skill war in der Session nicht verfügbar.
- Nichts soll auf dem Server installiert werden; Rendering nur in Docker.
- Das Video soll mit cooler Techno-Musik unterlegt werden.
- Der fertige absolute Plattform-Link soll bereitgestellt werden.

Umsetzung:

- Synthetische Techno-Spur lokal erzeugt.
- MP4 mit animierten Feature-Folien in einem FFmpeg-Docker-Container gerendert.
- Keine Serverinstallation, nur Docker-Container.
- Ergebnis liegt unter `entfernt`.
- Abrufbar unter `entfernt`.

## Tracker-, Umlaut- und Telegram-Regel-Prompt

Anforderung:

- Sichtbare Umschreibungen wie `ae`, `oe`, `ue` sollen echte Umlaute werden.
- Segufix soll nur noch ein gemeinsames Textfeld für Begleitnotizen haben.
- KG soll statt `Notizen` einen hochwertigeren Begriff verwenden.
- KG-Historie und Segufix-Historienkarten sollen direkt auf Detailseiten verlinken.
- Stellungs-Sortierung soll auf dem iPad funktionieren und nicht prominent sichtbar sein.
- In Einstellungen soll ein schneller Dark-Mode-Toggle erreichbar sein.
- Telegram-Aktionsregeln sollen zuverlässig auslösen.
- Telegram-Slash-Kommandos in HTML-Nachrichten sollen antippbar bleiben.

Umsetzung:

- Sichtbare deutsche Texte wurden auf echte Umlaute umgestellt; technische Slugs bleiben ASCII.
- Segufix nutzt `Sessionkommentar`, KG nutzt `Sessionbeschreibung`.
- Neue KG-Detailseite `/sessions/kg/[id]`.
- Historien- und Kalenderlinks führen zu den Detailseiten.
- Stellungs-Sortierung ist für Admins als eingeklappter Bereich mit Hoch-/Runter-Schaltern umgesetzt.
- Dark-Mode-Toggle wurde in Desktop- und Mobile-Einstellungen ergänzt.
- Telegram-Regeln matchen Kreis- und Benutzerziele gegenseitig über die Kreiszugehörigkeit.
- Slash-Kommandos werden in Telegram-HTML nicht mehr als `<code>` ausgegeben.

## Spielanfrage-, Session- und Regeltest-Prompt

Anforderung:

- Wer selbst einen Spielplan angefragt hat, soll ihn nicht selbst bestätigen können.
- Laufende Sessions sollen direkt beendet werden können, auch aus Dashboard und Detailseite.
- Bei Aktionsbenachrichtigungen darf nicht gleichzeitig widersprüchlich Benutzer und Kreis ausgewählt werden.
- Telegram-Regeln brauchen einen Testbutton, damit man sie ohne echte Portalaktion prüfen kann.

Umsetzung:

- Bestätigen-Button und Server Action schließen den Ersteller der Anfrage aus.
- Neue Server Action `stopSegufixSession` beendet eigene laufende Segufix-Sessions.
- Dashboard und Session-Seiten zeigen `Session beenden`, wenn die laufende Session dem aktuellen Benutzer gehört.
- Telegram-Regeln nutzen eine dynamische Zielauswahl: entweder Benutzer oder Kreis.
- `Test senden` ruft gezielt die ausgewählte Regel mit Testdaten auf.
