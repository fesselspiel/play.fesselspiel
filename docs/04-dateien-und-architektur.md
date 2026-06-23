# Dateien und Architektur

## Top-Level

- `README.md`: kurzer Einstieg.
- `docs/`: ausführliche reproduzierbare Projektdokumentation.
- `Dockerfile`: Production-Build für Next.js.
- `docker-compose.yml`: App, PostgreSQL, Volumes, Traefik-Labels.
- `docker-entrypoint.sh`: DB-Push, Seed und App-Start mit Logausgabe.
- `.env.example`: Beispielkonfiguration ohne echte Secrets.
- `package.json`: Scripts und Dependencies.
- `prisma/schema.prisma`: Datenmodell.
- `prisma/seed.js`: Initialer Admin und Basisdaten.
- `scripts/generate-user-guide.js`: erzeugt die öffentliche Benutzeranleitung als HTML und PDF unter `public/docs`.
- `public/docs/benutzeranleitung.html`: Browser-Vorschau der Benutzeranleitung.
- `public/docs/playplaner-benutzeranleitung.pdf`: öffentlich teilbare PDF-Anleitung.

## Zentrale Libraries

- `src/lib/auth.ts`: Login, Session, aktueller User.
- `src/lib/access.ts`: Kreisbasierte Zugriffshilfen für gemeinsame Paar-/Gruppendaten.
- `src/lib/prisma.ts`: Prisma Client.
- `src/lib/crypto.ts`: VerSchlüsselung für Bot/API Keys.
- `src/lib/env.ts`: Environment-Parsing.
- `src/lib/files.ts`: Upload speichern, FileAsset-URL, Datei-ID aus URL, Datei löschen.
- `src/lib/slug.ts`: Slugify, normalizeSlug, uniqueSlug, uniqueSlugForUpdate.
- `src/lib/dates.ts`: Datumsformatierung, `datetime-local`, Dauerberechnung.
- `src/lib/audit.ts`: Fehlertolerantes Schreiben von Audit-/Protokolleinträgen.
- `src/lib/moods.ts`: Labels und Scores für Session-Stimmungen.
- `src/lib/themes.ts`: Theme-Definitionen.
- `src/lib/telegram.ts`: Telegram API, Webhook, Updates, Datei-Download.
- `src/lib/telegram-agent.ts`: OpenAI-Agent und Aktionslogik.
- `src/lib/telegram-item-dialogue.ts`: Dialogstatus und Felder für Item-Anlage.

Telegram-Formatierung:

- `sendTelegramMessage` unterstützt optional `parseMode: "HTML"` und `disableWebPagePreview`.
- `telegramHtml` escaped nutzergenerierte Inhalte für Telegram-HTML.
- `telegramLink` erzeugt klickbare Telegram-HTML-Links.
- Bei HTML-Sendefehlern fällt `sendTelegramMessage` automatisch auf Plain Text zurück.

## Komponenten

- `src/components/app-shell.tsx`: Grundlayout, Desktop-Sidebar, MobileMenu.
- `src/components/copy-link.tsx`: Kleine Client-Komponente zum Kopieren dezenter, sichtbarer Links ohne Textauswahl.
- `src/components/file-upload-field.tsx`: Sichtbarer Datei-Upload mit Dateiname, Größe, Bildvorschau und optionaler Entfernen-Checkbox.
- `src/components/mobile-menu.tsx`: Hamburger-Menü für mobile Ansicht.
- `src/components/login-form.tsx`: Loginformular mit Passwort-Auge.
- `src/components/theme-picker.tsx`: Theme-Auswahl mit Sofortvorschau.
- `src/components/sortable-catalog.tsx`: Drag-and-drop-Listen für Spielzeuge und Szenen.
- `src/components/ui.tsx`: PageHeader, PageGuide, Panel, SoftPanel, Field, Button, Badge, EmptyState.
- `src/components/telegram/chat-discovery.tsx`: Telegram Chat-/Thread-Erkennung und Webhook-Steuerung.

`PageGuide` wird als eingeklapptes, dezentes Info-Element am rechten Seitenende gerendert. Es ist kein schwebendes Overlay mehr und verdeckt keine Inhalte.

## App-Routen

### Dashboard

- `src/app/page.tsx`: Start/Dashboard.

