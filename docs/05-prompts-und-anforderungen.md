# Prompts und Anforderungen

Diese Datei dokumentiert die Anforderungen aus dem Chat. Sie ist keine Secret-Ablage. Inhalte aus `logins.md` werden bewusst nicht uebernommen.

## Quellanhaenge

Der Startprompt verwies auf diese Anhaenge:

- `anwendung_tecnologie_stack.md`
- `telegram-voice.md`
- `deployment_auf_vps.md`
- `logins.md`
- `Telegram_anbindung.md.txt`

Hinweis: `logins.md` kann Zugangsdaten enthalten und wird nicht in diese Dokumentation kopiert.

## Initialer Produktprompt

Der initiale Auftrag war:

- Kink Social Platform fuer Paare bauen.
- Webanwendung bereitstellen.
- Hauptdomain zunaechst `play.festspiel.com`, spaeter korrigiert zu `play.fesselspiel.com`.
- Lesbare, slug-basierte URLs mit internen IDs.
- Slugs sollen bearbeitbar sein.
- Permanente URLs fuer QR-Codes und Verlinkungen.
- Modernes, helles, hochwertiges, minimalistisches Mobile-First-Design.
- Primaerfarbe kraeftiges Rot `#E30613`.
- Weisse Oberflaechen, hellgraue Karten, schwarze/dunkelgraue Texte.
- Einheitliche Icons, grosse Touchflaechen und konsistentes Designsystem.

Gewuenschte Module:

- Benutzer und Profile.
- Registrierung und Login.
- Individuelle Profilinformationen.
- Direktnachrichten.
- Bilder/Videos in Nachrichten.
- Events mit Check-in.
- Medienverwaltung mit Bildern, Videos, Alben und Sichtbarkeiten.
- Segufix-Timetracker mit Start, Ende, Dauer, Notizen.
- Stimmung vorher und nachher mit fuenfstufigen Labels und Freitext.
- Jahresuebersicht als Session-Kalender mit 12 Zeilen und 31 Spalten.
- Auswertungen zu Dauer und Stimmung.
- Spielzeugkatalog mit Titel, Beschreibung, Foto, URL-Slug, Erstell-/Updatezeit.
- Detailseite und QR-Code pro Spielzeug.
- QR-Code anzeigen, herunterladen, drucken.
- Spaetere Sets/Zusammenstellungen.
- "Lass uns was machen"-Feature.
- Aktivitaeten mit Spielzeugauswahl, Notiz, Datum, Uhrzeit und Status.
- Stellungen mit Name, Bild, Beschreibung.
- Stellungen mit Spielzeugen und Aktivitaeten verknuepfen.
- Suche und Filter fuer Stellungen.
- Baukastensystem aus Aktivitaeten, Stellungen und Spielzeugen.

## Deployment-Prompts

Spaetere Anforderungen:

- Build erneut probieren, aber nur auf dem VPS.
- Immer per SSH auf den Server.
- Ueber die IP gehen.
- IP von `example.invalid` verwenden.
- Korrekte IP: `x.x.x.x`.
- So lange probieren, bis die Webseite auf dem VPS laeuft.

Aktueller Stand:

- App laeuft auf dem VPS unter `/opt/<app-name>`.
- Container: `kink_social_app`, `kink_social_postgres`.
- Port: `127.0.0.1:8097`.
- Domain: `play.fesselspiel.com`.

## Login-Prompt

Anforderung:

- Login funktioniert nicht.
- Passwortfeld soll wie in Datei mit Auge sichtbar/unsichtbar gemacht werden koennen.

Umsetzung:

- Login behoben.
- Passwort-Auge eingebaut.

## Telegram-Prompts

Anforderungen:

- Wenn in Telegram-Thread eine Nachricht geschrieben wird, soll nach Reload/Button Einlesen Chat-ID und Thread-ID angezeigt werden.
- Bot soll Befehle koennen.
- Bot soll als Agent funktionieren, mit dem man sich unterhalten kann.
- Bot soll Fragen beantworten und Aktionen im Portal ausfuehren.
- Agent soll Gedaechtnis haben, etwa letzte 5 bis 10 Nachrichten.
- Beim Anlegen neuer Items soll der Bot einen Dialog starten und alle benoetigten Felder abfragen.
- Wenn ein Bild benoetigt wird, soll es direkt in den Telegram-Chat gesendet und verarbeitet werden koennen.
- Freier Bildupload im Telegram-Chat soll automatisch in Medien gespeichert werden.

Umsetzung:

- Chat-/Thread-Einlesen erweitert.
- Webhook- und Updates-APIs ergaenzt.
- OpenAI-Agent eingebaut.
- Kurzzeitgedaechtnis implementiert.
- Dialoge fuer Spielzeug/Stellung eingebaut.
- Telegram-Bildverarbeitung eingebaut.
- Telegram-Bilder koennen als Item-Bild oder als Medium gespeichert werden.

## Theme-Prompts

Anforderungen:

- Theme Changer mit mehreren Farbschemas.
- Themes fuer Rot, Schwarz/Grau, Pink, Hellblau, Gelb, Orange und weitere.
- In Benutzereinstellungen gut verpacken.
- Beim Anklicken sofort umschalten, nicht erst nach Speichern.
- Hintergrundfarbe soll zum Theme passen und nicht weiss bleiben.
- Zusaetzlich soll es keinen Checkbox-Haken, sondern einen iPhone-artigen Toggle fuer Dark Mode geben.
- Jedes Farbschema soll auch als Dark Mode funktionieren: schwarzer Hintergrund, dunkle Flaechen, passende Akzentfarbe.

Umsetzung:

- Theme-Picker mit Sofortvorschau.
- Theme wird pro Benutzer gespeichert.
- CSS-Variablen fuer gesamte App.
- Hintergrund und Panels passen sich dem Theme an.
- Dark Mode wird als `UserSettings.darkMode` gespeichert.
- Der Toggle schaltet `data-mode` direkt im Browser um, sodass man die Wirkung sofort sieht.
- Pro Theme gibt es eigene Dark-Swatches und CSS-Akzentwerte.

## Upload-Prompts

Anforderungen:

- Keine Dateisystem-Pfade in der UI.
- Benutzer sollen Dateien hochladen koennen.
- Dateien sollen loeschbar sein.
- Geloeschte Dateien sollen vom Dateisystem verschwinden.
- Pfade sollen nur fuer berechtigte Benutzer sichtbar sein.
- Keine absoluten Pfade von aussen erreichbar.

Umsetzung:

- `FileAsset` Modell.
- geschuetzte Datei-API `/api/files/[id]`.
- Uploads benutzerbezogen im Docker-Volume.
- Loeschen entfernt Datenbankeintrag und physische Datei.

## Medienseiten-Prompt

Anforderung:

- Medienseite aufhuebschen.
- Galerien schoen machen.
- Bildern Metadaten, Ordnung und etwas Cooles zum Anschauen geben.
- Seite soll fuer die Plattform Sinn machen.

Umsetzung:

- Galerie mit Spotlight, Stats, Metadaten, Album-Ordnung, Uploads und Loeschfunktionen.

## Mobile-Menue-Prompts

Anforderung:

- In mobiler Ansicht aus oberem Icon/Text-Menue ein Hamburger Dropdown machen.
- Drei Striche oben rechts.
- Menue soll nach unten aufklappen und ueber dem Inhalt schweben.
- Nach Klick auf eine Seite soll es wieder einklappen.

Nachbesserung:

- Zwischen den Menuezeichen waren Luecken sichtbar.
- Luecken entfernen.

Umsetzung:

- `src/components/mobile-menu.tsx`.
- Mobile Hamburger-Navigation.
- Geschlossene Dropdown-Liste ohne Zwischenraeume.

## Edit/Delete-Prompt

Anforderung:

- Spielzeuge, Stellungen, Events und so weiter koennen nach dem Anlegen nicht geaendert werden.
- Alles soll bearbeitbar und loeschbar sein.

Umsetzung:

