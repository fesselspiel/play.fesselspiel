# Projektüberblick

## Ziel

`play.fesselspiel.com` ist eine private Webanwendung für Einzelpersonen und Paare. Die Plattform dient der persönlichen Dokumentation, Organisation und Automatisierung von Profilen, Bildern, Sessions, Spielzeugen, Stellungen, Aktivitäten und Telegram-Interaktion.

## Technische Basis

- Framework: Next.js 14 App Router
- Sprache: TypeScript
- Styling: Tailwind CSS mit CSS-Variablen für Themes
- Datenbank: PostgreSQL
- ORM: Prisma
- Auth: eigene Cookie/JWT-basierte Anmeldung
- Deployment: Docker Compose auf VPS
- Reverse Proxy: Docker-kompatibel, aktuell per externem HTTPS-Proxy vor dem App-Container
- Hauptdomain: `https://play.fesselspiel.com`
- Interner App-Port: `8097`

## Design

Die Ursprungsvorgabe war ein helles, modernes, minimalistisches Mobile-First-Design mit kräftigem Rot als Primärfarbe. Spaeter wurde ein Theme-System eingebaut.

Aktuelle Design-Eigenschaften:

- helle Oberfläche mit Karten und Panels
- rote Standard-Akzente
- große Touchflächen
- klare Typografie
- lucide-react Icons
- mobile Hamburger-Navigation
- Theme Changer in den Benutzereinstellungen
- Themes mit passenden Hintergrund-, Flächen-, Akzent- und Hoverfarben

## Module

### Benutzer und Profile

- Login mit Benutzerkonto
- Benutzerverwaltung für Admins
- Profilseite mit frei erweiterbaren Profilinformationen
- benutzerbezogene Einstellungen inklusive Theme

### Protokoll

- Protokoll für App-Aktionen und Telegram-Ereignisse
- gruppierte Ansicht nach Tagen und Stunden
- Suche mit Vorschlägen und Sprunglinks
- alte Nachrichten-Einträge werden nur noch als Altprotokoll angezeigt
- Direktnachrichten sind kein aktives Hauptmodul mehr

### Events

- Events anlegen
- Events bearbeiten
- Events löschen
- Check-ins mit Notiz

### Bilder

- Upload von Bildern und Videos
- Alben
- Sichtbarkeiten
- geschützte Dateiauslieferung über `/api/files/[id]`
- Bilderseite als Galerie mit Spotlight, Metadaten, Album-Gruppierung und Upload-Bereich
- Bilder löschen inklusive Entfernen der Datei vom Server

### Session-Tracking

- Segufix-Sessions erfassen
- Startzeit, Endzeit, Dauerberechnung
- Stimmung vorher/nachher plus Sessionkommentar
- Jahreskalender mit 12 Monaten und Tagesfeldern
- Historie und Auswertungswerte
- Sessions bearbeiten
- Sessions löschen
- KG-Time-Tracker als zweiter Tracker mit eigener Historie und Detailseiten

### Spielzeugkatalog

- Spielzeuge anlegen
- Slug-basierte Detailseiten
- automatische Slug-Erzeugung
- manuelle Slug-Bearbeitung
- QR-Code pro Spielzeug
- Spielzeuge bearbeiten
- Spielzeuge löschen
- Bild ersetzen oder entfernen
- Upload-Datei wird beim Ersetzen/Löschen entfernt

### Aktivitäten

- Aktivitäten planen
- Status: angefragt, geplant, durchgeführt, verworfen
- Verknuepfung mit Spielzeugen und Stellungen
- Aktivitäten bearbeiten
- Aktivitäten löschen
- Anfragen können im Kreis bestätigt werden

### Stellungen

- Stellungen anlegen
- Detailseite mit Bild und Beschreibung
- Verknuepfung mit Spielzeugen und Aktivitäten
- Suche und Filter nach Spielzeug
- Stellungen bearbeiten
- Stellungen löschen
- Bild ersetzen oder entfernen
- Upload-Datei wird beim Ersetzen/Löschen entfernt
- Feld `Self-Bondage-fähig` für spätere Filter und Auswertungen

### Telegram

- Bot-Token und OpenAI-Key verschlüsselt in UserSettings
- Chat-/Thread-Erkennung
- Webhook-Konfiguration
- Bot-Agent mit OpenAI
- Antwort auf natürliche Sprache
- Kurzzeitgedächtnis über die letzten Nachrichten
- Dialoge zum Anlegen von Spielzeugen und Stellungen
- Bildupload im Telegram-Chat für laufende Dialoge
- freier Telegram-Bildupload wird automatisch als Bild gespeichert
- Zuordnung von Telegram-Benutzern zu App-Benutzern
- Aktionsbenachrichtigungen per Telegram-Regeln
- erkannte Chats/Threads bleiben zunächst in der App auf `PENDING`
- Freigabe ist threadgenau oder für den ganzen Telegram-Chat möglich

## URL-Konzept

Öffentliche, lesbare URLs nutzen Slugs:

- `/toys/leder-manschetten`
- `/positions/rueckenlage`
- `/activities/entspannungsabend`

Intern hat jeder Datensatz eine ID. Slugs sind bearbeitbar und werden eindeutig gemacht. Edit-Routen liegen darunter:

- `/toys/[slug]/edit`
- `/positions/[slug]/edit`
- `/activities/[slug]/edit`

Events und Sessions nutzen für Bearbeitung ihre interne ID:

- `/events/[id]/edit`
- `/sessions/[id]/edit`
