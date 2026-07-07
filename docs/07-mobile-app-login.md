# Mobile App Login und Event API

Diese Notiz ist die Uebergabe fuer Entwickler der nativen App. Ziel ist, Login, API-Token-Nutzung und push-faehige Ereignisse ohne WebView testen zu koennen.

## Native Anmeldung

Endpunkt:

```http
POST /api/external/auth/login
Content-Type: application/json
```

Body:

```json
{
  "identifier": "gabriel",
  "password": "passwort",
  "deviceName": "Gabriels iPhone"
}
```

Antwort:

```json
{
  "ok": true,
  "token": "fsp_...",
  "tokenType": "Bearer",
  "tokenLastSix": "abc123",
  "user": {
    "id": "user_id",
    "username": "gabriel",
    "email": "gabriel@example.com",
    "name": "Gabriel"
  },
  "tenant": {
    "id": "tenant_id",
    "slug": "playplaner",
    "name": "Playplaner",
    "domain": "playplaner.com"
  },
  "capabilities": []
}
```

Der Login erzeugt einen normalen API-Token fuer die aktuelle Seite. Die App soll diesen Token sicher speichern und danach alle `/api/external/*`-Aufrufe bevorzugt mit Header senden:

```http
Authorization: Bearer fsp_...
```

URL-Token (`?token=...`) bleibt fuer Alexa, Kurzbefehle und einfache Webhooks moeglich, sollte in nativen Apps aber nicht der Standard sein.

Fehler:

- `400 invalid_input`: Body fehlt oder ist ungueltig.
- `401 login_failed`: Benutzername/E-Mail oder Passwort falsch.
- `403 feature_disabled`: Externe API ist fuer die aktuelle Seite nicht aktiv.

## Web-Session Bridge fuer interne Browser

Wenn die App eine Portal-Seite in einem internen Browser oeffnet, besitzt sie zwar den API-Token, aber noch keinen Web-Session-Cookie. Dafuer gibt es einen kurzlebigen Bridge-Endpunkt:

```http
POST /api/external/auth/web-session
Authorization: Bearer fsp_...
Content-Type: application/json
```

Body:

```json
{
  "redirectTo": "/settings/push",
  "ttlSeconds": 120
}
```

Antwort:

```json
{
  "ok": true,
  "url": "https://playplaner.com/api/auth/web-session?token=...",
  "expiresAt": "2026-06-29T12:00:00.000Z",
  "ttlSeconds": 120
}
```

Die App oeffnet `url` im internen Browser. Der Server prueft den signierten Kurzzeit-Token, setzt den normalen `fesselspiel_session` Cookie und leitet auf `redirectTo` weiter. `redirectTo` darf nur ein relativer Pfad sein; externe URLs werden auf `/` reduziert.

## Event Feed fuer Push

Ereignisse basieren auf dem zentralen `AuditLog`. Alles, was im System sauber protokolliert wird, kann damit automatisch in der App sichtbar werden.

Endpunkt:

```http
GET /api/external/events
Authorization: Bearer fsp_...
```

Wichtige Query-Parameter:

- `limit`: 1 bis 200, Standard 50.
- `cursor`: Cursor aus `nextCursor` fuer die naechste Seite.
- `since`: ISO-Zeitstempel, z.B. `2026-06-26T12:00:00.000Z`.
- `action`: kann mehrfach gesetzt werden, z.B. `action=play_ready_changed&action=self_bondage_order_created`.
- `actions`: komma-separierte Alternative zu mehrfach `action`.
- `includeDelivery=1`: zeigt auch Versand-/Delivery-Ereignisse wie E-Mail/Telegram/External-Push-Logs.
- `includeDetails=0`: Details ausblenden, wenn die App nur Uebersicht braucht.

Beispiel:

```http
GET /api/external/events?limit=50&since=2026-06-26T12:00:00.000Z
Authorization: Bearer fsp_...
```

Antwort:

```json
{
  "ok": true,
  "nextCursor": "clx...",
  "count": 1,
  "items": [
    {
      "id": "clx_event_id",
      "action": "play_ready_changed",
      "actionLabel": "Spielampel geaendert",
      "title": "Gabriel ist voll Lust",
      "createdAt": "2026-06-26T12:15:00.000Z",
      "href": "/",
      "url": "https://playplaner.com/",
      "entity": {
        "type": "userSettings",
        "id": "user_id"
      },
      "actor": {
        "id": "user_id",
        "username": "gabriel",
        "displayName": "Gabriel",
        "imageUrl": "/api/files/..."
      },
      "notification": {
        "title": "Gabriel ist voll Lust",
        "body": "Gabriel · Spielampel geaendert",
        "url": "https://playplaner.com/",
        "deepLink": "/"
      },
      "engagement": {
        "likes": [],
        "comments": []
      },
      "details": {}
    }
  ]
}
```

`notification.title`, `notification.body` und `notification.deepLink` sind fuer native Push-Benachrichtigungen gedacht. Wenn fuer die Aktion eine Feed-Regel konfiguriert ist, werden deren Templates verwendet; sonst gelten die Standard-Templates.

## Event Actions

Damit die App Filter, Push-Kategorien oder Debug-Ansichten nicht hart codieren muss, gibt es eine Aktionstypen-Liste.

```http
GET /api/external/events/actions
Authorization: Bearer fsp_...
```

Antwort:

```json
{
  "ok": true,
  "count": 2,
  "actions": [
    {
      "action": "play_ready_changed",
      "label": "Spielampel geaendert",
      "seenCount": 7
    }
  ]
}
```

## Packlisten API

Packlisten sind ein eigenes Feature (`packingLists`) und werden ueber die externe API mit Bearer Token genutzt. Pack-Events sind der organisatorische Rahmen, Packlisten enthalten die konkreten Spielsachen.

```http
GET /api/external/packing/events
Authorization: Bearer fsp_...
```

```http
POST /api/external/packing/events
Authorization: Bearer fsp_...
Content-Type: application/json

{
  "title": "Studioabend",
  "eventId": "optional_event_id",
  "startsAt": "2026-07-10T18:00:00.000Z",
  "visibility": "PARTNER",
  "location": "Studio",
  "description": "Alles fuer den Abend vorbereiten"
}
```

```http
GET /api/external/packing/lists
Authorization: Bearer fsp_...
```

```http
POST /api/external/packing/lists
Authorization: Bearer fsp_...
Content-Type: application/json

{
  "title": "Studio-Tasche",
  "packingEventId": "optional_packing_event_id",
  "eventId": "optional_event_id",
  "visibility": "PARTNER",
  "note": "Ladegeraete nicht vergessen",
  "toyIds": ["toy_id_1", "toy_id_2"]
}
```

Weitere Endpunkte:

- `GET /api/external/packing/events/{id}`: einzelnes Pack-Event lesen.
- `PATCH /api/external/packing/events/{id}`: Pack-Event aendern.
- `DELETE /api/external/packing/events/{id}`: Pack-Event loeschen.
- `GET /api/external/packing/lists/{id}`: einzelne Packliste lesen.
- `PATCH /api/external/packing/lists/{id}`: Packliste aendern.
- `DELETE /api/external/packing/lists/{id}`: Packliste loeschen.
- `POST /api/external/packing/lists/{id}/items`: Spielzeug hinzufuegen. Body: `toyId`, `quantity?`, `note?`.
- `PATCH /api/external/packing/lists/{id}/items/{itemId}`: Packstatus setzen. Body: `packed: true|false`.

Antworten enthalten `progress`, `items`, `packingEvent`, `event`, `owner`, `visibility` und bei Spielzeugen die vorhandenen geschuetzten Bild-URLs.

## Zirkel-Chat

Der Chat ist ein geschuetzter Echtzeit-Chat fuer den aktiven Zirkel des API-Benutzers. Die App nutzt Bearer Token.

### Chat-Zirkel auflisten

```http
GET /api/external/chat/circles
Authorization: Bearer fsp_...
```

Antwortauszug:

```json
{
  "ok": true,
  "count": 2,
  "currentCircleId": "circle_id",
  "circles": [
    {
      "id": "circle_id",
      "name": "Maren & Gabriel",
      "current": true,
      "default": true,
      "memberCount": 2,
      "unreadCount": 1,
      "lastMessage": {
        "id": "message_id",
        "body": "Hallo",
        "createdAt": "2026-07-02T20:00:00.000Z",
        "hasFile": false,
        "fileKind": null,
        "sender": {
          "id": "user_id",
          "displayName": "Gabriel"
        }
      }
    }
  ]
}
```

