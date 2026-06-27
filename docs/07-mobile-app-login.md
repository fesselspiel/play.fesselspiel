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
Authorization: Bearer fsp_...
```

Parameter:

- `q`: Suche im Titel.
- `categoryId`: Filter auf eine Kategorie.
- `positionId`: Filter auf verknuepfte Szene.
- `includeRelations=0`: Verknuepfungen ausblenden.
- `token`: optional, erzeugt `downloadUrlWithToken` fuer Bildabrufe ohne Bearer-Header.

Jeder Eintrag enthaelt `category`, `image`, `favorites`, `isFavorite`, `positions` und `activities`.

### Szenen

```http
GET /api/external/catalog/positions?limit=100
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

## Sichtbarkeit

Der Eventfeed ist bewusst nicht global:

- Admins sehen Ereignisse der aktiven Seite.
- Normale Benutzer sehen Ereignisse aus ihrem sichtbaren Benutzer-/Zirkelbereich.
- Systemereignisse ohne Benutzerbezug werden aktuell nicht ausgeliefert, weil `AuditLog` noch kein eigenes `tenantId` besitzt.

## API-Control

Die Endpunkte sind in den Capabilities sichtbar und erscheinen damit auch unter `/settings/api-control`:

- `POST /api/external/auth/login`
- `GET /api/external/events`
- `GET /api/external/events/actions`
- `GET /api/external/catalog/categories`
- `GET /api/external/catalog/toys`
- `GET /api/external/catalog/positions`

Die API-Control-Seite zeigt Beispielpayloads, Curl-Vorlagen und Hinweise. Fuer echte App-Tests sollte der Bearer-Header genutzt werden.

## Hinweise fuer Weiterentwicklung

- Native APNs-Zustellung und Device-Token-Registrierung sind in [08-native-pushnachrichten.md](./08-native-pushnachrichten.md) beschrieben.
- Wenn systemweite Ereignisse ohne Actor in der App erscheinen sollen, sollte `AuditLog` ein `tenantId` bekommen.
- Die Event-API ist bewusst lesend. Likes/Kommentare laufen weiterhin ueber die bestehenden Feed-/Protokollfunktionen.
