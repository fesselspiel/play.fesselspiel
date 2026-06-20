# Reproduktion und Deployment

## Lokale Reproduktion

Voraussetzungen:

- Docker
- Docker Compose
- Node.js nur dann nötig, wenn ohne Docker entwickelt wird

Start:

```bash
cp .env.example .env
docker compose up -d
```

Die Anwendung läuft lokal auf:

```text
http://localhost:8097
```

Nützliche Befehle:

```bash
docker compose build app
docker compose up -d app
docker compose logs -f app
docker compose exec app npx prisma db push
docker compose exec app node prisma/seed.js
```

## Environment

Wichtige Variablen:

```text
APP_URL=https://playplaner.com
APP_HOST=0.0.0.0
APP_PORT=8097
DATABASE_URL=postgresql://...
ADMIN_EMAIL=...
ADMIN_USERNAME=...
ADMIN_PASSWORD=...
JWT_SECRET=...
ENCRYPTION_KEY=...
OPENAI_API_KEY=...
OPENAI_TRANSCRIPTION_MODEL=whisper-1
UPLOAD_PATH=/app/uploads
```

Secrets werden nicht in Markdown dokumentiert. Werte stehen in der jeweiligen `.env` auf dem Zielsystem.

## VPS

Beispiel-Zielserver:

```text
IP: x.x.x.x
App-Pfad: /opt/<app-name>
Hauptdomain: playplaner.com
Zweitdomain: play.fesselspiel.com
Container App: kink_social_app
Container DB: kink_social_postgres
Interner Port: 127.0.0.1:8097
```

SSH:

```bash
ssh -o BatchMode=yes -o ConnectTimeout=15 -i ~/.ssh/id_ed25519 root@x.x.x.x
```

Deployment auf dem VPS:

```bash
cd /opt/<app-name>
docker compose build app
docker compose up -d app
```

Runtime-Logs:

```bash
cd /opt/<app-name>
tail -120 runtime-logs/startup.log
```

Container-Status:

```bash
docker compose ps
```

## Smoke-Tests

Login gegen lokalen App-Port auf dem VPS:

```bash
COOKIE=/tmp/fesselspiel-cookie.txt
curl -sS -c "$COOKIE" -H "Content-Type: application/json" \
  -d "{\"identifier\":\"<ADMIN_EMAIL>\",\"password\":\"<ADMIN_PASSWORD>\",\"remember\":false}" \
  http://127.0.0.1:8097/api/auth/login
```

Hauptseiten prüfen:

```bash
for path in /toys /positions /activities /events /sessions /media /messages /profile; do
  curl -sS -b "$COOKIE" -o /dev/null -w "$path %{http_code}\n" "http://127.0.0.1:8097$path"
done
```

Erwartet wird `200` für die Hauptseiten.

## Dateien auf den VPS kopieren

Einzeldatei:

```bash
scp -o BatchMode=yes -o ConnectTimeout=15 -i ~/.ssh/id_ed25519 \
  src/components/mobile-menu.tsx \
  root@x.x.x.x:/opt/<app-name>/src/components/mobile-menu.tsx
```

Nach dem Kopieren immer builden und neu starten:

```bash
ssh -o BatchMode=yes -o ConnectTimeout=15 -i ~/.ssh/id_ed25519 root@x.x.x.x \
  'cd /opt/<app-name> && docker compose build app && docker compose up -d app'
```

## Uploads

Uploads werden im Container unter `UPLOAD_PATH` gespeichert, standardmäßig:

```text
/app/uploads
```

In Docker Compose ist das ein persistentes Volume:

```text
uploads_data:/app/uploads
```

Die App speichert Dateien benutzerbezogen in Unterordnern und gibt sie nicht als statische Dateien aus. Der Zugriff läuft über:

```text
/api/files/[id]
```

Der Endpunkt prüft Login und Eigentum der Datei.

Wichtig auf dem VPS: Vor der App läuft Nginx. Für iPhone-Fotos und andere Uploads muss in beiden Nginx-Sites (`playplaner.com` und `play.fesselspiel.com`) ein ausreichend großes Limit gesetzt sein:

```nginx
server {
    server_name playplaner.com;
    client_max_body_size 50m;
    ...
}

server {
    server_name play.fesselspiel.com;
    client_max_body_size 50m;
    ...
}
```

Nach Änderungen:

```bash
nginx -t
systemctl reload nginx
```

## Telegram-Bot

Bot-Token und OpenAI-Key werden in der Weboberflaeche unter Telegram-Einstellungen hinterlegt und verschlüsselt gespeichert.

Webhook setzen oder löschen:

- UI: `/settings/telegram`
- API: `/api/telegram/webhook-config`

Weitere Telegram-Endpunkte:

- `/api/telegram/webhook`
- `/api/telegram/updates`
- `/api/telegram/chats`
- `/api/telegram/send`
- `/api/telegram/webhook-info`