Normale Benutzer sehen aktuell die Zirkel, in denen sie in der Seite Mitglied sind. Admins sehen alle Zirkel der Seite. Die Chat-Endpunkte akzeptieren `circleId` request-basiert, damit die App nicht global auf dem Server umschalten muss.

### Nachrichten lesen

```http
GET /api/external/chat/circle?limit=50&circleId=circle_id
Authorization: Bearer fsp_...
```

Antwortauszug:

```json
{
  "ok": true,
  "items": [
    {
      "id": "message_id",
      "body": "Hallo",
      "createdAt": "2026-07-02T20:00:00.000Z",
      "deleted": false,
      "own": true,
      "canDelete": true,
      "permissions": { "delete": true },
      "circle": {
        "id": "circle_id",
        "name": "Maren & Gabriel"
      },
      "sender": {
        "id": "user_id",
        "displayName": "Gabriel",
        "imageUrl": "/api/files/..."
      },
      "file": {
        "id": "file_id",
        "url": "/api/files/file_id",
        "downloadPath": "/api/files/file_id",
        "originalName": "bild.png",
        "mimeType": "image/png",
        "sizeBytes": 12345,
        "kind": "image"
      },
      "receipt": {
        "deliveredAt": "2026-07-02T20:00:00.000Z",
        "readAt": "2026-07-02T20:00:00.000Z"
      },
      "receipts": [
        {
          "userId": "user_id",
          "displayName": "Maren",
          "deliveredAt": "2026-07-02T20:00:00.000Z",
          "readAt": null
        }
      ],
      "readSummary": {
        "recipients": 1,
        "delivered": 1,
        "read": 0,
        "allDelivered": true,
        "allRead": false
      }
    }
  ]
}
```

`readSummary` ist fuer WhatsApp-artige Haken gedacht: eigene Nachricht gesendet, an Empfaenger geliefert, von Empfaengern gelesen. Bei mehreren Zirkelmitgliedern sind die Werte aggregiert.

### Echtzeit-Stream

```http
GET /api/external/chat/circle/stream?circleId=circle_id&after=2026-07-02T20:00:00.000Z
Authorization: Bearer fsp_...
Accept: text/event-stream
```

Alternativ kann der Token als Query-Parameter uebergeben werden:

```http
GET /api/external/chat/circle/stream?token=fsp_...&circleId=circle_id&after=2026-07-02T20:00:00.000Z
```

Der Stream sendet Server-Sent-Events. Beim Verbinden kommt:

```json
{ "ok": true, "type": "connected", "circle": { "id": "circle_id", "name": "Maren & Gabriel" } }
```

Neue Nachrichten kommen als:

```json
{
  "ok": true,
  "type": "messages",
  "circle": { "id": "circle_id", "name": "Maren & Gabriel" },
  "items": [
    {
      "id": "message_id",
      "body": "Hallo",
      "createdAt": "2026-07-02T20:00:00.000Z",
      "sender": { "id": "user_id", "displayName": "Gabriel" }
    }
  ]
}
```

Die App soll initial `GET /api/external/chat/circle` laden, danach den Stream mit `after=<createdAt der letzten Nachricht>` oeffnen und bei Verbindungsabbruch automatisch neu verbinden. Als Fallback kann alle 2-3 Sekunden der Listen-Endpunkt mit `after` abgefragt werden. Die Web-App macht genau diese Kombination.

Fuer die Datumsanzeige liefert jede Nachricht `createdAt` als ISO-Zeitpunkt. Die App bildet daraus Tagesgruppen wie in der Web-App:

- gleicher lokaler Tag wie heute: `Heute`
- lokaler Tag gestern: `Gestern`
- sonst formatiertes Datum, z. B. `Donnerstag, 02.07.2026`
- an der Nachricht selbst die lokale Uhrzeit, z. B. `22:00`

### Nachricht senden