### Auth

- `src/app/login/page.tsx`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/logout/route.ts`

### Spielzeuge

- `src/app/toys/page.tsx`
- `src/app/toys/new/page.tsx`
- `src/app/toys/[slug]/page.tsx`
- `src/app/toys/[slug]/edit/page.tsx`

### Szenen

- `src/app/positions/page.tsx`
- `src/app/positions/new/page.tsx`
- `src/app/positions/[slug]/page.tsx`
- `src/app/positions/[slug]/edit/page.tsx`

### Aktivitäten

- `src/app/activities/page.tsx`
- `src/app/activities/new/page.tsx`
- `src/app/activities/[slug]/page.tsx`
- `src/app/activities/[slug]/edit/page.tsx`

### Events

- `src/app/events/page.tsx`
- `src/app/events/[id]/edit/page.tsx`

### Sessions

- `src/app/sessions/page.tsx`
- `src/app/sessions/[id]/edit/page.tsx`
- `src/app/sessions/kg/[id]/page.tsx`
- `src/app/sessions/kg/[id]/edit/page.tsx`

### Bilder und Protokoll

- `src/app/media/page.tsx`
- `src/app/messages/page.tsx`: Protokollseite unter Einstellungen, gruppiert App-Aktionen und alte Telegram-/Nachrichten-Einträge.
- `src/app/api/files/[id]/route.ts`
- `src/app/api/uploads/route.ts`
- `src/app/api/reorder/route.ts`: Speichert Drag-and-drop-Reihenfolgen für Spielzeug- und Szenenlisten.

### Einstellungen

- `src/app/profile/page.tsx`
- `src/app/settings/users/page.tsx`
- `src/app/settings/telegram/page.tsx`
- `src/app/settings/help/page.tsx`: Admin-Seite für Anleitung mit Vorschau, Download und Teilen-Link.

### Telegram APIs

- `src/app/api/telegram/webhook/route.ts`
- `src/app/api/telegram/updates/route.ts`
- `src/app/api/telegram/chats/route.ts`
- `src/app/api/telegram/send/route.ts`
- `src/app/api/telegram/webhook-config/route.ts`
- `src/app/api/telegram/webhook-info/route.ts`

Listen aus Slash-Commands und Agent-Suchen werden im Webhook beziehungsweise in `telegram-agent.ts` mit Telegram-HTML formatiert.

### QR

- `src/app/api/qr/route.ts`

### Externe API

- `src/app/api/external/status/route.ts`
- `src/app/api/external/trackers/[trackerKey]/start/route.ts`
- `src/app/api/external/trackers/[trackerKey]/stop/route.ts`
- `src/app/api/external/trackers/quotas/route.ts`
- `src/app/api/external/media/route.ts`

## Prisma-Modelle

- `User`: Account, Rolle, Login, Beziehungen.
- `UserSettings`: Theme, Dark Mode, Spielampel-Status, Telegram/OpenAI Secrets, Telegram Chats und Telegram-Aktionsregeln.
- `UserSettings.timeOffsetMinutes`: einfache Admin-Zeitkorrektur für die angezeigte Systemzeit.
- `Profile`: Profilfelder.
- `Profile.imageUrl`: geschütztes Profilbild über `/api/files/<id>`.
- `Circle`: Paar-/Gruppenkreis; Mitglieder sehen gemeinsame Inhalte.
- `FileAsset`: geschützte Upload-Datei.
- `Toy`: Spielzeug mit Slug, Bild, Beschreibung und `sortOrder`.
- `Position`: Szene mit Slug, Bild, Beschreibung, `sortOrder` und `selfBondageCapable`.
- `ActivityPlan`: Aktivität mit Status, Termin, Spielzeugen und Szenen. Statuswerte: `REQUESTED`, `PLANNED`, `DONE`, `DISCARDED`.
- `ActivityImage`: geschützter Bildanhang für Ideen aus der Ideensammlung; gehört direkt zu `ActivityPlan` und `FileAsset`, nicht zu Alben.
- `SegufixSession`: Session-Tracking.
- `KgSession`: KG-Tragezeit-Tracking mit Start, Ende, Dauer und Notiz.
- `Album`: Bilderalbum mit Standardsichtbarkeit.
- `Media`: Bild oder Video; neue Bilder werden immer einem Album zugeordnet, standardmäßig dem persönlichen Hauptalbum des Benutzers. `Media.visibility` ist optional: `null` bedeutet, dass die Sichtbarkeit des Albums gilt; ein gesetzter Wert überschreibt das Album nur für dieses Bild.
- `MediaComment`: Kommentar oder Notiz zu einem Bild.
- `Event`: Termin.
- `CheckIn`: Teilnahme/Check-in.
- `Message`: Altbestand für Telegram-Dialoggedächtnis und ältere Protokolleinträge; kein aktives Direktnachrichten-Modul.
- `AuditLog`: Protokollierte App-Aktion mit Akteur, Aktion, Zieltyp, Ziel-ID, Titel, optionalen Details und Link.
- `TelegramChat`: erkannte Telegram Chats/Threads.
- `TelegramNotificationRule`: aktionsbasierte Telegram-Regel mit Aktion, Ziel-Benutzer/Ziel-Kreis, HTML-Nachricht und Aktiv-Status.

## Upload-Architektur

1. Formular oder Telegram speichert Datei über `saveUploadedFile` oder `saveFileBuffer`.
2. Datei landet unter `UPLOAD_PATH/<ownerId>/<YYYY-MM-DD>/<uuid>.<ext>`.
3. Datenbankeintrag `FileAsset` enthält Metadaten und relativen Storage-Pfad.
4. App speichert nur `/api/files/<id>` in `imageUrl`, `media.url` oder `message.mediaUrl`; Ideenbilder referenzieren direkt `FileAsset`.
5. `/api/files/[id]` prüft aktuellen User und liefert eigene Dateien sowie Dateien von Kreis-Mitgliedern aus.
6. `deleteOwnedFile` entfernt DB-Eintrag und Datei vom Dateisystem.

UI-Hinweis:

- Upload-Formulare nutzen `FileUploadField`, damit Benutzer auf mobilen Geräten sehen, welche Datei ausgewählt wurde.
- Bei Bildersatz gewinnt eine neu ausgewählte Datei automatisch gegen die Entfernen-Option.
- `next.config.mjs` setzt `experimental.serverActions.bodySizeLimit` auf `50mb`, passend zur Upload-Grenze der App.
- Spielzeug- und Szenenbilder werden beim Auswählen direkt an `/api/uploads` gesendet. Die anschließende Server Action speichert nur die zurückgegebene geschützte Datei-URL.
- `ensureDefaultAlbum(ownerId)` in `src/lib/albums.ts` legt bei Bedarf das persönliche Hauptalbum des Benutzers an. Der Albumname kommt aus dem Profil-Anzeigenamen, danach Name, Benutzername oder E-Mail.
- Alte `Standard`- und `Eingang`-Alben werden in dieses persönliche Hauptalbum überführt.
- Bilduploads über Web, Telegram, externe API, Session-Detailseite und Import verwenden dieses Hauptalbum als Fallback.
- Ideenbilder verwenden kein Album und erscheinen nicht in der normalen Bildergalerie.

## Telegram-Aktionsregeln

- `src/lib/notification-actions.ts`: bekannte Aktionen, lesbare Labels und Standardtemplate.
- `src/lib/telegram-notifications.ts`: rendert Templates und sendet passende Telegram-Regeln.
- `src/lib/audit.ts`: ruft nach jedem gespeicherten `AuditLog` den Dispatcher auf.
- `/settings/telegram#notifications`: Admin-Oberfläche zum Erstellen, Bearbeiten und Löschen der Regeln.
- `/settings/telegram?action=<action>#notifications`: öffnet die Aktionsbenachrichtigungen mit vorausgewählter Aktion.
- `/messages`: Protokoll mit Direktlink aus Audit-Einträgen zur passenden Telegram-Aktionsbenachrichtigung.
- Telegram-Befehl `/album_new` startet einen Dialog zum Anlegen eines Albums; `/album_new Name` legt es direkt an.
- `src/app/settings/users/page.tsx`: Admin-Benutzerverwaltung inklusive Kreisen, einklappbarer Systemzeit und Profilbildänderung für Benutzer.
- `src/app/activities/page.tsx`: prominente Spieltermin-Planung und Self-Bondage-Vorbereitungsbereich.
- `src/app/activities/new/page.tsx?template=self-bondage`: vorbelegter Spieltermin mit Self-Bondage-fähigen Szenen.

