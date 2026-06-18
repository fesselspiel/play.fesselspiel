# Projektueberblick

## Ziel

`play.fesselspiel.com` ist eine private Webanwendung fuer Einzelpersonen und Paare. Die Plattform dient der persoenlichen Dokumentation, Kommunikation und Organisation von Profilen, Medien, Sessions, Spielzeugen, Stellungen, Aktivitaeten, Events und Telegram-Interaktion.

## Technische Basis

- Framework: Next.js 14 App Router
- Sprache: TypeScript
- Styling: Tailwind CSS mit CSS-Variablen fuer Themes
- Datenbank: PostgreSQL
- ORM: Prisma
- Auth: eigene Cookie/JWT-basierte Anmeldung
- Deployment: Docker Compose auf VPS
- Reverse Proxy: Traefik
- Hauptdomain: `https://play.fesselspiel.com`
- Interner App-Port: `8097`

## Design

Die Ursprungsvorgabe war ein helles, modernes, minimalistisches Mobile-First-Design mit kraeftigem Rot als Primaerfarbe. Spaeter wurde ein Theme-System eingebaut.

Aktuelle Design-Eigenschaften:

- helle Oberflaeche mit Karten und Panels
- rote Standard-Akzente
- grosse Touchflaechen
- klare Typografie
- lucide-react Icons
- mobile Hamburger-Navigation
- Theme Changer in den Benutzereinstellungen
- Themes mit passenden Hintergrund-, Flaechen-, Akzent- und Hoverfarben

## Module

### Benutzer und Profile

- Login mit Benutzerkonto
- Benutzerverwaltung fuer Admins
- Profilseite mit frei erweiterbaren Profilinformationen
- benutzerbezogene Einstellungen inklusive Theme

### Messaging

- Direktnachrichten
- Medienanhang per Upload
- Loeschen von Nachrichten
- zugehoerige Upload-Datei wird beim Loeschen entfernt

### Events

- Events anlegen
- Events bearbeiten
- Events loeschen
- Check-ins mit Notiz

### Medien

- Upload von Bildern und Videos
- Alben
- Sichtbarkeiten
- geschuetzte Dateiauslieferung ueber `/api/files/[id]`
- Medienseite als Galerie mit Spotlight, Metadaten, Album-Gruppierung und Upload-Bereich
- Medien loeschen inklusive Entfernen der Datei vom Server

### Session-Tracking

- Segufix-Sessions erfassen
- Startzeit, Endzeit, Dauerberechnung
- Stimmung vorher/nachher plus Freitext
- Jahreskalender mit 12 Monaten und Tagesfeldern
- Historie und Auswertungswerte
- Sessions bearbeiten
- Sessions loeschen

### Spielzeugkatalog

- Spielzeuge anlegen
- Slug-basierte Detailseiten
- automatische Slug-Erzeugung
- manuelle Slug-Bearbeitung
- QR-Code pro Spielzeug
- Spielzeuge bearbeiten
- Spielzeuge loeschen
- Bild ersetzen oder entfernen
- Upload-Datei wird beim Ersetzen/Loeschen entfernt

### Aktivitaeten

- Aktivitaeten planen
- Status: geplant, durchgefuehrt, verworfen
- Verknuepfung mit Spielzeugen und Stellungen
- Aktivitaeten bearbeiten
- Aktivitaeten loeschen

### Stellungen

- Stellungen anlegen
- Detailseite mit Bild und Beschreibung
- Verknuepfung mit Spielzeugen und Aktivitaeten
- Suche und Filter nach Spielzeug
- Stellungen bearbeiten
- Stellungen loeschen
- Bild ersetzen oder entfernen
- Upload-Datei wird beim Ersetzen/Loeschen entfernt

### Telegram

- Bot-Token und OpenAI-Key verschluesselt in UserSettings
- Chat-/Thread-Erkennung
- Webhook-Konfiguration
- Bot-Agent mit OpenAI
- Antwort auf natuerliche Sprache
- Kurzzeitgedaechtnis ueber die letzten Nachrichten
- Dialoge zum Anlegen von Spielzeugen und Stellungen
- Bildupload im Telegram-Chat fuer laufende Dialoge
- freier Telegram-Bildupload wird automatisch als Medium gespeichert

## URL-Konzept

Oeffentliche, lesbare URLs nutzen Slugs:

- `/toys/leder-manschetten`
- `/positions/rueckenlage`
- `/activities/entspannungsabend`

Intern hat jeder Datensatz eine ID. Slugs sind bearbeitbar und werden eindeutig gemacht. Edit-Routen liegen darunter:

- `/toys/[slug]/edit`
- `/positions/[slug]/edit`
- `/activities/[slug]/edit`

Events und Sessions nutzen fuer Bearbeitung ihre interne ID:

- `/events/[id]/edit`
- `/sessions/[id]/edit`
