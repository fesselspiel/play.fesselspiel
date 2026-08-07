# MCP-Server

Der Playplaner-MCP-Server läuft als eigener Docker-Container `kink_social_mcp` neben der Anwendung.

Öffentlicher Endpunkt:

```text
https://playplaner.com/mcp
```

Kompatibler Zweitendpunkt:

```text
https://play.fesselspiel.com/mcp
```

Der Container greift nicht direkt auf PostgreSQL, Uploads, Prisma, Dateisysteme oder interne Speicher zu. Er ruft ausschließlich vorhandene geschützte Playplaner-API-Endpunkte unter `/api/external/...` auf und reicht den Bearer Token weiter.

## Docker

Service:

```text
mcp
```

Container:

```text
kink_social_mcp
```

Portbindung:

```text
127.0.0.1:8129 -> 8090
```

Interne App-Adresse:

```text
http://app:8097
```

## Authentifizierung

Der MCP-Server akzeptiert nur:

```http
Authorization: Bearer <Playplaner-API-Token>
```

Tokens werden in Playplaner verwaltet und nicht in `.env` hinterlegt.

Ohne Token antwortet `/mcp` mit `401` und:

```http
WWW-Authenticate: Bearer resource_metadata="https://playplaner.com/.well-known/oauth-protected-resource"
```

## Tools

Bereitgestellte Basistools:

- `portal_health`
- `portal_me`
- `list_connectors`
- `call_connector`
- `get_portal_status`
- `search_all`
- `integration_api_request`
- `public_link`

Zusätzlich erzeugt der MCP-Server aus den vorhandenen `/api/external/...`-Routen dedizierte API-Tools. Der Stand umfasst aktuell:

- 117 externe API-Endpunkte
- 194 konkrete Endpunkt/Methode-Tools
- 202 MCP-Tools insgesamt inklusive Basistools

Namensschema:

```text
api_<methode>_external_<pfad>
```

Beispiele:

- `api_get_external_status`
- `api_get_external_catalog_toys`
- `api_patch_external_catalog_toys_id`
- `api_post_external_trackers_trackerkey_start`
- `api_get_external_events_actions`

Tools mit Pfadparametern verwenden `pathParams`, beispielsweise:

```json
{
  "pathParams": {
    "id": "..."
  }
}
```

Weitere Query-Parameter werden über `query` übergeben, JSON-Daten über `body`. Die MCP-Schicht prüft nur Form und sichere relative Pfade; Berechtigungen, Features, Seiten-/Mandantentrennung und Audit passieren weiterhin in der Playplaner-API.

`list_connectors` beschreibt die verfügbaren Playplaner-Kontexte: Portal, Chat, Katalog, Bondage-System, Spielplanung, Aufträge, Ideen, Tracker, Bilder, Events, Wiki, Packlisten, Einladungen und Admin.

`call_connector` ruft bekannte Connectoren anhand ihrer ID auf.

`integration_api_request` ist ein kontrollierter Fallback. Er erlaubt nur relative Pfade unter `/api/external/...` und keine externen URLs.

## OAuth-Discovery

Für ChatGPT und andere MCP-Clients werden beide Discovery-Dokumente veröffentlicht:

```text
https://playplaner.com/.well-known/oauth-protected-resource
https://playplaner.com/.well-known/oauth-authorization-server
```

Die Metadata ist Host-basiert. Auf der Zweitdomain werden daher `issuer`, `resource` und OAuth-Endpunkte mit `https://play.fesselspiel.com/...` ausgegeben.

Die Authorization-Server-Metadata folgt dem funktionierenden Muster aus dem Immobilienportal:

- `issuer`
- `authorization_endpoint`
- `token_endpoint`
- `registration_endpoint`
- `revocation_endpoint`
- `response_types_supported: ["code"]`
- `grant_types_supported: ["authorization_code"]`
- `code_challenge_methods_supported: ["S256"]`
- `token_endpoint_auth_methods_supported: ["none"]`
- `scopes_supported`

Der MCP-Server liefert die Metadata. Die OAuth-Flussrouten selbst liegen unter `/oauth/...` in der Anwendung:

- `POST /oauth/register` fuer Dynamic Client Registration
- `GET /oauth/authorize` fuer Authorization Code mit PKCE S256
- `POST /oauth/authorize/confirm` fuer die Benutzerfreigabe
- `POST /oauth/token` fuer den Code-gegen-Bearer-Token-Tausch
- `POST /oauth/revoke` zum Widerrufen

Der ausgegebene Access Token ist ein normaler Playplaner-API-Token. Dadurch gelten dieselben Rollen, Seiten, Features und Berechtigungen wie bei den mobilen und externen APIs.

ChatGPT-Kompatibilitaet:

- Dynamic Client Registration ueber `/oauth/register` wird unterstuetzt.
- Wenn ChatGPT stattdessen direkt mit einer ChatGPT-URL als `client_id` in `/oauth/authorize` einsteigt, wird dieser Client wie beim Immobilienportal automatisch registriert.
- Erlaubt sind dabei nur HTTPS-Redirects auf `chatgpt.com` oder `chat.openai.com`.
- `resource` muss zur aktuellen MCP-Domain passen, z. B. `https://playplaner.com/mcp` oder `https://play.fesselspiel.com/mcp`.
- `/oauth/token` akzeptiert `application/x-www-form-urlencoded` und JSON.
- `/oauth/authorize/confirm` leitet mit `303 See Other` zur Client-Redirect-URI zurueck.
- `/oauth/token` liefert eine positive Token-Laufzeit (`expires_in`) statt `0`, damit OAuth-Clients den Token nicht sofort als abgelaufen betrachten.

## MCP-Transport

Der MCP-Endpunkt ist stateless und verarbeitet JSON-RPC ueber `POST /mcp`.

Unterstuetzt werden:

- einzelne JSON-RPC-Requests
- JSON-RPC-Batches
- `initialize`
- `ping`
- `tools/list`
- `tools/call`
- Notifications wie `notifications/initialized`

Notifications ohne Antwort-ID werden nicht als Fehler behandelt. Wenn ein Request oder Batch nur Notifications enthaelt, antwortet der MCP-Server mit `202 Accepted`. Das entspricht dem Verhalten, das ChatGPT beim echten MCP-Handshake erwartet.

## Tests

Health:

```bash
curl -s http://127.0.0.1:8129/health
```

Unauthorized:

```bash
curl -i -X POST https://playplaner.com/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Tools mit Token:

```bash
curl -s -X POST https://playplaner.com/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Status-Tool:

```bash
curl -s -X POST https://playplaner.com/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_portal_status","arguments":{}}}'
```

OAuth-Metadata:

```bash
curl -s https://playplaner.com/.well-known/oauth-protected-resource
curl -s https://playplaner.com/.well-known/oauth-authorization-server
```

Tool-Anzahl:

```bash
curl -s -X POST https://playplaner.com/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Erwartung: mehr als 200 Tools, darunter `api_get_external_status` und die generierten Tools für Katalog, Chat, Tracker, Bilder, Wiki, Aufträge, Packlisten, Push, Punkte, Einladungen und Administration.

## Abnahme am 01.08.2026

- Docker-Build für App und MCP erfolgreich.
- `kink_social_mcp` läuft.
- `/health` meldet `ok: true`.
- Öffentliche Resource-Metadata ist erreichbar.
- `POST /mcp` ohne Token liefert `401`.
- Authentifizierter Smoke-Test mit temporärem Review-Token erfolgreich:
  - `initialize`
  - `tools/list`
  - `get_portal_status`
  - `list_connectors`
- Testsession wurde nach dem Smoke-Test widerrufen.

## Abnahme am 07.08.2026

- Docker-Build fuer App und MCP erfolgreich.
- Live-Metadata fuer `https://playplaner.com` und `https://play.fesselspiel.com` host-korrekt geprueft.
- `POST /mcp` ohne Token liefert `401` mit `WWW-Authenticate`.
- Authentifizierter Smoke-Test mit temporaerem API-Token erfolgreich:
  - `initialize` -> `200`
  - `notifications/initialized` -> `202`
  - JSON-RPC-Batch mit Notification und `tools/list` -> `200`
  - `tools/list` -> `200`
- Toolanzahl lokal geprueft: 202.
- OAuth-Token-Antwort geprueft: `expires_in: 2592000`.
- Temporaere Test-Tokens wurden nach dem Test deaktiviert.