```http
POST /api/external/chat/circle
Authorization: Bearer fsp_...
Content-Type: application/json

{ "circleId": "circle_id", "body": "Hallo" }
```

Alternativ multipart:

```http
POST /api/external/chat/circle
Authorization: Bearer fsp_...
Content-Type: multipart/form-data

circleId=circle_id
body=Hallo
file=@bild.png
```

Die Antwort liefert `item` und zur Abwaertskompatibilitaet auch `message`, beide mit demselben serialisierten Chat-Objekt.

### Als gelesen markieren

```http
POST /api/external/chat/circle/read
Authorization: Bearer fsp_...
Content-Type: application/json

{ "circleId": "circle_id", "upToMessageId": "message_id" }
```

Alternativen:

```json
{ "messageIds": ["message_1", "message_2"] }
{ "upToCreatedAt": "2026-07-02T20:00:00.000Z" }
```

### Nachricht loeschen

```http
DELETE /api/external/chat/circle/{messageId}
Authorization: Bearer fsp_...
```

`circleId` kann optional als Query-Parameter mitgegeben werden. Fuer das Loeschen validiert das Backend aber immer am tatsaechlichen Zirkel der Nachricht. Eigene Nachrichten koennen geloescht werden; Admins koennen alle Nachrichten in zugaenglichen Zirkeln loeschen. Es ist ein Soft-Delete. Neue GET-Responses liefern geloeschte Nachrichten nicht mehr aus. Das Event heisst `circle_chat_message_deleted_api`.

Chat-Events enthalten in `details` und in nativen Push-Payloads `circleId` und `circleName`. Fuer Push-Taps kann die App damit den richtigen Chat-Zirkel oeffnen.

## Katalog fuer native Apps

Spielsachen, Szenen und deren Kategorien sind ueber eigene externe Endpunkte abrufbar. Alle Endpunkte nutzen denselben API-Token wie der Eventfeed.

### Kategorien

```http
GET /api/external/catalog/categories?kind=all
Authorization: Bearer fsp_...
```

Parameter:

- `kind`: `all`, `toy` oder `position`.

Die Antwort enthaelt eine flache `categories`-Liste und `groups` nach `toy` und `position`.

### Spielsachen

```http
GET /api/external/catalog/toys?limit=100
GET /api/external/catalog/toys/{id}
POST /api/external/catalog/toys
Authorization: Bearer fsp_...
```

Parameter:

- `q`: Suche im Titel.
- `categoryId`: Filter auf eine Kategorie.
- `positionId`: Filter auf verknuepfte Szene.
- `includeRelations=0`: Verknuepfungen ausblenden.
- `token`: optional, erzeugt `downloadUrlWithToken` fuer Bildabrufe ohne Bearer-Header.

Jeder Eintrag enthaelt `category`, `image`, `favorites`, `isFavorite`, `positions` und `activities`.
Der Detail-Endpunkt akzeptiert die interne ID oder den Slug.

`POST /api/external/catalog/toys` legt eine neue Spielsache an und gibt `201` mit `ok:true,item:{...}` im gleichen Katalog-Shape zurueck. Minimaler JSON-Body:

```json
{
  "title": "Neue Spielsache",
  "description": "Optionale Beschreibung",
  "categoryId": "optional-vorhandene-kategorie",
  "category": "oder neue Kategorie",
  "positionIds": ["optionale-szenen-id"],
  "imageUrl": "optional-bestehende-geschuetzte-bild-url"
}
```

Fuer native Apps kann derselbe Endpunkt auch `multipart/form-data` verarbeiten. Pflichtfeld ist `title`; optional sind `description`, `categoryId`/`category`, `positionIds` und das Datei-Feld `file`. Die Datei wird geschuetzt gespeichert und im Rueckgabe-Shape als normales `image`-Objekt geliefert.

### Tracker-Historie

```http
GET /api/external/trackers/history?from=YYYY-MM-DD&to=YYYY-MM-DD
GET /api/external/trackers/history?from=YYYY-MM-DD&to=YYYY-MM-DD&trackerKey=segufix
Authorization: Bearer fsp_...
```