- Edit/Delete fuer Spielzeuge, Stellungen, Aktivitaeten, Events und Sessions.
- Bild ersetzen/entfernen fuer Spielzeuge und Stellungen.
- Alte Upload-Datei wird bei Bildersatz oder Loeschen entfernt.
- Edit-Routen:
  - `/toys/[slug]/edit`
  - `/positions/[slug]/edit`
  - `/activities/[slug]/edit`
  - `/events/[id]/edit`
  - `/sessions/[id]/edit`

## Dokumentations-Prompt

Anforderung:

- Alles bisher Gemachte in mehrere wiederverwendbare `.md` Files packen.
- Files zugaenglich machen.
- Kuenftige Arbeiten sollen dort weiter dokumentiert werden.
- Reproduzierbarkeit inklusive Files und Prompt.

Umsetzung:

- Dokumentation unter `docs/` angelegt.
- README verlinkt die Doku.
- Reproduktions-, Deployment-, Architektur-, Implementierungs- und Prompt-Dateien erstellt.

## Telegram-Listenformat-Prompt

Anforderung:

- Die Ausgabe vom Telegram-Bot ist bei Listen schlecht lesbar.
- Fuer Listen soll Telegrams HTML-Markup genutzt werden.
- Listen sollen besser formatiert werden.

Umsetzung:

- `sendTelegramMessage` kann jetzt `parse_mode: HTML` setzen.
- Slash-Commands geben sauber formatierte HTML-Listen aus.
- Agent-Suchlisten und Portalstatus werden direkt als HTML formatiert.
- Klickbare Links werden ueber Telegram-HTML erzeugt.
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
- Die Beschreibung soll erklaeren, was man auf der Seite machen kann.
- Sie soll den Zweck des Features erklaeren.
- Sie soll dem Benutzer eine kurze Anleitung geben.

Umsetzung:

- `PageGuide` als wiederverwendbare Hilfebox angelegt.
- Alle Seiten mit App-Header erhalten eine knappe Beschreibung direkt unter der Seitenueberschrift.
- Die Login-Seite erhaelt einen passenden Hinweis innerhalb des Login-Panels.
- Dokumentation wurde nachgezogen.

Nachbesserung:

- Die Box `Kurz erklaert` war oben zu prominent und sollte aus dem Hauptsichtfeld raus.
- Die Hilfetexte wurden in eine eingeklappte Info-Schaltflaeche unten rechts verschoben.
- Die Hilfe laesst sich per Klick aufklappen und enthaelt zusaetzlichen Bedienhinweis.
- Bearbeiten-Buttons auf Detailseiten wurden aus dem Header an das Seitenende verschoben.

Weitere Nachbesserung:

- Die schwebende Info unten rechts war weiterhin zu prominent.
- `PageGuide` ist deshalb kein `fixed` Overlay mehr.
- Die Hilfe sitzt jetzt als normales, dezentes `details`-Element am rechten Seitenende und verdeckt keine Inhalte.

## Bildaenderungs-Prompt

Anforderung:

- Bildaendern bei Spielzeugen und wahrscheinlich anderen Modulen funktioniert nicht verlaesslich.
- iPhone-Foto aus der Mediathek mit `.jpg` wurde nicht sichtbar uebernommen.
- Der Datei-Auswahlknopf zeigt zu wenig Rueckmeldung.
- Die Entfernen-Checkbox soll nur fuer "Bild entfernen und Standardbild verwenden" relevant sein.
- Wenn ein neues Bild ausgewaehlt wird, soll es automatisch das alte Bild ersetzen.

Umsetzung:

- Server-Action Upload-Limit auf `50mb` erhoeht.
- Sichtbare Upload-Komponente mit Dateiname, Groesse und Bildvorschau eingefuehrt.
- Aktuelles Bild wird auf Bearbeiten-Seiten angezeigt.
- Bei neuer Bildauswahl wird die Entfernen-Option ausgeblendet und das neue Bild ersetzt das alte.
- Entfernen ohne neue Datei setzt wieder das System-Standardbild.

Nachbesserung:

- Auf iPad funktionierte die Vorschau, aber der Speichern-Button reagierte beim Bildwechsel nicht verlaesslich.
- Deshalb wurde fuer Spielzeug- und Stellungsbilder ein direkter Upload beim Auswaehlen eingebaut.
- Der Button `Aenderungen speichern` muss dadurch keine grosse Bilddatei mehr mitsenden, sondern nur noch die fertige Datei-Referenz speichern.
- Waehrend des Uploads wird das Absenden blockiert und ein Status angezeigt.

Weitere Nachbesserung:

- Das vom Nutzer bereitgestellte iPhone-JPEG wurde direkt am Container erfolgreich hochgeladen, ueber die oeffentliche Domain aber mit `413 Request Entity Too Large` von Nginx abgelehnt.
- Ursache war das fehlende Nginx-Uploadlimit fuer `play.fesselspiel.com`.
- `client_max_body_size 50m` wurde in der Nginx-Site gesetzt und Nginx neu geladen.
- Danach funktionierte der Upload des konkreten iPhone-Bildes ueber `https://play.fesselspiel.com/api/uploads`.

## Dashboard-Kalender-Prompt

Anforderung:

- Im Dashboard soll `Naechste Aktivitaeten` nicht nur als Liste erscheinen.
- Gewuenscht ist eher eine Kalenderansicht oder Wochenuebersicht.
- Aktivitaeten/Events sollen visuell deutlicher markiert sein, zum Beispiel mit roten Akzenten und groesseren Buttons.

Umsetzung:

- Dashboard-Bereich `Gemeinsame Woche` eingefuehrt.
- Zeigt heute und die naechsten sechs Tage.
- Aktivitaeten und Events erscheinen je Tag als klickbare Karten.
- Tage mit Eintraegen werden rot markiert.
- Leere Tage zeigen eine ruhige Notiz `Noch nichts geplant.`

## Seitentitel-Home-Link-Prompt

Anforderung:

- Wenn man auf den Seitentitel klickt, soll man wieder auf die Homepage bzw. das Dashboard kommen.

Umsetzung:

- `PageHeader` rendert den Titel als `Link` auf `/`.
- Damit gilt das Verhalten automatisch fuer alle Seiten, die den gemeinsamen Header verwenden.
- Hover- und Fokus-Stil machen den Titel als interaktives Element erkennbar, ohne den Header optisch zu ueberladen.

## Navigation-Lass-uns-spielen-Prompt

Anforderung:

- Der Menuepunkt `Aktivitaeten` soll `Lass uns spielen` heissen.
- Die Ueberschrift `Lass uns was machen` soll ebenfalls `Lass uns spielen` heissen.
- In der Navigation soll `Lass uns spielen` an zweiter Position stehen, danach `Stellungen`, danach `Spielsachen`.
- `Events` wirkt redundant zu Aktivitaeten und soll aus der Hauptnavigation verschwinden oder mit `Lass uns spielen` zusammengefuehrt werden.

Umsetzung:

- Desktop- und Mobile-Menue neu sortiert und umbenannt.
- `Events` aus der Hauptnavigation entfernt, ohne bestehende Event-Daten zu loeschen.
- Event-Termine werden in der Dashboard-Wochenansicht weiterhin angezeigt, dort aber als `Termin` im Kontext von `Lass uns spielen`.
- Dashboard-Kacheln auf `Lass uns spielen`, `Stellungen`, `Spielsachen`, Sessions, Medien und Nachrichten reduziert.
- Aktivitaetsseiten in der sichtbaren Sprache auf `Spielidee`, `Spielplan` und `Spielsachen` angepasst.

## Info-und-Einstellungen-Prompt

Anforderung:

- Die schwebende Info unten rechts ist zu prominent.
- Sie soll nicht schweben, sondern unten auf der Seite rechts sitzen.
- `Telegram`, `Profil` und `Benutzer` sollen unter `Einstellungen` zusammengefasst werden, damit das Menue schlanker wird.

Umsetzung:

- `PageGuide` rendert nicht mehr `fixed`, sondern als normales `details`-Element mit `order-last`, `self-end` und dezenterer Groesse.
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
- `src/components/copy-link.tsx` wurde als wiederverwendbare Client-Komponente eingefuehrt.

