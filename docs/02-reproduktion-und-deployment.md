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

Beim Start führt `docker-entrypoint.sh` automatisch `prisma db push` und `node prisma/seed.js` aus. Der Seed enthält auch den Backfill für Seiten-/Mandantenfähigkeit: vorhandene Benutzer werden in `TenantMembership` übernommen und bestehende Inhalte bekommen eine `tenantId`.

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
EMAIL_SMTP_HOST=postfix
EMAIL_SMTP_PORT=25
EMAIL_POSTFIX_HOSTNAME=playplaner.com
EMAIL_ALLOWED_SENDER_DOMAINS=playplaner.com
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
Container Mail: kink_social_postfix
Interner Port: 127.0.0.1:8097
```

Domains:

- `playplaner.com` ist die Hauptdomain.
- `play.fesselspiel.com` bleibt als Zweitdomain ohne Weiterleitung aktiv.
- Seiten/Mandanten können ohne eigene Domain über `https://playplaner.com/seite/<kurzname>/...` geöffnet werden.
- Auf dem VPS ist Nginx für `*.playplaner.com` auf HTTP als Catch-all konfiguriert, damit neue Subdomains für ACME HTTP-01 erreichbar sind.
- Für eine konkrete Subdomain wird auf dem VPS `playplaner-enable-subdomain <subdomain.playplaner.com>` ausgeführt. Das Skript erstellt per Certbot ein Zertifikat, legt einen HTTPS-Nginx-Block an und lädt Nginx neu.

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

Mandanten-/Seiten-Check nach Deploy:

```bash
docker compose exec app node - <<'NODE'
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true, name: true } });
  for (const tenant of tenants) {
    const counts = {
      members: await prisma.tenantMembership.count({ where: { tenantId: tenant.id } }),
      toys: await prisma.toy.count({ where: { tenantId: tenant.id } }),
      positions: await prisma.position.count({ where: { tenantId: tenant.id } }),
      activities: await prisma.activityPlan.count({ where: { tenantId: tenant.id } }),
      sessions: await prisma.segufixSession.count({ where: { tenantId: tenant.id } }),
      kg: await prisma.kgSession.count({ where: { tenantId: tenant.id } }),
      media: await prisma.media.count({ where: { tenantId: tenant.id } }),
      albums: await prisma.album.count({ where: { tenantId: tenant.id } })
    };
    console.log(tenant.slug, counts);
  }
})().finally(() => prisma.$disconnect());
NODE
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

## E-Mail und Postfix

Postfix läuft als eigener Docker-Service im gleichen Compose-Projekt. Die App versendet intern per SMTP an:

```text
postfix:25
```

Die Verwaltung erfolgt im Admin-Bereich unter:

```text
/settings/email
```

Wichtig:

- E-Mail-Versand ist standardmäßig deaktiviert.
- Zusätzlich muss jedes Template einzeln aktiviert werden.
- Der Container-Entrypoint führt `prisma db push --accept-data-loss --skip-generate` aus, damit neue Tabellen/Constraints beim Docker-Start synchronisiert werden.
- Benutzer-Einladungen bestätigen ihre E-Mail über `/email/confirm`.
- Passwort-Reset läuft über `/password/forgot` und `/password/reset`.
- Aktions-E-Mails werden unter `/settings/email#notifications` konfiguriert und verwenden die protokollierten Aktionen aus dem Audit-Log.
- Für verlässliche Zustellung nach außen müssen DNS/SPF/DKIM/Reverse-DNS passend zur Domain gepflegt werden.
- Operative Testmails dürfen nicht an die frühere Yahoo-Testadresse gesendet werden. Für künftige Mailtests ist `playplaner@mx.fesselspiel.com` zu verwenden.

## Reproduzierbare Node-Abhaengigkeiten

- `package-lock.json` gehoert zum Repository und muss gemeinsam mit `package.json` aktualisiert werden.
- Lokale und CI-Installationen verwenden `npm ci`; im Produktions-Runner wird `npm ci --omit=dev` verwendet.
- Ein Deployment darf nicht auf `npm install` zurueckfallen, weil dadurch transitive Versionen vom geprueften Build abweichen koennen.
- Vor einem Backend-Deploy mindestens `npm audit --omit=dev`, den vollstaendigen Docker-Produktionsbuild und `git diff --check` ausfuehren.

## Docker-Speicher vor Builds

- Vor jedem Serverbuild `df -h /` pruefen. Ein voll belegter Host kann einen bereits erfolgreich kompilierten Build erst beim Image-Export abbrechen lassen.
- Nur unreferenzierte Builddaten bereinigen. Laufende Container und persistente Volumes duerfen nicht entfernt werden.
- Konservativer erster Schritt: `docker image prune -f`. Den belegten und freien Speicher danach erneut pruefen.
- Vor produktivem Recreate weiterhin einen Datenbank-Dump anlegen. Bei einem dateibasierten Overlay nur versionierte geaenderte Dateien ueberschreiben, damit parallele serverseitige Agentenarbeit nicht geloescht wird.
