---
name: vps-docker-webapp-deploy
description: Deploy and operate a web application on the existing VPS at 109.199.107.55 using Docker Compose, Nginx reverse proxy, Certbot TLS, protected uploads, optional Postfix-in-Docker, cron sidecars, and the established Codex workflow. Use when creating, migrating, deploying, debugging, or documenting a new website in this VPS environment.
metadata:
  short-description: Deploy Docker web apps to the VPS
---

# VPS Docker Webapp Deploy

Use this skill for a new or existing website that should run on the same VPS pattern: source in `/opt`, app isolated in Docker Compose, Nginx on the host, TLS via Certbot, and all application dependencies inside containers.

## Environment

- VPS IP: `109.199.107.55`
- SSH: `ssh root@109.199.107.55`
- App base path pattern: `/opt/<project-name>`
- App port pattern: choose an unused host port and bind only to loopback, e.g. `127.0.0.1:<host-port>:<container-port>`
- Reverse proxy: host Nginx terminates TLS and proxies to Docker app port.
- TLS: Certbot certificates under `/etc/letsencrypt/live/<domain>/`.
- Domain pattern: one or more real domains pointing to `109.199.107.55`.
- Container naming pattern: `<project-slug>_app`, `<project-slug>_postgres`, `<project-slug>_postfix`, `<project-slug>_cron`.

## Non-Negotiables

- Install application dependencies only inside Docker images/containers.
- Do not install Node packages, app runtimes, app services, or project-specific tools directly on the VPS host.
- Host-level changes are limited to Nginx, Certbot, firewall/DNS checks, Docker/Compose operation, and files under `/opt/<project-name>`.
- Preserve `.env`, `.env.*`, `runtime-logs`, uploads, and Docker volumes during source syncs unless the user explicitly asks otherwise.
- Git locally when sensible. Push to GitHub only when explicitly requested.
- Never put secrets into repo docs, commits, skills, or shell history intentionally. Use `.env` on the VPS.

## Recommended App Shape

Use this structure unless the project has a strong reason not to:

```text
Dockerfile
docker-compose.yml
docker-entrypoint.sh
prisma/schema.prisma
prisma/seed.js
src/
public/
.env.example
```

Reference service layout:

- `app`: web app, built from local Dockerfile.
- `postgres`: `postgres:16-alpine`, named volume for database, if the app uses PostgreSQL.
- `postfix`: `boky/postfix:latest` for local SMTP relay inside Docker, if the app sends mail.
- `cron`: tiny Alpine/curl sidecar calling app cron endpoints, if the app needs scheduled tasks.
- `uploads_data`: Docker volume mounted at `/app/uploads`.
- `runtime-logs`: bind mount to `/app/logs` for startup/app logs.

The app should expose its internal port, but Compose should bind it only to localhost:

```yaml
ports:
  - "127.0.0.1:${APP_PORT:-<host-port>}:<container-port>"
```

## Environment Variables

Use `.env.example` as a template, then create `.env` only on the VPS.

Core variables:

```dotenv
APP_URL=https://<domain>
APP_HOST=0.0.0.0
APP_PORT=<container-port>

POSTGRES_DB=<db-name>
POSTGRES_USER=<db-user>
POSTGRES_PASSWORD=<secret>
DATABASE_URL=postgresql://<db-user>:<secret>@postgres:5432/<db-name>

ADMIN_EMAIL=<admin-email>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<secret>
JWT_SECRET=<long-secret>
ENCRYPTION_KEY=<long-secret>

UPLOAD_PATH=/app/uploads
MAX_UPLOAD_BYTES=52428800

EMAIL_SMTP_HOST=postfix
EMAIL_SMTP_PORT=25
EMAIL_POSTFIX_HOSTNAME=<domain>
EMAIL_ALLOWED_SENDER_DOMAINS=<domain>

CRON_SECRET=<long-secret>
```

For OpenAI, Telegram, Shopify, payment providers, or other integrations, keep tokens in the app database encrypted with `ENCRYPTION_KEY` or in `.env` only when the app explicitly expects them there.

## Dockerfile Pattern

Use a multi-stage Dockerfile:

1. `deps`: install Node dependencies.
2. `builder`: copy source, run `npx prisma generate`, run `npm run build`.
3. `runner`: install production dependencies, copy `.next`, `public`, `prisma`, `src`, config, generate Prisma client, run through `tini`.

Do not rely on host `node_modules`.

## Entrypoint Pattern

At container startup:

```sh
npx prisma db push --accept-data-loss --skip-generate
node prisma/seed.js
npm start
```

Write startup output to `/app/logs/startup.log`. This makes schema changes reproducible in Docker and keeps host setup minimal.