## Paar-Kreis-Prompt

Anforderung:

- Ein zweiter Benutzer, zum Beispiel Anna, soll die Inhalte des anderen Accounts sehen koennen.
- Die Plattform ist fuer Paare gedacht, daher soll nicht jedes Objekt einzeln freigegeben werden muessen.
- Beste Loesung: Benutzer koennen als Paar oder Gruppe verknuepft werden und sehen dann automatisch alles Gemeinsame.

Umsetzung:

- Neues Prisma-Modell `Circle` und Feld `User.circleId`.
- Admins koennen in der Benutzerverwaltung Kreise anlegen und Benutzer zuordnen.
- Gemeinsame Webbereiche nutzen `ownerScope(user)` statt nur `ownerId: user.id`.
- Kreis-Mitglieder sehen automatisch gemeinsame Spielsachen, Stellungen, Spielplaene, Termine, Sessions, Medien, Dateien und passende Nachrichten.
- Neue Inhalte behalten ihren Ersteller als Besitzer, werden aber allen aktiven Kreis-Mitgliedern angezeigt.

Nachbesserung:

- Admins muessen Kreise nachtraeglich bearbeiten koennen.
- Der Kreisname muss aenderbar sein.
- Mitglieder muessen zentral in einen Kreis aufgenommen oder aus einem Kreis entfernt werden koennen.

Umsetzung:

- Benutzerverwaltung enthaelt einen Bereich `Kreise bearbeiten`.
- Pro Kreis gibt es ein Formular fuer Kreisname und Mitglieder-Checkboxen.
- Beim Speichern wird der Kreis umbenannt, angehakte Benutzer werden hinzugefuegt und nicht mehr angehakte Benutzer aus diesem Kreis entfernt.

## Kompakte-Listen-Prompt

Anforderung:

- Bei Stellungen und Spielsachen sollen Listen kompakter werden.
- Sichtbar sein sollen Thumbnail und Ueberschrift.
- Beim Klick soll das jeweilige Spielzeug oder die jeweilige Stellung ausklappen.

Umsetzung:

- Kartenraster auf `details/summary`-Listen umgestellt.
- Summary-Zeile enthaelt Thumbnail, Titel und kurze Metadaten.
- Ausgeklappter Bereich enthaelt Beschreibung und Button zur Detailseite.
- Native Browser-Interaktion, kein extra Client-JavaScript noetig.

Nachbesserung:

- Der aufgeklappte Bereich soll wieder deutlich mehr vom alten Karteninhalt zeigen.
- Deshalb enthalten ausgeklappte Eintraege jetzt grosses Bild, Beschreibung, Slug, Verknuepfungszaehler und Detailbutton.
- Bei Stellungen werden verknuepfte Spielsachen als klickbare Chips gezeigt.

## Dashboard-Reihenfolge-Prompt

Anforderung:

- Der Kalender beziehungsweise die Wochenansicht soll im Dashboard weiter nach oben.
- Man soll sofort sehen, was die naechsten Tage los ist.
- Die bisher oberen Kennzahlen sollen darunter stehen.

Umsetzung:

- `Gemeinsame Woche` direkt unter den Dashboard-Header verschoben.
- Kennzahlen-Kacheln und letzte Sessions folgen darunter.

## Dashboard-Spielampel-Prompt

Anforderung:

- Auf dem Dashboard soll oberhalb der Termine eine Ampel eingebaut werden.
- Keine gelbe Stufe, nur Rot und Gruen.
- Pro Benutzer im Zirkel eine Ampel, zum Beispiel Admin und Anna nebeneinander.
- Jeder darf nur die eigene Ampel anklicken und zwischen Rot und Gruen wechseln.
- Rot bedeutet: gerade keine Lust zu spielen.
- Gruen bedeutet: voll Lust.

Umsetzung:

- `UserSettings.playReady` speichert den Status.
- `UserSettings.playReadyUpdatedAt` speichert den letzten Wechsel.
- Dashboard laedt alle aktiven Benutzer des eigenen Kreises.
- Eigene Ampel wird als Button gerendert; fremde Ampeln sind nur Anzeige.
- Die Ampel steht vor der Wochen-/Terminansicht.

Nachbesserung:

- Wenn sich der Ampelstatus aendert, soll eine Telegram-Nachricht gesendet werden.
- Die Nachricht soll sagen, wer den Status geaendert hat.
- Die Nachricht soll nur den neuen Zustand farblich anzeigen; der alte Zustand soll nicht mit Farbe angezeigt werden.
- Die Nachricht soll schoene passende Emojis fuer Ampel, Rot und Gruen enthalten.
- Die Nachricht soll als Telegram-HTML gut formatiert sein.

Umsetzung:

- Beim Umschalten wird eine HTML-Nachricht per `sendTelegramMessage(..., { parseMode: "HTML" })` verschickt.
- Die Nachricht zeigt nur `Status: ...` mit dem neuen roten oder gruenen Zustand.
- Ziel sind aktive Telegram-Chats aller Benutzer im selben Kreis, die einen Bot-Token gespeichert haben.
- Doppelte Chat-/Thread-Ziele werden dedupliziert.

## Medien-Feed-Prompt

Anforderung:

- Die Medienseite soll komplett ueberarbeitet werden.
- Zu viele Informationen und zu viel Scrollen sollen verschwinden.
- Orientierung am Instagram-Feed: zuerst Bilder, Metadaten erst beim Draufgehen beziehungsweise Oeffnen.
- Kommentarfunktionen und weitere Aktionen duerfen in der Detailansicht erscheinen.

Umsetzung:

- Bildzentriertes quadratisches Feed-Raster.
- Upload, Album und Filter als kompakte Klappbereiche.
- Hover-/Fokus-Overlay mit Titel, Typ, Sichtbarkeit und Datei-/Albumhinweis.
- Detailansicht per Klick mit grosser Medienanzeige, Metadaten, Dateiinfos, Loeschen und Oeffnen.
- Kommentare werden ueber `MediaComment` gespeichert und in der Detailansicht angezeigt.

Nachbesserung:

- Ein nachtraeglich hochgeladenes Bild muss in der Detailansicht einem Album zugeordnet werden koennen.
- Bei den Alben muss es eine Funktion geben, um Bilder beziehungsweise Medien hinzuzufuegen.

Umsetzung:

- Detailansicht enthaelt ein Album-Auswahlfeld mit Speichern-Button.
- Album-Werkzeug enthaelt eine Zielalbum-Auswahl und eine Thumbnail-Mehrfachauswahl fuer Medien.
- Server-Actions pruefen Album und Medien gegen den Benutzer-/Paar-Scope, bevor `albumId` gesetzt wird.

Weitere Nachbesserung:

- Bilder sollen ganz nach oben, damit sie sofort sichtbar sind.
- Darueber soll nur der Albumselektor stehen.
- Upload, Filter und restliche Werkzeuge sollen nach unten wandern.

Umsetzung:

- Album-Chips stehen direkt oberhalb des Bildrasters.
- Das Bildraster folgt unmittelbar danach.
- Upload, Albumverwaltung und Filter stehen unterhalb des Rasters.

## Feature-Video-Prompt

Anforderung:

- Ein peppiges Video soll die Funktionen der Seite erklaeren.
- Gewuenscht war ReMotion beziehungsweise ein ReMotion-Skill.
- Der ReMotion-Skill war in der Session nicht verfuegbar.
- Nichts soll auf dem Server installiert werden; Rendering nur in Docker.
- Das Video soll mit cooler Techno-Musik unterlegt werden.
- Der fertige absolute Plattform-Link soll bereitgestellt werden.

Umsetzung:

- Synthetische Techno-Spur lokal erzeugt.
- MP4 mit animierten Feature-Folien in einem FFmpeg-Docker-Container gerendert.
- Keine Serverinstallation, nur Docker-Container.
- Ergebnis liegt unter `entfernt`.
- Abrufbar unter `entfernt`.
