# Dateien und Architektur

## Top-Level

- `README.md`: kurzer Einstieg.
- `docs/`: ausfuehrliche reproduzierbare Projektdokumentation.
- `Dockerfile`: Production-Build fuer Next.js.
- `docker-compose.yml`: App, PostgreSQL, Volumes, Traefik-Labels.
- `docker-entrypoint.sh`: DB-Push, Seed und App-Start mit Logausgabe.
- `.env.example`: Beispielkonfiguration ohne echte Secrets.
- `package.json`: Scripts und Dependencies.
- `prisma/schema.prisma`: Datenmodell.
- `prisma/seed.js`: Initialer Admin und Basisdaten.

## Zentrale Libraries

- `src/lib/auth.ts`: Login, Session, aktueller User.
- `src/lib/access.ts`: Kreisbasierte Zugriffshilfen fuer gemeinsame Paar-/Gruppendaten.
- `src/lib/prisma.ts`: Prisma Client.
- `src/lib/crypto.ts`: Verschluesselung fuer Bot/API Keys.
- `src/lib/env.ts`: Environment-Parsing.
- `src/lib/files.ts`: Upload speichern, FileAsset-URL, Datei-ID aus URL, Datei loeschen.
- `src/lib/slug.ts`: Slugify, normalizeSlug, uniqueSlug, uniqueSlugForUpdate.
- `src/lib/dates.ts`: Datumsformatierung, `datetime-local`, Dauerberechnung.
- `src/lib/audit.ts`: Fehlertolerantes Schreiben von Audit-/Protokolleintraegen.
- `src/lib/moods.ts`: Labels und Scores fuer Session-Stimmungen.
- `src/lib/themes.ts`: Theme-Definitionen.
- `src/lib/telegram.ts`: Telegram API, Webhook, Updates, Datei-Download.
- `src/lib/telegram-agent.ts`: OpenAI-Agent und Aktionslogik.
- `src/lib/telegram-item-dialogue.ts`: Dialogstatus und Felder fuer Item-Anlage.

Telegram-Formatierung:

- `sendTelegramMessage` unterstuetzt optional `parseMode: "HTML"` und `disableWebPagePreview`.
- `telegramHtml` escaped nutzergenerierte Inhalte fuer Telegram-HTML.
- `telegramLink` erzeugt klickbare Telegram-HTML-Links.
- Bei HTML-Sendefehlern faellt `sendTelegramMessage` automatisch auf Plain Text zurueck.

## Komponenten

- `src/components/app-shell.tsx`: Grundlayout, Desktop-Sidebar, MobileMenu.
- `src/components/copy-link.tsx`: Kleine Client-Komponente zum Kopieren dezenter, sichtbarer Links ohne Textauswahl.
- `src/components/file-upload-field.tsx`: Sichtbarer Datei-Upload mit Dateiname, Groesse, Bildvorschau und optionaler Entfernen-Checkbox.
- `src/components/mobile-menu.tsx`: Hamburger-Menue fuer mobile Ansicht.
- `src/components/login-form.tsx`: Loginformular mit Passwort-Auge.
- `src/components/theme-picker.tsx`: Theme-Auswahl mit Sofortvorschau.
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

### Stellungen

- `src/app/positions/page.tsx`
- `src/app/positions/new/page.tsx`
- `src/app/positions/[slug]/page.tsx`
- `src/app/positions/[slug]/edit/page.tsx`

### Aktivitaeten

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

### Medien und Protokoll

- `src/app/media/page.tsx`
- `src/app/messages/page.tsx`: Protokollseite unter Einstellungen, gruppiert App-Aktionen und alte Telegram-/Nachrichten-Eintraege.
- `src/app/api/files/[id]/route.ts`
- `src/app/api/uploads/route.ts`

### Einstellungen

- `src/app/profile/page.tsx`
- `src/app/settings/users/page.tsx`
- `src/app/settings/telegram/page.tsx`

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

## Prisma-Modelle

- `User`: Account, Rolle, Login, Beziehungen.
- `UserSettings`: Theme, Dark Mode, Spielampel-Status, Telegram/OpenAI Secrets, Telegram Chats.
- `Profile`: Profilfelder.
- `Circle`: Paar-/Gruppenkreis; Mitglieder sehen gemeinsame Inhalte.
- `FileAsset`: geschuetzte Upload-Datei.
- `Toy`: Spielzeug mit Slug, Bild, Beschreibung.
- `Position`: Stellung mit Slug, Bild, Beschreibung.
- `ActivityPlan`: Aktivitaet mit Status, Termin, Spielzeugen und Stellungen.
- `SegufixSession`: Session-Tracking.
- `Album`: Medienalbum.
- `Media`: Bild oder Video.
- `MediaComment`: Kommentar oder Notiz zu einem Medium.
- `Event`: Termin.
- `CheckIn`: Teilnahme/Check-in.
- `Message`: Altbestand fuer Telegram-/Nachrichtenverlauf.
- `AuditLog`: Protokollierte App-Aktion mit Akteur, Aktion, Zieltyp, Ziel-ID, Titel, optionalen Details und Link.
- `TelegramChat`: erkannte Telegram Chats/Threads.

## Upload-Architektur

1. Formular oder Telegram speichert Datei ueber `saveUploadedFile` oder `saveFileBuffer`.
2. Datei landet unter `UPLOAD_PATH/<ownerId>/<YYYY-MM-DD>/<uuid>.<ext>`.
3. Datenbankeintrag `FileAsset` enthaelt Metadaten und relativen Storage-Pfad.
4. App speichert nur `/api/files/<id>` in `imageUrl`, `media.url` oder `message.mediaUrl`.
5. `/api/files/[id]` prueft aktuellen User und liefert eigene Dateien sowie Dateien von Kreis-Mitgliedern aus.
6. `deleteOwnedFile` entfernt DB-Eintrag und Datei vom Dateisystem.

UI-Hinweis:

- Upload-Formulare nutzen `FileUploadField`, damit Benutzer auf mobilen Geraeten sehen, welche Datei ausgewaehlt wurde.
- Bei Bildersatz gewinnt eine neu ausgewaehlte Datei automatisch gegen die Entfernen-Option.
- `next.config.mjs` setzt `experimental.serverActions.bodySizeLimit` auf `50mb`, passend zur Upload-Grenze der App.
- Spielzeug- und Stellungsbilder werden beim Auswaehlen direkt an `/api/uploads` gesendet. Die anschliessende Server Action speichert nur die zurueckgegebene geschuetzte Datei-URL.

## Slug-Architektur

- Neue Eintraege nutzen `uniqueSlug`.
- Bearbeitete Eintraege nutzen `uniqueSlugForUpdate`.
- Slugs erlauben URL-konforme Zeichen und werden aus Titeln normalisiert.
- Wenn ein Slug bereits von einem anderen Datensatz belegt ist, wird `-2`, `-3`, usw. angehaengt.

## Bearbeiten/Loeschen

Bearbeiten und Loeschen sind als Server Actions in den jeweiligen `edit/page.tsx` Dateien umgesetzt. Jede Action:

1. liest `currentUser`.
2. redirectet ohne Login nach `/login`.
3. sucht den Datensatz mit `ownerId`.
4. nutzt `notFound`, wenn der Datensatz nicht zum User gehoert.
5. aktualisiert oder loescht den Datensatz.
6. redirectet zur passenden Seite.

Bei Spielzeug/Stellung wird beim Bildersatz oder Loeschen die alte Upload-Datei ueber `deleteOwnedFile` entfernt.