## Wiederverwendbare UI-Helfer

- `src/components/submit-button.tsx`: Button mit `useFormStatus`, Pending-Text und deaktiviertem Zustand beim Speichern.
- `src/components/username-field.tsx`: Benutzername-Feld mit Blur-Prüfung gegen `/api/users/check-username`.
- `src/components/protocol-search.tsx`: Client-Suche für das Protokoll mit Vorschlägen und Sprunglinks.
- `src/components/quick-album-form.tsx`: Inline-Albumanlage aus der Bilder-Detailansicht heraus.
- `src/components/file-upload-field.tsx`: Gemeinsames Upload-Feld mit Vorschau, optionalem clientseitigem Bildzuschnitt und Ajax-Upload für Katalog-/Profilbilder.
- `src/components/dark-mode-toggle.tsx`: kompakter Dark-Mode-Schalter für Desktop- und Mobile-Einstellungen.
- `src/components/logout-button.tsx`: Client-Logout mit `fetch` und anschließender Navigation zu `/login`.
- `src/app/api/settings/dark-mode/route.ts`: speichert Dark Mode direkt am aktuellen Benutzer.
- `src/components/telegram/notification-target-fields.tsx`: Client-Zielauswahl für Telegram-Regeln ohne widersprüchliche Benutzer-/Kreis-Felder.
- `src/lib/session-actions.ts`: Server Actions für laufende Sessions, aktuell `stopSegufixSession`.

