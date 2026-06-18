# Kink Social Platform

Private Webanwendung fuer Paare und Einzelpersonen zur Dokumentation, Planung und Organisation.

## Start lokal

```bash
cp .env.example .env
docker compose up -d
```

Die Anwendung laeuft lokal auf `http://localhost:8097`.

## Deployment

- Domain: `play.fesselspiel.com`
- Reverse Proxy: Traefik-Labels sind in `docker-compose.yml` vorbereitet.
- Persistenz: PostgreSQL-Volume und Upload-Volume.
- Initialer Admin kommt aus `.env`: `ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.

## Module

- Login und Benutzerverwaltung mit Admin/User-Rollen
- Direktnachrichten mit Medienreferenzen
- Events mit Check-ins
- Medien, Alben und Sichtbarkeiten
- Segufix-Session-Tracking mit Jahreskalender und Auswertungen
- Spielzeugkatalog mit Slugs und QR-Codes
- Aktivitaetsplanung mit Spielzeug- und Stellungs-Verknuepfung
- Positionen/Stellungen mit Suche und Spielzeugfilter
- Telegram-Konfiguration mit Bot-Token, Chat-Erkennung und Voice-Transkriptionsvorbereitung

## Ausfuehrliche Dokumentation

Die reproduzierbare Projektdokumentation liegt unter [`docs/`](./docs/README.md).

Wenn neue Features, Routen, Datenmodelle, Deployment-Schritte oder Prompts dazukommen, sollen die passenden Dateien in `docs/` direkt mit aktualisiert werden.
