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

Aktuell bereitgestellte Tools:

- `portal_health`
- `portal_me`
- `list_connectors`
- `call_connector`
- `get_portal_status`
- `search_all`
- `integration_api_request`
- `public_link`

`list_connectors` beschreibt die verfügbaren Playplaner-Kontexte: Portal, Chat, Katalog, Bondage-System, Spielplanung, Aufträge, Ideen, Tracker, Bilder, Events, Wiki, Packlisten, Einladungen und Admin.

`call_connector` ruft bekannte Connectoren anhand ihrer ID auf.

`integration_api_request` ist ein kontrollierter Fallback. Er erlaubt nur relative Pfade unter `/api/external/...` und keine externen URLs.

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