Use `--accept-data-loss` only for private fast-iteration workflows. For production-grade customer data, replace this with explicit migrations.

## Nginx Reverse Proxy

Create one site file per primary domain under `/etc/nginx/sites-available/<domain>` and symlink into `/etc/nginx/sites-enabled/`.

HTTPS server block pattern:

```nginx
server {
    server_name <domain>;
    client_max_body_size 50m;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        proxy_pass http://127.0.0.1:<host-port>;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    listen 443 ssl;
    listen [::]:443 ssl;
    ssl_certificate /etc/letsencrypt/live/<domain>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<domain>/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}
```

HTTP/catch-all pattern for base and subdomains when DNS catch-all points to the VPS:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name <domain> *.<domain>;
    client_max_body_size 50m;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        proxy_pass http://127.0.0.1:<host-port>;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Validate and reload:

```sh
nginx -t && systemctl reload nginx
```

Issue certificates:

```sh
certbot --nginx -d <domain>
```

For subdomains without DNS API access, use DNS catch-all plus HTTP challenge only for hostnames that resolve to the VPS. Wildcard TLS usually needs DNS challenge; do not assume Certbot can issue `*.example.com` via HTTP.

## Deploy Workflow From Codex Workspace

Run from the project root.

1. Build locally in Docker:

```sh
docker build -t <project>-local-check .
```

2. Sync source to VPS while preserving environment and runtime state:

```sh
ssh root@109.199.107.55 'find /opt/<project-name> -mindepth 1 ! -name .env ! -name ".env.*" ! -name runtime-logs -exec rm -rf {} +'
tar --exclude='./.git' --exclude='./node_modules' --exclude='./.next' --exclude='./runtime-logs' --exclude='./uploads' -czf - . \
  | ssh root@109.199.107.55 'mkdir -p /opt/<project-name> && tar -xzf - -C /opt/<project-name>'
```

3. Rebuild and restart on VPS:

```sh
ssh root@109.199.107.55 'cd /opt/<project-name> && docker compose up -d --build'
```

If Compose prints a stale-container error like `No such container: 8c968...`, check whether the new app container started before treating it as fatal:

```sh
ssh root@109.199.107.55 'cd /opt/<project-name> && docker compose ps'
ssh root@109.199.107.55 'docker ps --format "{{.Names}} {{.Status}}" | grep <container-prefix>'
```

4. Verify HTTP:

```sh
curl -I -k -s https://<domain>/login | head -8
```

5. Check app logs directly if Compose logs hits the stale-container issue:

```sh
ssh root@109.199.107.55 'docker logs --tail=120 <app-container-name>'
ssh root@109.199.107.55 'tail -120 /opt/<project-name>/runtime-logs/startup.log'
```

## Telegram Webhook Pattern

For tenant/bot-specific webhooks, use:

```text
https://<domain>/api/telegram/webhook?<app-specific-bot-query>
```

Check webhook:

```sh
curl -s "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

Set webhook from a trusted environment only:

```sh
curl -s -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://<domain>/api/telegram/webhook?<app-specific-bot-query>","allowed_updates":["message","edited_message","channel_post","chat_member","my_chat_member"]}'
```

Bots can only send private messages after the user opens the bot and sends `/start`.

## Operational Checks

Container state:

```sh
ssh root@109.199.107.55 'cd /opt/<project-name> && docker compose ps'
```

Database inspection through app container:

```sh
ssh root@109.199.107.55 'docker exec -i <app-container-name> node' <<'NODE'
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  console.log(await prisma.user.count());
})().finally(() => prisma.$disconnect());
NODE
```

Postgres shell:

```sh
ssh root@109.199.107.55 'docker exec -it <postgres-container-name> psql -U <db-user> -d <db-name>'
```

Nginx checks:

```sh
ssh root@109.199.107.55 'nginx -t && systemctl status nginx --no-pager'
```

TLS checks:

```sh
ssh root@109.199.107.55 'certbot certificates'
```

## Creating A New Website

1. Pick `<project-name>`, `<domain>`, `<app-port>`, and unique container names.
2. Copy the Docker/Compose/entrypoint pattern.
3. Create `/opt/<project-name>/.env` on the VPS with real secrets.
4. Add Nginx site for `<domain>` and proxy to `127.0.0.1:<app-port>`.
5. Point DNS A/AAAA or CNAME to `109.199.107.55`.
6. Issue Certbot certificate.
7. Deploy source with the tar-over-SSH workflow.
8. Run `docker compose up -d --build`.
9. Verify `/login`, logs, database schema, uploads, email, cron, and Telegram webhooks.

Keep each website isolated by app path, Compose project/container names, database volume, upload volume, port, `.env`, Nginx site file, and domain.