Der Endpunkt liefert echte Tracker-Eintraege fuer Kalenderansichten, keine Protokoll-, Reminder- oder Kontingent-Ereignisse. Die Antwort enthaelt `ok`, `items[]` und optional `nextCursor`. Jedes Item liefert kompatible Alias-Felder wie `trackerKey`/`key`, `trackerTitle`/`trackerName`, `startedAt`/`startTime`, `date`/`calendarDate`, `endedAt`/`endTime`, `durationMinutes`/`minutes` und `allDay`.

Wenn `categoryId` fehlt oder ungueltig ist, wird `category`/`categoryName` verwendet oder die Standardkategorie `Allgemein` genutzt. `positionIds` werden nur verbunden, wenn das Szenen-Feature aktiv ist und die Szenen fuer den Benutzer sichtbar sind.

### Szenen

```http
GET /api/external/catalog/positions?limit=100
GET /api/external/catalog/positions/{id}
Authorization: Bearer fsp_...
```

Parameter:

- `q`: Suche im Namen.
- `categoryId`: Filter auf eine Kategorie.
- `toyId`: Filter auf verknuepftes Spielzeug.
- `selfBondage=1`: nur Self-Bondage-faehige Szenen.
- `includeRelations=0`: Verknuepfungen ausblenden.
- `token`: optional, erzeugt `downloadUrlWithToken` fuer Bildabrufe ohne Bearer-Header.

Jeder Eintrag enthaelt `category`, `image`, `favorites`, `isFavorite`, `selfBondageCapable`, `toys`, `bondageSystemItems` und `activities`.
Der Detail-Endpunkt akzeptiert die interne ID oder den Slug.

## Mobile Parity Endpunkte

Diese Endpunkte bilden die wichtigsten Portalbereiche nativ ab. Sie verwenden Bearer Auth und geben JSON zurueck.

### Spielplanung

- `GET /api/external/sessions?status=&cursor=&limit=`
- `GET /api/external/sessions/{id}`
- `POST /api/external/sessions`
- `PATCH /api/external/sessions/{id}`
- `DELETE /api/external/sessions/{id}`

`POST` akzeptiert `title`, `note`, `scheduledAt`/`plannedAt`, `status`, `toyIds[]`, `positionIds[]` und `bondageSystemItemIds[]`.

### Ideen

- `GET /api/external/ideas?status=&q=&cursor=&limit=`
- `GET /api/external/ideas/{id}`
- `POST /api/external/ideas`
- `PATCH /api/external/ideas/{id}`
- `DELETE /api/external/ideas/{id}`

`POST` akzeptiert `title`, `note`/`text`, `status`, `toyIds[]` und `positionIds[]`.

### Auftraege

- `GET /api/external/orders?status=&cursor=&limit=`
- `GET /api/external/orders/{id}`
- `POST /api/external/orders`
- `PATCH /api/external/orders/{id}`
- `POST /api/external/orders/{id}/status`

Der Status-Endpunkt akzeptiert `action=accept`, `action=complete` oder `action=cancel`.

### Bondage-System

- `GET /api/external/bondage-system?q=&cursor=&limit=`
- `GET /api/external/bondage-system/{id}`

`{id}` darf die interne ID oder der Slug des Shopify-Produkts sein.

## Sichtbarkeit

Der Eventfeed ist bewusst nicht global:

- Admins sehen Ereignisse der aktiven Seite.
- Normale Benutzer sehen Ereignisse aus ihrem sichtbaren Benutzer-/Zirkelbereich.
- Systemereignisse ohne Benutzerbezug werden aktuell nicht ausgeliefert, weil `AuditLog` noch kein eigenes `tenantId` besitzt.

## API-Control

Die Endpunkte sind in den Capabilities sichtbar und erscheinen damit auch unter `/settings/api-control`:

- `POST /api/external/auth/login`
- `POST /api/external/auth/web-session`
- `GET /api/external/points`
- `GET|POST /api/external/points/rules`
- `GET|POST /api/external/wiki`
- `GET|PATCH|DELETE /api/external/wiki/{id}`
- `GET /api/external/events`
- `GET /api/external/events/actions`
- `GET /api/external/trackers/history`
- `GET /api/external/trackers/quotas`
- `GET /api/external/catalog/categories`
- `GET|POST /api/external/catalog/toys`
- `GET /api/external/catalog/toys/{id}`
- `GET /api/external/catalog/positions`
- `GET /api/external/catalog/positions/{id}`
- `GET|POST /api/external/sessions`
- `GET|PATCH|DELETE /api/external/sessions/{id}`
- `GET|POST /api/external/ideas`
- `GET|PATCH|DELETE /api/external/ideas/{id}`
- `GET|POST /api/external/orders`
- `GET|PATCH /api/external/orders/{id}`
- `POST /api/external/orders/{id}/status`
- `GET /api/external/bondage-system`
- `GET /api/external/bondage-system/{id}`

Die API-Control-Seite zeigt Beispielpayloads, Curl-Vorlagen und Hinweise. Fuer echte App-Tests sollte der Bearer-Header genutzt werden.

## Punktesystem

Admins konfigurieren im Backend unter `Einstellungen -> Punkte`, welche Audit-Aktion wie viele Punkte gibt oder abzieht. Die Vergabe haengt zentral an `logAction`: sobald eine Aktion protokolliert wird und eine aktive Punkteregel mit ungleich `0` existiert, entsteht eine Punktbuchung fuer den ausloesenden Benutzer.

### Punkte lesen

```http
GET /api/external/points?limit=30
Authorization: Bearer fsp_...
```

Antwort:

```json
{
  "ok": true,
  "user": { "id": "user-id", "displayName": "Name", "points": 42 },
  "leaderboard": [
    { "userId": "user-id", "displayName": "Name", "points": 42, "entries": 5 }
  ],
  "entries": [
    { "action": "toy_created", "points": 5, "title": "Spielzeug angelegt", "href": "/toys/..." }
  ]
}
```

### Punkteregeln verwalten

Nur Admin-/Superadmin-Tokens:

```http
GET /api/external/points/rules
POST /api/external/points/rules
Authorization: Bearer fsp_...
Content-Type: application/json

{ "action": "toy_created", "points": 5, "active": true }
```

`GET` liefert alle bekannten Aktionen mit lesbarer Beschriftung, aktuellem Punktwert und Aktivstatus. `POST` setzt oder aktualisiert genau eine Regel.

## Wiki

Das Wiki ist ein eigenes Feature (`wiki`) und nutzt in der Weboberflaeche Benutzer-Namensraeume statt technischer IDs:

- `/wiki`
- `/wiki/{benutzerSlug}`
- `/wiki/{benutzerSlug}/{seitenSlug}`

Native Apps nutzen die IDs aus der API, bekommen aber die lesbaren Webpfade mitgeliefert:

```http
GET /api/external/wiki?limit=50&q=...
POST /api/external/wiki
GET /api/external/wiki/{id}
PATCH /api/external/wiki/{id}
DELETE /api/external/wiki/{id}
```

Beispiel fuer `POST /api/external/wiki`:

```json
{
  "title": "Ablauf",
  "content": "== Ueberschrift ==\n\n'''Wichtig''' und [[Interner Link]]",
  "visibility": "PRIVATE"
}
```

Sichtbarkeit:

- `PRIVATE`: Besitzer und Admins
- `PARTNER`: eigener Zirkel
- `SHARED`: sichtbare Benutzer der Seite

Der Seiten-Slug wird automatisch aus dem Titel erzeugt. `GET /api/external/wiki/{id}` liefert `content` als MediaWiki-Rohtext, `mediaWikiExport` als exportierbaren `.wiki`-Text, `revisions[]` als kompaktes Aenderungsprotokoll und `images[]` fuer angehaengte Wiki-Bilder. Die Weboberflaeche kann `.wiki`-Dateien importieren und exportieren.

## Hinweise fuer Weiterentwicklung

- Native APNs-Zustellung und Device-Token-Registrierung sind in [08-native-pushnachrichten.md](./08-native-pushnachrichten.md) beschrieben.
- Wenn systemweite Ereignisse ohne Actor in der App erscheinen sollen, sollte `AuditLog` ein `tenantId` bekommen.
- Die Event-API ist bewusst lesend. Likes/Kommentare laufen weiterhin ueber die bestehenden Feed-/Protokollfunktionen.