## Sichtbarkeit

- `PRIVATE` wird in der UI als `Nur ich` angezeigt.
- `PARTNER` wird in der UI als `Zirkel` angezeigt.
- `SHARED` wird in der UI als `Alle` angezeigt.
- `visibilityScope(user)` in `src/lib/access.ts` kapselt die allgemeine Datensatz- und Album-Sichtbarkeit.
- `mediaVisibilityScope(user)` berücksichtigt bei Bildern die effektive Sichtbarkeit aus Bild-Override oder Album-Sichtbarkeit.
- Ideenbilder werden über die Zugriffsrechte der zugehörigen Idee und den geschützten Dateiabruf ausgeliefert.
- `ownerScope(user)` bleibt für Bearbeiten, Löschen und Datei-Metadaten massgeblich.
- Admins erhalten über `accessibleOwnerIds` Zugriff auf aktive Benutzer, damit Admin-Ansichten und geschützte Profilbilder konsistent funktionieren.

## Slug-Architektur

- Neue Einträge nutzen `uniqueSlug`.
- Bearbeitete Einträge nutzen `uniqueSlugForUpdate`.
- Slugs erlauben URL-konforme Zeichen und werden aus Titeln normalisiert.
- Wenn ein Slug bereits von einem anderen Datensatz belegt ist, wird `-2`, `-3`, usw. angehängt.

## Tracker-Detailrouten

- Segufix-Sessions nutzen lesbare Slug-URLs unter `/sessions/[slug]`.
- KG-Sessions haben eine Detailroute unter `/sessions/kg/[id]`.
- Historien- und Kalenderansichten verlinken direkt auf diese Detailseiten.
- Segufix-Sessiontexte werden als gemeinsamer `Sessionkommentar` über `SegufixSession.notes` geführt; alte `moodBeforeText`- und `moodAfterText`-Werte werden nur noch in diesen Kommentar eingebettet.
- Laufende eigene Segufix-Sessions können per Server Action beendet werden; dabei wird `endTime` auf jetzt gesetzt und `durationMinutes` neu berechnet.

## Bearbeiten/Löschen

Bearbeiten und Löschen sind als Server Actions in den jeweiligen `edit/page.tsx` Dateien umgesetzt. Jede Action:

1. liest `currentUser`.
2. redirectet ohne Login nach `/login`.
3. sucht den Datensatz mit `ownerId`.
4. nutzt `notFound`, wenn der Datensatz nicht zum User gehört.
5. aktualisiert oder löscht den Datensatz.
6. redirectet zur passenden Seite.

Bei Spielzeug/Szene wird beim Bildersatz oder Löschen die alte Upload-Datei über `deleteOwnedFile` entfernt.
